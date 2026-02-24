/**
 * 🧪 完整系统测试脚本
 * 测试数据库连接、数据完整性和 AI 功能
 */

import PocketBase from 'pocketbase';

const CONFIG = {
    PB_URL: (process.env.PB_URL || 'http://127.0.0.1:8090').trim(),
    ADMIN_EMAIL: (process.env.PB_ADMIN_EMAIL || '').trim(),
    ADMIN_PASSWORD: (process.env.PB_ADMIN_PASSWORD || '').trim(),
    AI_API_KEY: (process.env.SILICONFLOW_API_KEY || process.env.SF_API_KEY || '').trim(),
    AI_MODEL: (process.env.SILICONFLOW_MODEL || process.env.AI_MODEL || 'deepseek-ai/DeepSeek-V3').trim(),
};

if (!CONFIG.ADMIN_EMAIL || !CONFIG.ADMIN_PASSWORD) {
    console.log('❌ 缺少 PocketBase 管理员账号密码，无法执行完整测试。');
    console.log('请先设置环境变量：');
    console.log('  - PB_ADMIN_EMAIL');
    console.log('  - PB_ADMIN_PASSWORD');
    console.log('  - PB_URL（可选，默认 http://127.0.0.1:8090）');
    process.exit(1);
}

const pb = new PocketBase(CONFIG.PB_URL);

// 颜色输出
const color = {
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    blue: (s) => `\x1b[34m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

async function authenticate() {
    const response = await fetch(`${CONFIG.PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            identity: CONFIG.ADMIN_EMAIL,
            password: CONFIG.ADMIN_PASSWORD
        })
    });
    
    if (!response.ok) throw new Error('认证失败');
    const data = await response.json();
    pb.authStore.save(data.token, data.admin);
    return true;
}

async function testDatabase() {
    console.log(color.cyan('\n📊 ========== 数据库测试 ==========\n'));
    
    const tests = [];
    
    // 测试 1: 用户数据
    try {
        const users = await pb.collection('users').getFullList();
        const managers = users.filter(u => u.role === 'manager');
        const employees = users.filter(u => u.role === 'employee');
        const admins = users.filter(u => u.role === 'admin');
        
        console.log(`✅ 用户总数: ${users.length}`);
        console.log(`   - 管理员: ${admins.length}`);
        console.log(`   - 经理: ${managers.length}`);
        console.log(`   - 员工: ${employees.length}`);
        
        tests.push({ name: '用户数据', passed: users.length >= 10, count: users.length });
    } catch (e) {
        console.log(color.red(`❌ 用户数据测试失败: ${e.message}`));
        tests.push({ name: '用户数据', passed: false, error: e.message });
    }
    
    // 测试 2: 项目数据
    try {
        const projects = await pb.collection('projects').getFullList();
        console.log(`\n✅ 项目总数: ${projects.length}`);
        
        for (const p of projects) {
            console.log(`   - ${p.name}: 进度 ${p.progress || 0}%, 状态 ${p.status}`);
        }
        
        tests.push({ name: '项目数据', passed: projects.length >= 5, count: projects.length });
    } catch (e) {
        console.log(color.red(`❌ 项目数据测试失败: ${e.message}`));
        tests.push({ name: '项目数据', passed: false, error: e.message });
    }
    
    // 测试 3: 任务数据
    try {
        const tasks = await pb.collection('tasks').getFullList();
        const statusCount = {};
        const fieldsCheck = { 
            with_start_date: 0, 
            with_deadline: 0, 
            with_assignees: 0,
            with_blocker: 0 
        };
        
        tasks.forEach(t => {
            statusCount[t.status] = (statusCount[t.status] || 0) + 1;
            if (t.start_date) fieldsCheck.with_start_date++;
            if (t.deadline) fieldsCheck.with_deadline++;
            if (t.assignees && t.assignees.length > 0) fieldsCheck.with_assignees++;
            if (t.blocker) fieldsCheck.with_blocker++;
        });
        
        console.log(`\n✅ 任务总数: ${tasks.length}`);
        console.log('   状态分布:');
        Object.entries(statusCount).forEach(([status, count]) => {
            const icon = status === 'completed' ? '✓' : 
                        status === 'in_progress' ? '▶' : 
                        status === 'blocked' ? '!' : 
                        status === 'overdue' ? '⚠' : '○';
            console.log(`     ${icon} ${status}: ${count}`);
        });
        
        console.log('   字段完整性:');
        console.log(`     - 有开始日期: ${fieldsCheck.with_start_date}/${tasks.length}`);
        console.log(`     - 有截止日期: ${fieldsCheck.with_deadline}/${tasks.length}`);
        console.log(`     - 有执行人: ${fieldsCheck.with_assignees}/${tasks.length}`);
        console.log(`     - 有卡点信息: ${fieldsCheck.with_blocker}`);
        
        const hasAllStatuses = statusCount['in_progress'] > 0 && 
                               statusCount['completed'] > 0 && 
                               statusCount['pending'] > 0;
        
        tests.push({ 
            name: '任务数据', 
            passed: tasks.length >= 50 && hasAllStatuses, 
            count: tasks.length,
            statusCount 
        });
    } catch (e) {
        console.log(color.red(`❌ 任务数据测试失败: ${e.message}`));
        tests.push({ name: '任务数据', passed: false, error: e.message });
    }
    
    // 测试 4: 关联数据
    try {
        const handoffs = await pb.collection('handoffs').getFullList();
        const comments = await pb.collection('comments').getFullList();
        const auditLogs = await pb.collection('audit_logs').getFullList();
        
        console.log(`\n✅ 关联数据:`);
        console.log(`   - 交接记录: ${handoffs.length}`);
        console.log(`   - 评论: ${comments.length}`);
        console.log(`   - 审计日志: ${auditLogs.length}`);
        
        tests.push({ name: '关联数据', passed: true });
    } catch (e) {
        console.log(color.red(`❌ 关联数据测试失败: ${e.message}`));
        tests.push({ name: '关联数据', passed: false, error: e.message });
    }
    
    return tests;
}

