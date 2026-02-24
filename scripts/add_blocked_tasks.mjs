/**
 * 添加卡点任务测试数据
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
    console.log('🔄 添加卡点任务...\n');
    
    // 认证
    const response = await fetch(`${CONFIG.PB_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            identity: CONFIG.ADMIN_EMAIL,
            password: CONFIG.ADMIN_PASSWORD
        })
    });
    
    const data = await response.json();
    pb.authStore.save(data.token, data.admin);
    console.log('✅ 认证成功\n');
    
    // 获取进行中的任务
    const tasks = await pb.collection('tasks').getFullList({
        filter: 'status = "in_progress"',
        sort: '-created',
    });
    
    console.log(`找到 ${tasks.length} 个进行中的任务`);
    
    // 选择 2-3 个任务设置为卡点
    const blockerReasons = [
        {
            reason_type: 'waiting_approval',
            reason_detail: '等待甲方审批变更方案，预计需要3个工作日',
        },
        {
            reason_type: 'waiting_materials',
            reason_detail: '关键材料供应商延期，正在协调替代供应商',
        },
        {
            reason_type: 'technical_issue',
            reason_detail: '现场勘查发现地质条件与设计不符，需要重新评估',
        },
    ];
    
    const tasksToBlock = tasks.slice(0, Math.min(3, tasks.length));
    
    for (let i = 0; i < tasksToBlock.length; i++) {
        const task = tasksToBlock[i];
        const blocker = {
            ...blockerReasons[i % blockerReasons.length],
            need_help_from: [],
            expected_resolve: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        };
        
        try {
            await pb.collection('tasks').update(task.id, {
                status: 'blocked',
                blocker,
            });
            console.log(`✓ 已设置卡点: ${task.stage_name}`);
        } catch (e) {
            console.log(`✗ 设置失败: ${task.stage_name} - ${e.message}`);
        }
    }
    
    // 验证
    const blockedTasks = await pb.collection('tasks').getFullList({
        filter: 'status = "blocked"',
    });
    console.log(`\n✅ 现有 ${blockedTasks.length} 个卡点任务`);
    
    // 显示当前状态分布
    const allTasks = await pb.collection('tasks').getFullList();
    const statusCount = {};
    allTasks.forEach(t => {
        statusCount[t.status] = (statusCount[t.status] || 0) + 1;
    });
    console.log('📊 最终状态分布:', statusCount);
}

main().catch(console.error);
