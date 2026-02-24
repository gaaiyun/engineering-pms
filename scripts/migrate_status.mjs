/**
 * 🔄 状态迁移脚本
 * 
 * 将数据库中的 'processing' 状态迁移为 'in_progress'
 * 
 * 运行：node migrate_status.mjs
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

async function main() {
    console.log('🔄 开始状态迁移...\n');
    
    // 认证 - 使用 HTTP 请求
    try {
        const response = await fetch(`${CONFIG.PB_URL}/api/admins/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identity: CONFIG.ADMIN_EMAIL,
                password: CONFIG.ADMIN_PASSWORD
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (data.token) {
            pb.authStore.save(data.token, data.admin);
            console.log('✅ 认证成功\n');
        }
    } catch (e) {
        console.error('❌ 认证失败:', e.message);
        return;
    }
    
    // 1. 更新 tasks 集合的状态枚举
    console.log('📦 更新 tasks 集合 schema...');
    try {
        const tasksCol = await pb.collections.getOne('tasks');
        const statusField = tasksCol.schema.find(f => f.name === 'status');
        
        if (statusField) {
            const currentValues = statusField.options?.values || [];
            console.log('   当前状态值:', currentValues);
            
            // 确保包含所有需要的状态
            const newValues = ['pending', 'in_progress', 'blocked', 'completed', 'overdue'];
            statusField.options = { ...statusField.options, values: newValues };
            
            await pb.collections.update('tasks', tasksCol);
            console.log('   ✅ schema 已更新:', newValues);
        }
    } catch (e) {
        console.error('   ❌ schema 更新失败:', e.message);
    }
    
    // 2. 迁移 processing -> in_progress
    console.log('\n🔄 迁移任务状态...');
    try {
        const tasks = await pb.collection('tasks').getFullList();
        let migratedCount = 0;
        
        for (const task of tasks) {
            if (task.status === 'processing') {
                try {
                    await pb.collection('tasks').update(task.id, { status: 'in_progress' });
                    migratedCount++;
                    process.stdout.write('.');
                } catch (e) {
                    process.stdout.write('x');
                }
            }
        }
        
        console.log(`\n   ✅ 迁移完成: ${migratedCount} 条任务`);
    } catch (e) {
        console.error('   ❌ 迁移失败:', e.message);
    }
    
    // 3. 验证结果
    console.log('\n📊 验证结果...');
    try {
        const tasks = await pb.collection('tasks').getFullList();
        const statusCount = {};
        tasks.forEach(t => {
            statusCount[t.status] = (statusCount[t.status] || 0) + 1;
        });
        console.log('   状态分布:', statusCount);
        
        if (statusCount['processing']) {
            console.log('   ⚠️ 警告: 仍有 processing 状态的任务');
        } else {
            console.log('   ✅ 所有任务状态已规范化');
        }
    } catch (e) {
        console.error('   ❌ 验证失败:', e.message);
    }
    
    console.log('\n🎉 迁移完成！');
}

main().catch(console.error);
