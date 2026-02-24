/**
 * 批量分配任务执行人脚本
 * Batch Assign Users to Tasks
 * 
 * 使用方法:
 * 1. 在 PocketBase 服务器上运行，或使用 Node.js + fetch 运行
 * 2. 修改 POCKETBASE_URL 为你的服务器地址
 * 3. 使用管理员账号登录后执行
 */

const POCKETBASE_URL = (process.env.PB_URL || process.env.VITE_PB_URL || 'http://127.0.0.1:8090').trim()

// 分配策略: 轮询分配给工程部用户
async function batchAssignTasks() {
    const PocketBase = (await import('pocketbase')).default
    const pb = new PocketBase(POCKETBASE_URL)

    try {
        // 1. 使用管理员账号登录
        console.log('🔐 正在登录...')
        const LOGIN_USER = (process.env.PB_LOGIN_USER || '').trim()
        const LOGIN_PASSWORD = (process.env.PB_LOGIN_PASSWORD || '').trim()
        if (!LOGIN_USER || !LOGIN_PASSWORD) {
            throw new Error('缺少登录账号：请设置环境变量 PB_LOGIN_USER / PB_LOGIN_PASSWORD（建议使用 manager/admin 账号）')
        }
        await pb.collection('users').authWithPassword(LOGIN_USER, LOGIN_PASSWORD)

        // 2. 获取所有工程部用户 (作为可分配的执行人)
        console.log('👥 获取可分配的用户列表...')
        const users = await pb.collection('users').getFullList({
            filter: "department = '工程部'"
        })

        if (users.length === 0) {
            console.log('⚠️ 没有找到工程部用户，获取所有用户...')
            const allUsers = await pb.collection('users').getFullList()
            users.push(...allUsers)
        }

        console.log(`✅ 找到 ${users.length} 个可分配用户:`, users.map(u => u.name || u.username))

        // 3. 获取所有没有分配执行人的任务
        console.log('📋 获取待分配任务...')
        const tasks = await pb.collection('tasks').getFullList()

        const unassignedTasks = tasks.filter(t => !t.assignees || t.assignees.length === 0)
        console.log(`📌 找到 ${unassignedTasks.length} 个未分配任务 (共 ${tasks.length} 个任务)`)

        if (unassignedTasks.length === 0) {
            console.log('✅ 所有任务都已分配执行人!')
            return
        }

        // 4. 轮询分配
        console.log('🔄 开始批量分配...')
        let userIndex = 0

        for (const task of unassignedTasks) {
            const assignee = users[userIndex % users.length]

            await pb.collection('tasks').update(task.id, {
                assignees: [assignee.id]
            })

            console.log(`  ✓ 任务 "${task.stage_name}" -> ${assignee.name || assignee.username}`)

            userIndex++
        }

        console.log(`\n🎉 完成! 已分配 ${unassignedTasks.length} 个任务`)

    } catch (error) {
        console.error('❌ 错误:', error.message)
        console.error(error)
    }
}

// 运行脚本
batchAssignTasks()
