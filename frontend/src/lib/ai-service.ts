import { pb, PB_URL } from './pocketbase';
import dayjs from 'dayjs';
import { TaskStatusEnum } from './api';

/**
 * Bug fix C1（Agent D v2 HIGH-CRITICAL）：通过 PB 服务端代理调用 LLM。
 *
 * 旧路径：浏览器 → siliconflow API（apiKey 从 localStorage 读，明文暴露）
 * 新路径：浏览器 → PB /api/custom/llm-proxy → siliconflow API
 *         （apiKey 只存 PB app_settings collection，浏览器无感知）
 *
 * 旧调用 signature 兼容：`apiKey` 参数仍保留但**已废弃**（PB 代理优先）。
 * 部署后若 PB 代理失败 → fallback 到旧直连（兼容未完成迁移的环境）。
 */
async function callLLMViaProxy(model: string, messages: Array<{role: string; content: string}>, options: { response_format?: { type: string }, temperature?: number, max_tokens?: number } = {}): Promise<unknown> {
    const url = `${PB_URL.replace(/\/+$/, '')}/api/custom/llm-proxy`
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': pb.authStore.token,
        },
        body: JSON.stringify({
            model,
            messages,
            response_format: options.response_format,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
        }),
    })
    if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`PB proxy LLM call failed: HTTP ${resp.status} ${text.slice(0, 200)}`)
    }
    return resp.json()
}

async function callLLMDirect(apiKey: string, model: string, messages: Array<{role: string; content: string}>, options: { response_format?: { type: string }, temperature?: number, max_tokens?: number } = {}): Promise<unknown> {
    // Legacy path: direct call from browser. Only used when PB proxy is unavailable
    // AND user provided an apiKey via legacy localStorage. Strongly discouraged.
    const resp = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            response_format: options.response_format,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens ?? 2000,
        }),
    })
    if (!resp.ok) {
        throw new Error(await resp.text())
    }
    return resp.json()
}

/**
 * 优先 PB 代理；失败时若有 apiKey 则 fallback 到直连（兼容旧部署）
 */
async function callLLM(apiKey: string | undefined, model: string, messages: Array<{role: string; content: string}>, options: { response_format?: { type: string }, temperature?: number, max_tokens?: number } = {}): Promise<unknown> {
    try {
        return await callLLMViaProxy(model, messages, options)
    } catch (e) {
        // PB proxy unavailable (503 / network / not-yet-deployed)
        if (apiKey) {
            console.warn('[ai-service] PB proxy failed, fallback to direct (LEGACY, insecure):', e)
            return await callLLMDirect(apiKey, model, messages, options)
        }
        throw e
    }
}

// ========== 统一状态判断 ==========
const isInProgress = (status: string) => 
    status === TaskStatusEnum.IN_PROGRESS || status === 'processing'; // 兼容旧数据

const isCompleted = (status: string) => status === TaskStatusEnum.COMPLETED;
const isBlocked = (status: string) => status === TaskStatusEnum.BLOCKED;
const isOverdue = (status: string) => status === TaskStatusEnum.OVERDUE;
const isPending = (status: string) => status === TaskStatusEnum.PENDING;

