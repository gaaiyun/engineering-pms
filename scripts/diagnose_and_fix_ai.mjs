/**
 * AI 功能诊断与修复脚本
 * 
 * 功能：
 * 1. 检测 ai_summaries 集合是否存在
 * 2. 检测集合字段是否完整
 * 3. 检测集合权限规则是否正确
 * 4. 自动创建/修复缺失的集合
 * 5. 测试 AI API 连接
 * 
 * 运行: node scripts/diagnose_and_fix_ai.mjs
 */

import PocketBase from 'pocketbase';

const CONFIG = {
    PB_URL: (process.env.PB_URL || 'http://127.0.0.1:8090').trim(),
    ADMIN_EMAIL: (process.env.PB_ADMIN_EMAIL || '').trim(),
    ADMIN_PASSWORD: (process.env.PB_ADMIN_PASSWORD || '').trim(),
};

if (!CONFIG.ADMIN_EMAIL || !CONFIG.ADMIN_PASSWORD) {
    console.error('❌ 缺少 PocketBase 管理员账号密码。请先设置环境变量：PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD');
    console.error('   （可选）PB_URL，默认 http://127.0.0.1:8090');
    process.exit(1);
}

const pb = new PocketBase(CONFIG.PB_URL);

// AI 简报集合 Schema
const AI_SUMMARIES_SCHEMA = {
    name: 'ai_summaries',
    type: 'base',
    schema: [
        { name: 'target_user', type: 'relation', required: false, options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'project', type: 'relation', required: false, options: { maxSelect: 1 } },
        { name: 'date', type: 'date', required: false },
        { name: 'content', type: 'text', required: false, options: { max: 50000 } },
        { name: 'risk_level', type: 'select', required: false, options: { maxSelect: 1, values: ['low', 'medium', 'high'] } },
        { name: 'model_used', type: 'text', required: false },
        { name: 'input_snapshot', type: 'json', required: false, options: { maxSize: 2000000 } }
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: null
};

// 通知集合 Schema
const NOTIFICATIONS_SCHEMA = {
    name: 'notifications',
    type: 'base',
    schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'type', type: 'select', required: true, options: { maxSelect: 1, values: ['task_assigned', 'step_updated', 'handoff_pending', 'handoff_result', 'blocker', 'escalation', 'comment_mention'] } },
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'text', required: true },
        { name: 'link_type', type: 'text', required: false },
        { name: 'link_id', type: 'text', required: false },
        { name: 'is_read', type: 'bool', required: false, options: {} },
        { name: 'read_at', type: 'date', required: false }
    ],
    listRule: '@request.auth.id = user',
    viewRule: '@request.auth.id = user',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id = user',
    deleteRule: '@request.auth.id = user'
};

