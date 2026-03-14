/**
 * 🔧 修复AI功能并添加员工头像
 * 
 * 运行：node fix_ai_and_avatars.mjs
 */

import PocketBase from 'pocketbase';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
    PB_URL: (process.env.PB_URL || 'http://127.0.0.1:8090').trim(),
    ADMIN_EMAIL: (process.env.PB_ADMIN_EMAIL || '').trim(),
    ADMIN_PASSWORD: (process.env.PB_ADMIN_PASSWORD || '').trim(),
    AI_API_KEY: (process.env.SILICONFLOW_API_KEY || process.env.SF_API_KEY || '').trim(),
    AI_MODEL: (process.env.SILICONFLOW_MODEL || process.env.AI_MODEL || 'deepseek-ai/DeepSeek-V3').trim(),
};

const pb = new PocketBase(CONFIG.PB_URL);

// 颜色输出
const log = {
    info: (msg) => console.log(`\x1b[36m${msg}\x1b[0m`),
    success: (msg) => console.log(`\x1b[32m${msg}\x1b[0m`),
    warn: (msg) => console.log(`\x1b[33m${msg}\x1b[0m`),
    error: (msg) => console.log(`\x1b[31m${msg}\x1b[0m`),
};

if (!CONFIG.ADMIN_EMAIL || !CONFIG.ADMIN_PASSWORD) {
    log.error('❌ 缺少 PocketBase 管理员账号密码。请先设置环境变量：PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD');
    log.error('   （可选）PB_URL，默认 http://127.0.0.1:8090');
    process.exit(1);
}