// Aggregate data for the AI prompt
export const aggregateProjectData = async () => {
    const userId = pb.authStore.model?.id;
    if (!userId) throw new Error("User not logged in");

    // Fetch all relevant data
    const [allProjects, allTasks, users] = await Promise.all([
        pb.collection('projects').getFullList({ sort: '-created' }),
        pb.collection('tasks').getFullList({ expand: 'assignees,project', sort: '-created' }),
        pb.collection('users').getFullList(),
    ]);

    // 排除归档项目的数据
    const archivedIds = new Set(allProjects.filter((p: any) => p.status === 'archived').map((p: any) => p.id))
    const projects = allProjects.filter((p: any) => p.status !== 'archived')
    const tasks = allTasks.filter((t: any) => !archivedIds.has(t.project))

    // Calculate Team Stats - 优化：确保所有用户都被统计
    const userStats: Record<string, any> = {};
    users.forEach(u => {
        userStats[u.id] = { 
            name: u.name || u.username, 
            department: u.department || '未分配',
            role: u.role || 'employee',
            total: 0, 
            overdue: 0, 
            completed: 0, 
            active: 0, 
            blocked: 0,
            pending: 0
        };
    });

    tasks.forEach((t: any) => {
        // 直接使用 assignees 字段（数组）
        const assigneeIds = t.assignees || [];
        assigneeIds.forEach((uid: string) => {
            if (userStats[uid]) {
                userStats[uid].total++;
                if (isOverdue(t.status)) userStats[uid].overdue++;
                if (isCompleted(t.status)) userStats[uid].completed++;
                if (isInProgress(t.status)) userStats[uid].active++;
                if (isBlocked(t.status)) userStats[uid].blocked++;
                if (isPending(t.status)) userStats[uid].pending++;
            }
        });
        
        // 也统计 expand 中的 assignees（兼容两种数据结构）
        const expandedAssignees = t.expand?.assignees || [];
        expandedAssignees.forEach((u: any) => {
            if (userStats[u.id] && !assigneeIds.includes(u.id)) {
                userStats[u.id].total++;
                if (isOverdue(t.status)) userStats[u.id].overdue++;
                if (isCompleted(t.status)) userStats[u.id].completed++;
                if (isInProgress(t.status)) userStats[u.id].active++;
                if (isBlocked(t.status)) userStats[u.id].blocked++;
                if (isPending(t.status)) userStats[u.id].pending++;
            }
        });
    });

    // 只返回有任务的用户统计，并按任务数排序
    const personnelPerformance = Object.values(userStats)
        .filter((u: any) => u.total > 0)
        .map((u: any) => ({
            name: u.name,
            department: u.department,
            role: u.role,
            assigned_tasks: u.total,
            completed: u.completed,
            overdue: u.overdue,
            active: u.active,
            blocked: u.blocked,
            pending: u.pending,
            efficiency_rate: u.total > 0 ? ((u.completed / u.total) * 100).toFixed(1) + '%' : '0%',
            risk_score: u.overdue * 3 + u.blocked * 2 // 风险评分
        }))
        .sort((a, b) => b.assigned_tasks - a.assigned_tasks);

    // Calculate Project Risks - 增强风险分析
    const projectRisks = projects.map((p: any) => {
        const pTasks = tasks.filter((t: any) => t.project === p.id);
        const blockedTasks = pTasks.filter((t: any) => isBlocked(t.status));
        const overdueTasks = pTasks.filter((t: any) => isOverdue(t.status));
        const inProgressTasks = pTasks.filter((t: any) => isInProgress(t.status));
        const completedTasks = pTasks.filter((t: any) => isCompleted(t.status));

        return {
            name: p.name,
            code: p.code,
            progress: p.progress || 0,
            total_tasks: pTasks.length,
            completed_count: completedTasks.length,
            in_progress_count: inProgressTasks.length,
            blocked_count: blockedTasks.length,
            overdue_count: overdueTasks.length,
            blockers: blockedTasks.map((t: any) => ({ 
                task: t.stage_name, 
                reason: t.blocker?.reason_detail || t.blocker?.reason_type || '原因未知',
                expected_resolve: t.blocker?.expected_resolve
            })),
            overdue_tasks: overdueTasks.map((t: any) => ({
                task: t.stage_name,
                deadline: t.deadline
            })),
            status: p.status,
            risk_level: overdueTasks.length > 2 || blockedTasks.length > 1 ? 'high' : 
                        overdueTasks.length > 0 || blockedTasks.length > 0 ? 'medium' : 'low'
        };
    });

    // 计算全局统计
    const globalStats = {
        total_tasks: tasks.length,
        pending: tasks.filter((t: any) => isPending(t.status)).length,
        in_progress: tasks.filter((t: any) => isInProgress(t.status)).length,
        blocked: tasks.filter((t: any) => isBlocked(t.status)).length,
        completed: tasks.filter((t: any) => isCompleted(t.status)).length,
        overdue: tasks.filter((t: any) => isOverdue(t.status)).length,
    };

    return {
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        manager: pb.authStore.model?.name || pb.authStore.model?.username,
        manager_role: pb.authStore.model?.role,
        total_projects: projects.length,
        active_projects: projects.filter((p: any) => p.status === 'active').length,
        project_risks: projectRisks,
        personnel_performance: personnelPerformance,
        global_stats: globalStats,
        // 计算整体风险等级
        overall_risk: globalStats.overdue > 5 || globalStats.blocked > 3 ? 'high' :
                      globalStats.overdue > 2 || globalStats.blocked > 1 ? 'medium' : 'low'
    };
};