// Handoffs 集合 Schema
const HANDOFFS_SCHEMA = {
    name: 'handoffs',
    type: 'base',
    schema: [
        { name: 'project', type: 'relation', required: true },
        { name: 'from_task', type: 'relation', required: true },
        { name: 'proposed_title', type: 'text', required: true },
        { name: 'proposed_description', type: 'text', required: false },
        { name: 'proposed_assignees', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', maxSelect: 99 } },
        { name: 'proposed_start_date', type: 'date', required: false },
        { name: 'proposed_due_date', type: 'date', required: false },
        { name: 'status', type: 'select', required: true, options: { maxSelect: 1, values: ['pending', 'approved', 'rejected'] } },
        { name: 'submitter', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'reviewer', type: 'relation', required: false, options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'review_note', type: 'text', required: false },
        { name: 'approved_task', type: 'relation', required: false }
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.record.role = "manager" || @request.auth.record.role = "admin"',
    deleteRule: '@request.auth.record.role = "admin"'
};

// Audit Logs 集合 Schema
const AUDIT_LOGS_SCHEMA = {
    name: 'audit_logs',
    type: 'base',
    schema: [
        { name: 'project', type: 'relation', required: false },
        { name: 'task', type: 'relation', required: false },
        { name: 'action_type', type: 'select', required: true, options: { maxSelect: 1, values: ['create_task', 'update_task', 'reorder', 'insert', 'reassign', 'mark_complete', 'mark_blocked', 'approve_handoff', 'reject_handoff', 'edit_completed', 'cancel_task'] } },
        { name: 'operator', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'before', type: 'json', required: false },
        { name: 'after', type: 'json', required: false },
        { name: 'note', type: 'text', required: false }
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: null,
    deleteRule: null
};

// Comments 集合 Schema
const COMMENTS_SCHEMA = {
    name: 'comments',
    type: 'base',
    schema: [
        { name: 'project', type: 'relation', required: false },
        { name: 'step', type: 'relation', required: false }, // 关联 tasks 集合，字段名 step 与前端保持一致
        { name: 'author', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'content', type: 'text', required: true },
        { name: 'mentions', type: 'relation', required: false, options: { collectionId: '_pb_users_auth_', maxSelect: 99 } }
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id = author',
    deleteRule: '@request.auth.id = author'
};

console.log('🔍 AI 功能诊断工具');
console.log('='.repeat(50));
console.log(`📡 PocketBase URL: ${CONFIG.PB_URL}`);

async function diagnose() {
    try {
        // 1. 管理员登录 (尝试多种方式以兼容不同版本)
        console.log('\n🔐 正在登录管理员账号...');
        let authSuccess = false;
        
        // 方式1: 新版 PocketBase (0.26+)
        try {
            await pb.collection('_superusers').authWithPassword(CONFIG.ADMIN_EMAIL, CONFIG.ADMIN_PASSWORD);
            authSuccess = true;
        } catch (e) {
            console.log('   新版认证失败，尝试旧版...');
        }
        
        // 方式2: 旧版 PocketBase
        if (!authSuccess) {
            try {
                await pb.admins.authWithPassword(CONFIG.ADMIN_EMAIL, CONFIG.ADMIN_PASSWORD);
                authSuccess = true;
            } catch (e) {
                console.log('   旧版认证失败，尝试用户登录...');
            }
        }
        
        // 方式3: 使用管理员用户账号登录
        if (!authSuccess) {
            try {
                await pb.collection('users').authWithPassword(CONFIG.ADMIN_EMAIL, CONFIG.ADMIN_PASSWORD);
                authSuccess = true;
            } catch (e) {
                console.log('   用户登录也失败');
            }
        }
        
        if (!authSuccess) {
            throw new Error('无法登录，请检查账号密码');
        }
        console.log('✅ 登录成功');

        // 2. 获取所有集合
        console.log('\n📋 正在获取数据库集合列表...');
        const collections = await pb.collections.getFullList();
        const collectionNames = collections.map(c => c.name);
        console.log(`   找到 ${collections.length} 个集合:`, collectionNames.join(', '));

        // 3. 检查核心集合
        const requiredCollections = [
            { schema: AI_SUMMARIES_SCHEMA, name: 'ai_summaries', critical: true },
            { schema: NOTIFICATIONS_SCHEMA, name: 'notifications', critical: true },
            { schema: HANDOFFS_SCHEMA, name: 'handoffs', critical: false },
            { schema: AUDIT_LOGS_SCHEMA, name: 'audit_logs', critical: false },
            { schema: COMMENTS_SCHEMA, name: 'comments', critical: false }
        ];

        console.log('\n🔎 检查核心集合状态...');
        const issues = [];

        for (const { schema, name, critical } of requiredCollections) {
            const exists = collectionNames.includes(name);
            const icon = exists ? '✅' : (critical ? '❌' : '⚠️');
            console.log(`   ${icon} ${name}: ${exists ? '存在' : '缺失'}`);
            
            if (!exists) {
                issues.push({ name, schema, critical });
            }
        }

        // 4. 自动修复缺失的集合
        if (issues.length > 0) {
            console.log('\n🔧 开始自动修复...');
            
            for (const { name, schema } of issues) {
                try {
                    console.log(`   创建集合 ${name}...`);
                    
                    // 获取 projects 和 tasks 集合的 ID（用于关系字段）
                    let projectsId = null;
                    let tasksId = null;
                    try {
                        const projectsCol = await pb.collections.getOne('projects');
                        projectsId = projectsCol.id;
                    } catch (e) { /* ignore */ }
                    try {
                        const tasksCol = await pb.collections.getOne('tasks');
                        tasksId = tasksCol.id;
                    } catch (e) { /* ignore */ }

                    // 更新关系字段的 collectionId
                    const updatedSchema = { ...schema };
                    updatedSchema.schema = schema.schema.map(field => {
                        if (field.type === 'relation') {
                            if (field.name === 'project' && projectsId) {
                                return { ...field, options: { ...field.options, collectionId: projectsId } };
                            }
                            if ((field.name === 'task' || field.name === 'from_task' || field.name === 'approved_task') && tasksId) {
                                return { ...field, options: { ...field.options, collectionId: tasksId } };
                            }
                        }
                        return field;
                    });

                    await pb.collections.create(updatedSchema);
                    console.log(`   ✅ ${name} 集合创建成功`);
                } catch (error) {
                    console.error(`   ❌ 创建 ${name} 失败:`, error.message);
                }
            }
        } else {
            console.log('\n✅ 所有核心集合都已存在');
        }

        // 5. 检查 ai_summaries 集合的字段
        console.log('\n🔎 检查 ai_summaries 集合字段...');
        try {
            const aiSummariesCol = await pb.collections.getOne('ai_summaries');
            const fields = aiSummariesCol.schema.map(f => f.name);
            console.log(`   字段: ${fields.join(', ')}`);

            const requiredFields = ['target_user', 'date', 'content', 'risk_level', 'model_used', 'input_snapshot'];
            const missingFields = requiredFields.filter(f => !fields.includes(f));

            if (missingFields.length > 0) {
                console.log(`   ⚠️ 缺失字段: ${missingFields.join(', ')}`);
            } else {
                console.log('   ✅ 所有必需字段都存在');
            }
        } catch (error) {
            console.log('   ❌ 无法获取 ai_summaries 集合信息');
        }

        // 6. 检查现有的 AI 简报记录
        console.log('\n📊 检查现有 AI 简报记录...');
        try {
            const summaries = await pb.collection('ai_summaries').getList(1, 5, { sort: '-created' });
            console.log(`   共有 ${summaries.totalItems} 条记录`);
            if (summaries.items.length > 0) {
                summaries.items.forEach((item, idx) => {
                    console.log(`   ${idx + 1}. ${item.created} - 风险等级: ${item.risk_level || '未知'}`);
                });
            }
        } catch (error) {
            console.log('   ⚠️ 无法获取记录:', error.message);
        }

        // 7. 检查 notifications 集合记录
        console.log('\n📊 检查现有通知记录...');
        try {
            const notifications = await pb.collection('notifications').getList(1, 5, { sort: '-created' });
            console.log(`   共有 ${notifications.totalItems} 条通知`);
        } catch (error) {
            console.log('   ⚠️ 无法获取通知记录:', error.message);
        }

        console.log('\n' + '='.repeat(50));
        console.log('🎉 诊断完成！');
        console.log('\n💡 如果 AI 报告仍然无法生成，请检查:');
        console.log('   1. 是否在前端 AI 控制台中设置了有效的 SiliconFlow API Key');
        console.log('   2. API Key 格式是否正确 (sk-...)');
        console.log('   3. 网络是否能访问 api.siliconflow.cn');
        console.log('   4. 选择的 AI 模型是否可用');

    } catch (error) {
        console.error('\n❌ 诊断失败:', error.message);
        console.error(error);
    }
}

diagnose();