async function testAIService() {
    console.log(color.cyan('\n🤖 ========== AI 服务测试 ==========\n'));
    
    const tests = [];

    if (!CONFIG.AI_API_KEY) {
        console.log(color.yellow('⚠️ 未设置 SILICONFLOW_API_KEY / SF_API_KEY，跳过 AI 测试。'));
        tests.push({ name: 'AI 测试（跳过）', passed: true });
        return tests;
    }
    
    // 测试 1: API 连通性
    console.log('测试 1: API 连通性...');
    try {
        const response = await fetch('https://api.siliconflow.cn/v1/models', {
            headers: { 'Authorization': `Bearer ${CONFIG.AI_API_KEY}` }
        });
        
        if (response.ok) {
            console.log(color.green('✅ API 连接成功'));
            tests.push({ name: 'API 连通性', passed: true });
        } else {
            console.log(color.red(`❌ API 连接失败: HTTP ${response.status}`));
            tests.push({ name: 'API 连通性', passed: false });
        }
    } catch (e) {
        console.log(color.red(`❌ API 连接失败: ${e.message}`));
        tests.push({ name: 'API 连通性', passed: false, error: e.message });
    }
    
    // 测试 2: 数据聚合
    console.log('\n测试 2: 数据聚合...');
    try {
        const [projects, tasks, users] = await Promise.all([
            pb.collection('projects').getFullList(),
            pb.collection('tasks').getFullList({ expand: 'assignees' }),
            pb.collection('users').getFullList(),
        ]);
        
        // 计算人员统计
        const userStats = {};
        users.forEach(u => {
            userStats[u.id] = { name: u.name || u.username, total: 0, completed: 0, blocked: 0, overdue: 0 };
        });
        
        tasks.forEach(t => {
            (t.assignees || []).forEach(uid => {
                if (userStats[uid]) {
                    userStats[uid].total++;
                    if (t.status === 'completed') userStats[uid].completed++;
                    if (t.status === 'blocked') userStats[uid].blocked++;
                    if (t.status === 'overdue') userStats[uid].overdue++;
                }
            });
        });
        
        const personnelWithTasks = Object.values(userStats).filter(u => u.total > 0);
        
        console.log(color.green(`✅ 数据聚合成功`));
        console.log(`   - 有任务的人员: ${personnelWithTasks.length}`);
        personnelWithTasks.slice(0, 5).forEach(u => {
            console.log(`     ${u.name}: ${u.total}任务, ${u.completed}完成, ${u.blocked}卡点`);
        });
        
        tests.push({ name: '数据聚合', passed: personnelWithTasks.length > 0 });
    } catch (e) {
        console.log(color.red(`❌ 数据聚合失败: ${e.message}`));
        tests.push({ name: '数据聚合', passed: false, error: e.message });
    }
    
    // 测试 3: AI 报告生成
    console.log('\n测试 3: AI 报告生成...');
    try {
        const [projects, tasks] = await Promise.all([
            pb.collection('projects').getFullList(),
            pb.collection('tasks').getFullList(),
        ]);
        
        // 简化的数据摘要
        const summary = {
            timestamp: new Date().toISOString(),
            total_projects: projects.length,
            total_tasks: tasks.length,
            status_distribution: {},
        };
        
        tasks.forEach(t => {
            summary.status_distribution[t.status] = (summary.status_distribution[t.status] || 0) + 1;
        });
        
        console.log('   发送 AI 请求...');
        
        const prompt = `
你是一位项目管理专家。请基于以下数据生成一个简短的项目状态摘要（50字以内）：

项目总数: ${summary.total_projects}
任务总数: ${summary.total_tasks}
状态分布: ${JSON.stringify(summary.status_distribution)}

请用中文回答，直接给出摘要，不要解释。
`;
        
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.AI_API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.AI_MODEL,
                messages: [{ role: "user", content: prompt }],
                max_tokens: 200
            })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }
        
        const json = await response.json();
        const aiContent = json.choices?.[0]?.message?.content;
        
        if (aiContent) {
            console.log(color.green('✅ AI 报告生成成功'));
            console.log(color.yellow(`   AI 回复: "${aiContent.trim()}"`));
            tests.push({ name: 'AI 报告生成', passed: true, content: aiContent });
        } else {
            throw new Error('AI 返回内容为空');
        }
    } catch (e) {
        console.log(color.red(`❌ AI 报告生成失败: ${e.message}`));
        tests.push({ name: 'AI 报告生成', passed: false, error: e.message });
    }
    
    return tests;
}