async function authenticate() {
    log.info('🔑 正在连接 PocketBase...');
    
    try {
        const response = await fetch(`${CONFIG.PB_URL}/api/admins/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identity: CONFIG.ADMIN_EMAIL,
                password: CONFIG.ADMIN_PASSWORD
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        pb.authStore.save(data.token, data.admin);
        log.success('✅ 认证成功\n');
        return true;
    } catch (e) {
        log.error(`❌ 认证失败: ${e.message}`);
        return false;
    }
}

// ========== 测试 AI API ==========
async function testAI() {
    log.info('🤖 ========== 测试 AI API ==========\n');

    if (!CONFIG.AI_API_KEY) {
        log.warn('⚠️ 未设置 SILICONFLOW_API_KEY / SF_API_KEY，跳过 AI API 测试。');
        return true;
    }
    
    try {
        // 1. 测试 API 连通性
        log.info('1. 测试 API 连通性...');
        const modelsRes = await fetch('https://api.siliconflow.cn/v1/models', {
            headers: { 'Authorization': `Bearer ${CONFIG.AI_API_KEY}` }
        });
        
        if (modelsRes.ok) {
            log.success('   ✅ API 连接成功');
        } else {
            log.error(`   ❌ API 连接失败: HTTP ${modelsRes.status}`);
            return false;
        }
        
        // 2. 测试简单对话
        log.info('2. 测试简单对话...');
        const chatRes = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.AI_API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.AI_MODEL,
                messages: [{ role: "user", content: "你好，请用一句话介绍自己" }],
                max_tokens: 100
            })
        });
        
        if (!chatRes.ok) {
            const errText = await chatRes.text();
            log.error(`   ❌ 对话测试失败: ${errText}`);
            return false;
        }
        
        const chatJson = await chatRes.json();
        const reply = chatJson.choices?.[0]?.message?.content;
        log.success(`   ✅ 对话成功: "${reply?.substring(0, 50)}..."`);
        
        // 3. 测试 JSON 格式输出
        log.info('3. 测试 JSON 格式输出...');
        const jsonRes = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.AI_API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.AI_MODEL,
                messages: [{ 
                    role: "user", 
                    content: '请返回一个JSON对象，包含risk_level(low/medium/high)和content字段。content内容是"测试成功"。只返回JSON，不要其他内容。'
                }],
                response_format: { type: "json_object" },
                max_tokens: 200
            })
        });
        
        if (!jsonRes.ok) {
            const errText = await jsonRes.text();
            log.warn(`   ⚠️ JSON格式测试失败: ${errText}`);
            log.warn('   可能需要使用普通对话模式');
        } else {
            const jsonData = await jsonRes.json();
            const content = jsonData.choices?.[0]?.message?.content;
            log.success(`   ✅ JSON 输出: ${content?.substring(0, 80)}`);
            
            try {
                const parsed = JSON.parse(content);
                log.success(`   ✅ JSON 解析成功: risk_level=${parsed.risk_level}`);
            } catch (e) {
                log.warn('   ⚠️ JSON 解析失败，将使用回退方案');
            }
        }
        
        return true;
    } catch (e) {
        log.error(`❌ AI 测试失败: ${e.message}`);
        return false;
    }
}

// ========== 生成测试AI报告 ==========
async function generateTestReport() {
    log.info('\n📊 ========== 生成测试 AI 报告 ==========\n');
    
    try {
        // 获取数据
        const [projects, tasks, users] = await Promise.all([
            pb.collection('projects').getFullList(),
            pb.collection('tasks').getFullList(),
            pb.collection('users').getFullList(),
        ]);
        
        // 计算统计
        const statusCount = {};
        tasks.forEach(t => {
            statusCount[t.status] = (statusCount[t.status] || 0) + 1;
        });
        
        const summary = {
            timestamp: new Date().toISOString(),
            total_projects: projects.length,
            total_tasks: tasks.length,
            status_distribution: statusCount,
            users_count: users.length
        };
        
        log.info(`数据摘要: ${JSON.stringify(summary)}`);
        
        // 调用 AI
        log.info('调用 AI 生成报告...');
        const prompt = `
你是一位项目管理专家。请基于以下数据生成一份简短的项目状态报告（100字以内，中文）：

项目总数: ${summary.total_projects}
任务总数: ${summary.total_tasks}
状态分布: ${JSON.stringify(summary.status_distribution)}

请返回JSON格式：{"risk_level": "low/medium/high", "content": "报告内容..."}
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
                max_tokens: 500
            })
        });
        
        if (!response.ok) {
            throw new Error(`AI API 错误: ${await response.text()}`);
        }
        
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        
        log.success(`AI 原始响应: ${content?.substring(0, 200)}`);
        
        // 解析响应
        let report;
        try {
            // 尝试直接解析 JSON
            report = JSON.parse(content);
        } catch (e) {
            // 尝试从文本中提取 JSON
            const jsonMatch = content?.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                report = JSON.parse(jsonMatch[0]);
            } else {
                report = {
                    risk_level: statusCount['blocked'] > 0 || statusCount['overdue'] > 0 ? 'medium' : 'low',
                    content: content || '无法生成报告'
                };
            }
        }
        
        log.success(`\n✅ 报告生成成功:`);
        log.info(`   风险等级: ${report.risk_level}`);
        log.info(`   内容: ${report.content?.substring(0, 100)}...`);
        
        // 保存到数据库
        log.info('\n保存报告到数据库...');
        
        // 获取一个经理用户
        const manager = users.find(u => u.role === 'manager' || u.role === 'admin');
        if (manager) {
            const saved = await pb.collection('ai_summaries').create({
                target_user: manager.id,
                date: new Date().toISOString(),
                content: report.content,
                risk_level: report.risk_level,
                model_used: CONFIG.AI_MODEL,
                input_snapshot: summary
            });
            log.success(`✅ 报告已保存, ID: ${saved.id}`);
        } else {
            log.warn('⚠️ 未找到经理用户，跳过保存');
        }
        
        return true;
    } catch (e) {
        log.error(`❌ 报告生成失败: ${e.message}`);
        console.error(e);
        return false;
    }
}

// 从中文姓名推断性别（常见女性用字）
const FEMALE_CHARS = '芳萍欣娟丽艳敏玲琴红梅燕霞芬琳娜婷慧颖静雪璐瑶蕾薇妍菲晶露淑英秀珍玉凤云莲香兰菊翠桂娥妹娣娇';
function inferGender(name) {
    if (!name || typeof name !== 'string') return 'male';
    const n = String(name).replace(/\s*\([^)]*\)/g, '').trim();
    const lastChar = n.slice(-1);
    if (FEMALE_CHARS.includes(lastChar)) return 'female';
    if (/[师员]/.test(n) && n.length >= 3) return 'male';
    return 'male';
}