export const generateAIReport = async (data: any, apiKey: string, model: string = "deepseek-ai/DeepSeek-V3") => {
    const prompt = `
# 角色
你是一位资深的工程项目管理总监，正在分析项目管理数据并为管理层提供决策支持。

# 输入数据
${JSON.stringify(data, null, 2)}

# 分析任务
基于以上实时数据，生成一份专业的项目分析报告。请用中文回答。

## 分析要点：
1. **整体风险评估**: 基于逾期任务(overdue)和卡点任务(blocked)的数量判断风险等级
2. **关键问题识别**: 找出具体的卡点任务及其原因
3. **人员绩效分析**: 
   - 找出任务最多的员工（工作负载）
   - 找出逾期/卡点最多的员工（需要关注）
   - 找出完成率最高的员工（表现优秀）
   - **必须具体点名，引用数据中的真实姓名**
4. **项目进度**: 分析各项目的进度和风险状态
5. **行动建议**: 给出3-5条可执行的建议

## 报告格式要求：
- 使用 Markdown 格式
- 结构清晰，重点突出
- 数据要具体（引用真实数字）
- 人名要具体（不要说"某员工"）

# 输出 JSON 格式
{
    "risk_level": "low" | "medium" | "high",
    "content": "Markdown格式的完整报告..."
}
`;

    try {
        // C1: 改用 callLLM 统一调用 — 优先 PB 代理（apiKey 不外泄），失败 fallback 直连
        const json = await callLLM(apiKey, model, [{ role: "user", content: prompt }], {
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 2000,
        }) as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content;
        
        if (!content) {
            throw new Error("AI 返回内容为空");
        }
        
        try {
            // 清理可能的 markdown 代码块包裹
            let cleanContent = content.trim();
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/```$/, '').trim();
            } else if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```\n?/, '').replace(/```$/, '').trim();
            }
            
            return JSON.parse(cleanContent);
        } catch {
            // 如果 JSON 解析失败，尝试从内容中提取 JSON
            console.warn("JSON 解析失败，尝试提取内容:", content);
            const jsonMatch = content?.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch {
                    // 继续回退方案
                }
            }
            return {
                risk_level: data.overall_risk || 'medium',
                content: content
            };
        }
    } catch (e) {
        console.error("AI Call Failed", e);
        throw e;
    }
};

export const chatWithAI = async (message: string, context: unknown, history: Array<{role: string; content: string}>, apiKey: string, model: string = "deepseek-ai/DeepSeek-V3") => {
    const messages = [
        { role: "system", content: `你是一位专业的项目管理助手。以下是实时项目数据：${JSON.stringify(context)}。请基于这些数据回答用户的问题，用中文回答。如果被问到绩效相关问题，请引用 personnel_performance 中的具体数字和人名。` },
        ...history,
        { role: "user", content: message }
    ];

    // C1: PB 代理优先
    const json = await callLLM(apiKey, model, messages) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content || '无响应';
};