async function runAllTests() {
    console.log('═══════════════════════════════════════════════════');
    console.log('     🧪 工程项目管理系统 - 完整测试');
    console.log('═══════════════════════════════════════════════════');
    
    // 认证
    console.log('\n🔑 认证中...');
    try {
        await authenticate();
        console.log(color.green('✅ 认证成功'));
    } catch (e) {
        console.log(color.red(`❌ 认证失败: ${e.message}`));
        return;
    }
    
    // 运行测试
    const dbTests = await testDatabase();
    const aiTests = await testAIService();
    
    // 总结
    console.log(color.cyan('\n📋 ========== 测试总结 ==========\n'));
    
    const allTests = [...dbTests, ...aiTests];
    const passed = allTests.filter(t => t.passed).length;
    const failed = allTests.filter(t => !t.passed).length;
    
    console.log(`总测试: ${allTests.length}`);
    console.log(color.green(`通过: ${passed}`));
    if (failed > 0) {
        console.log(color.red(`失败: ${failed}`));
    }
    
    console.log('\n详细结果:');
    allTests.forEach(t => {
        const icon = t.passed ? color.green('✅') : color.red('❌');
        console.log(`  ${icon} ${t.name}${t.count ? ` (${t.count}条)` : ''}`);
        if (t.error) console.log(color.red(`      错误: ${t.error}`));
    });
    
    console.log('\n═══════════════════════════════════════════════════');
    if (failed === 0) {
        console.log(color.green('  🎉 所有测试通过！系统运行正常'));
    } else {
        console.log(color.yellow('  ⚠️ 部分测试失败，请检查上述错误'));
    }
    console.log('═══════════════════════════════════════════════════\n');
}

runAllTests().catch(console.error);