// ========== 添加员工头像 ==========
// AVATAR_STYLE=cartoon 专业卡通（Personas，符合性别）| text 文字全名（UI Avatars）
async function addAvatars() {
    const style = (process.env.AVATAR_STYLE || 'cartoon').toLowerCase();
    const forceReplace = process.env.AVATAR_REPLACE_ALL === '1' || process.env.AVATAR_REPLACE_ALL === 'true';
    
    log.info(`\n👤 ========== 添加员工头像（${style === 'cartoon' ? '专业卡通' : '文字全名'}）==========\n`);
    if (forceReplace) log.info('   ℹ️ AVATAR_REPLACE_ALL=1，将替换所有用户头像\n');
    
    const getAvatarUrl = (seed, gender) => {
        if (style === 'text') {
            const colors = ['2563eb', '475569', '1e40af', '334155'];
            const color = colors[Math.abs(String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length];
            const len = Math.min(4, Math.max(2, seed.length));
            return `https://ui-avatars.com/api/?name=${encodeURIComponent(seed)}&length=${len}&size=256&background=${color}&color=fff&bold=true&rounded=true&uppercase=false&format=svg`;
        }
        const isFemale = gender === 'female';
        const hair = isFemale ? 'long,bobCut,pigtails,curly,bobBangs,curlyBun,straightBun' : 'buzzcut,shortCombover,fade,bald,balding';
        const params = new URLSearchParams({
            seed, hair, radius: '50', backgroundType: 'solid',
            eyes: 'open,glasses,happy', mouth: 'smile,smirk',
            body: 'rounded', clothingColor: '456dff,475569',
            facialHairProbability: isFemale ? '0' : '35',
            backgroundColor: 'e8eef5,f1f5f9',
        });
        return `https://api.dicebear.com/7.x/personas/svg?${params}`;
    };
    
    try {
        const users = await pb.collection('users').getFullList();
        let updatedCount = 0;
        
        for (const user of users) {
            const shouldUpdate = forceReplace || !user.avatar;
            if (shouldUpdate) {
                try {
                    const seed = (user.name || user.username).replace(/\s*\([^)]*\)/g, '').trim() || user.username;
                    const gender = inferGender(user.name || user.username);
                    const avatarUrl = getAvatarUrl(seed, gender);
                    const avatarRes = await fetch(avatarUrl);
                    if (!avatarRes.ok) continue;
                    const svgContent = await avatarRes.text();
                    const formData = new FormData();
                    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                    formData.append('avatar', blob, `${user.username}_avatar.svg`);
                    await pb.collection('users').update(user.id, formData);
                    log.success(`   ✅ ${seed} 头像已${user.avatar ? '替换' : '添加'}`);
                    updatedCount++;
                } catch (e) {
                    log.warn(`   ⚠️ ${user.name || user.username} 头像添加失败: ${e.message}`);
                }
            } else {
                log.info(`   ℹ️ ${user.name || user.username} 已有头像，跳过`);
            }
        }
        
        log.success(`\n✅ 头像更新完成: ${updatedCount}/${users.length}`);
        return true;
    } catch (e) {
        log.error(`❌ 添加头像失败: ${e.message}`);
        return false;
    }
}

// ========== 主函数 ==========
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('     🔧 修复 AI 功能并添加员工头像');
    console.log('═══════════════════════════════════════════════════\n');
    
    // 1. 认证
    if (!await authenticate()) return;
    
    // 2. 测试 AI
    const aiOk = await testAI();
    
    // 3. 生成测试报告
    if (aiOk) {
        await generateTestReport();
    }
    
    // 4. 添加头像
    await addAvatars();
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  🎉 修复完成！');
    console.log('═══════════════════════════════════════════════════');
    console.log(`
📱 下一步操作：
1. 在浏览器中打开应用
2. 登录经理账号 (zhang_manager / 12345678)
3. 进入"AI决策"页面
4. 确保 API Key 已配置：
   localStorage.setItem('sf_api_key', '${CONFIG.AI_API_KEY}')
5. 点击"立即更新分析"按钮
`);
}

main().catch(console.error);
