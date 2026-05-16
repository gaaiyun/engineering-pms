/**
 * 🔧 数据库完整重构脚本
 * 
 * 功能：
 * 1. 诊断当前数据库状态
 * 2. 修复/创建所有必要的集合
 * 3. 统一状态枚举
 * 4. 生成高质量模拟数据
 * 
 * 运行：node scripts/database_rebuild.mjs
 */

import PocketBase from 'pocketbase';

// ============ 配置 ============
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

// ============ 统一的状态定义 ============
const TASK_STATUS = {
    PENDING: 'pending',       // 待开始
    IN_PROGRESS: 'in_progress', // 进行中
    BLOCKED: 'blocked',       // 卡点
    COMPLETED: 'completed',   // 已完成
    OVERDUE: 'overdue',       // 已逾期
};

const PROJECT_STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ARCHIVED: 'archived',
};

const USER_ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    EMPLOYEE: 'employee',
};

const DEPARTMENTS = ['工程部', '审计部', '财务部', '管理层', '设计院', '监理部', '安监部'];

// ============ 用户数据 ============
const USERS = [
    { username: 'admin_boss', name: '赵总(老板)', role: 'admin', dept: '管理层', position: '总经理' },
    { username: 'zhang_manager', name: '张经理', role: 'manager', dept: '工程部', position: '项目总监' },
    { username: 'wang_manager', name: '王经理', role: 'manager', dept: '工程部', position: '项目经理' },
    { username: 'li_audit', name: '李审计', role: 'employee', dept: '审计部', position: '高级审计师' },
    { username: 'chen_doc', name: '陈资料', role: 'employee', dept: '工程部', position: '资料主管' },
    { username: 'liu_eng', name: '刘工程师', role: 'employee', dept: '工程部', position: '工程师' },
    { username: 'zhao_site', name: '赵工长', role: 'employee', dept: '工程部', position: '施工队长' },
    { username: 'sun_safe', name: '孙安检员', role: 'employee', dept: '工程部', position: '安全管理员' },
    { username: 'wu_design', name: '吴设计师', role: 'employee', dept: '工程部', position: '设计师' },
    { username: 'huang_sup', name: '黄监理', role: 'employee', dept: '工程部', position: '监理工程师' },
    // 无部门员工（演示用，可在 PB 后台改名）
    { username: 'mgr_a', name: '经理A', role: 'manager', dept: '', position: '' },
    { username: 'emp_b', name: '员工B', role: 'employee', dept: '', position: '' },
    { username: 'emp_c', name: '员工C', role: 'employee', dept: '', position: '' },
    { username: 'emp_d', name: '员工D', role: 'employee', dept: '', position: '' },
    { username: 'mgr_e', name: '经理E', role: 'manager', dept: '', position: '' },
];

// ============ 项目数据 ============
const PROJECTS = [
    {
        name: "凤凰山跨海大桥工程",
        code: "ENG-2025-001",
        description: "跨越凤凰湾的大型桥梁工程，全长3.2公里",
        managerIdx: 1, // zhang_manager
        startOffset: -90, // 90天前开始
        duration: 180,
        type: "bridge"
    },
    {
        name: "滨海湾地下综合管廊",
        code: "ENG-2025-002",
        description: "城市地下综合管廊建设，总长度5.8公里",
        managerIdx: 2, // wang_manager
        startOffset: -60,
        duration: 150,
        type: "tunnel"
    },
    {
        name: "智慧产业园弱电项目",
        code: "ENG-2025-003",
        description: "高科技产业园区弱电智能化系统建设",
        managerIdx: 1,
        startOffset: -30,
        duration: 90,
        type: "smart_park"
    },
    {
        name: "老旧小区改造三期",
        code: "ENG-2025-004",
        description: "市中心老旧小区综合改造工程",
        managerIdx: 2,
        startOffset: -15,
        duration: 120,
        type: "renovation"
    },
    {
        name: "轨道交通5号线配套",
        code: "ENG-2025-005",
        description: "地铁5号线站点配套设施建设",
        managerIdx: 1,
        startOffset: 10, // 未来10天开始
        duration: 200,
        type: "metro"
    }
];

// ============ 工作流模板 ============
const WORKFLOWS = {
    bridge: [
        { stage: "前期规划与选址", assigneeIdx: 8, days: 5, priority: 'high', isMilestone: true },
        { stage: "水文地质详细勘察", assigneeIdx: 5, days: 8, priority: 'high' },
        { stage: "环境影响评估", assigneeIdx: 3, days: 6, priority: 'normal' },
        { stage: "初步设计出图", assigneeIdx: 8, days: 12, priority: 'high', isMilestone: true },
        { stage: "技术方案评审", assigneeIdx: 3, days: 3, priority: 'high' },
        { stage: "施工图深化", assigneeIdx: 8, days: 15, priority: 'normal' },
        { stage: "造价预算编制", assigneeIdx: 3, days: 8, priority: 'normal' },
        { stage: "招标文件准备", assigneeIdx: 4, days: 4, priority: 'normal' },
        { stage: "项目招投标", assigneeIdx: 1, days: 7, priority: 'high', isMilestone: true },
        { stage: "合同签订与备案", assigneeIdx: 4, days: 3, priority: 'normal' },
        { stage: "施工许可证办理", assigneeIdx: 4, days: 5, priority: 'high' },
        { stage: "项目部组建", assigneeIdx: 6, days: 4, priority: 'normal' },
        { stage: "临建设施搭建", assigneeIdx: 6, days: 8, priority: 'normal' },
        { stage: "桩基施工入场", assigneeIdx: 6, days: 12, priority: 'high' },
        { stage: "首桩浇筑", assigneeIdx: 6, days: 2, priority: 'high', isMilestone: true },
        { stage: "桩基检测", assigneeIdx: 9, days: 4, priority: 'high' },
        { stage: "承台施工", assigneeIdx: 6, days: 12, priority: 'normal' },
        { stage: "墩柱施工", assigneeIdx: 6, days: 18, priority: 'normal' },
        { stage: "安全专项检查", assigneeIdx: 7, days: 2, priority: 'high' },
        { stage: "上部结构吊装", assigneeIdx: 6, days: 25, priority: 'high', isMilestone: true },
        { stage: "桥面铺装", assigneeIdx: 6, days: 12, priority: 'normal' },
        { stage: "竣工验收", assigneeIdx: 9, days: 5, priority: 'high', isMilestone: true }
    ],
    tunnel: [
        { stage: "项目立项申请", assigneeIdx: 4, days: 3, priority: 'normal' },
        { stage: "可行性研究", assigneeIdx: 8, days: 6, priority: 'high', isMilestone: true },
        { stage: "地质勘探", assigneeIdx: 5, days: 10, priority: 'high' },
        { stage: "管线探测", assigneeIdx: 5, days: 5, priority: 'high' },
        { stage: "设计方案编制", assigneeIdx: 8, days: 12, priority: 'normal' },
        { stage: "图纸会审", assigneeIdx: 3, days: 3, priority: 'normal' },
        { stage: "预算编制", assigneeIdx: 3, days: 6, priority: 'normal' },
        { stage: "施工单位招标", assigneeIdx: 1, days: 8, priority: 'high', isMilestone: true },
        { stage: "开工准备", assigneeIdx: 6, days: 5, priority: 'normal' },
        { stage: "基坑开挖", assigneeIdx: 6, days: 15, priority: 'high' },
        { stage: "基坑支护", assigneeIdx: 6, days: 10, priority: 'high' },
        { stage: "管廊主体施工", assigneeIdx: 6, days: 35, priority: 'high', isMilestone: true },
        { stage: "防水施工", assigneeIdx: 6, days: 8, priority: 'normal' },
        { stage: "回填覆土", assigneeIdx: 6, days: 6, priority: 'normal' },
        { stage: "道路恢复", assigneeIdx: 6, days: 10, priority: 'normal' },
        { stage: "竣工验收", assigneeIdx: 9, days: 5, priority: 'high', isMilestone: true }
    ],
    smart_park: [
        { stage: "需求调研", assigneeIdx: 4, days: 4, priority: 'high' },
        { stage: "方案设计", assigneeIdx: 8, days: 8, priority: 'high', isMilestone: true },
        { stage: "设备选型", assigneeIdx: 5, days: 5, priority: 'normal' },
        { stage: "图纸深化", assigneeIdx: 8, days: 10, priority: 'normal' },
        { stage: "预算审核", assigneeIdx: 3, days: 4, priority: 'normal' },
        { stage: "设备采购", assigneeIdx: 4, days: 12, priority: 'high' },
        { stage: "桥架安装", assigneeIdx: 6, days: 8, priority: 'normal' },
        { stage: "线缆敷设", assigneeIdx: 6, days: 12, priority: 'normal' },
        { stage: "设备安装", assigneeIdx: 6, days: 10, priority: 'high', isMilestone: true },
        { stage: "系统调试", assigneeIdx: 5, days: 8, priority: 'high' },
        { stage: "联调测试", assigneeIdx: 5, days: 5, priority: 'high' },
        { stage: "竣工验收", assigneeIdx: 9, days: 3, priority: 'high', isMilestone: true }
    ],
    renovation: [
        { stage: "现状调查", assigneeIdx: 5, days: 5, priority: 'normal' },
        { stage: "改造方案编制", assigneeIdx: 8, days: 8, priority: 'high', isMilestone: true },
        { stage: "居民意见征询", assigneeIdx: 4, days: 6, priority: 'high' },
        { stage: "方案审批", assigneeIdx: 1, days: 5, priority: 'high' },
        { stage: "施工图设计", assigneeIdx: 8, days: 10, priority: 'normal' },
        { stage: "预算编制", assigneeIdx: 3, days: 5, priority: 'normal' },
        { stage: "施工招标", assigneeIdx: 1, days: 8, priority: 'high', isMilestone: true },
        { stage: "进场准备", assigneeIdx: 6, days: 4, priority: 'normal' },
        { stage: "外墙修缮", assigneeIdx: 6, days: 20, priority: 'normal' },
        { stage: "屋面防水", assigneeIdx: 6, days: 12, priority: 'high' },
        { stage: "管线改造", assigneeIdx: 6, days: 15, priority: 'normal' },
        { stage: "道路修复", assigneeIdx: 6, days: 10, priority: 'normal' },
        { stage: "绿化景观", assigneeIdx: 6, days: 8, priority: 'low' },
        { stage: "竣工验收", assigneeIdx: 9, days: 4, priority: 'high', isMilestone: true }
    ],
    metro: [
        { stage: "接口协调", assigneeIdx: 4, days: 5, priority: 'high' },
        { stage: "设计任务书", assigneeIdx: 8, days: 4, priority: 'normal' },
        { stage: "方案设计", assigneeIdx: 8, days: 12, priority: 'high', isMilestone: true },
        { stage: "专家评审", assigneeIdx: 1, days: 3, priority: 'high' },
        { stage: "施工图设计", assigneeIdx: 8, days: 15, priority: 'normal' },
        { stage: "预算审核", assigneeIdx: 3, days: 6, priority: 'normal' },
        { stage: "招投标", assigneeIdx: 1, days: 10, priority: 'high', isMilestone: true },
        { stage: "进场交接", assigneeIdx: 6, days: 3, priority: 'normal' },
        { stage: "基础施工", assigneeIdx: 6, days: 20, priority: 'high' },
        { stage: "主体结构", assigneeIdx: 6, days: 40, priority: 'high', isMilestone: true },
        { stage: "装修工程", assigneeIdx: 6, days: 25, priority: 'normal' },
        { stage: "机电安装", assigneeIdx: 5, days: 20, priority: 'high' },
        { stage: "联调测试", assigneeIdx: 5, days: 10, priority: 'high' },
        { stage: "消防验收", assigneeIdx: 7, days: 5, priority: 'high' },
        { stage: "竣工验收", assigneeIdx: 9, days: 5, priority: 'high', isMilestone: true }
    ]
};

// ============ 工具函数 ============
const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString();
};

const formatDate = (date) => date.toISOString();

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ============ 核心函数 ============

async function authenticate() {
    console.log('🔑 正在连接 PocketBase...');
    console.log(`   URL: ${CONFIG.PB_URL}`);
    
    try {
        // 直接使用 HTTP 请求认证
        const response = await fetch(`${CONFIG.PB_URL}/api/admins/auth-with-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identity: CONFIG.ADMIN_EMAIL,
                password: CONFIG.ADMIN_PASSWORD
            })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }
        
        const data = await response.json();
        
        // 手动设置 auth token
        if (data.token) {
            pb.authStore.save(data.token, data.admin);
            console.log('✅ 管理员认证成功\n');
            return true;
        }
        
        throw new Error('认证响应中没有 token');
    } catch (e) {
        console.error('❌ 认证失败:', e.message);
        console.error('   请确认 PocketBase 服务器运行中，且账号密码正确');
        return false;
    }
}

async function diagnoseDatabase() {
    console.log('📊 ========== 数据库诊断 ==========\n');
    
    const collections = ['users', 'projects', 'tasks', 'handoffs', 'comments', 'audit_logs', 'ai_summaries', 'notifications'];
    const report = {};
    
    for (const name of collections) {
        try {
            const col = await pb.collections.getOne(name === 'users' ? '_pb_users_auth_' : name);
            const records = await pb.collection(name).getFullList();
            
            report[name] = {
                exists: true,
                count: records.length,
                fields: col.schema?.map(f => f.name) || []
            };
            
            console.log(`✅ ${name}: ${records.length} 条记录`);
            
            // 详细诊断 tasks
            if (name === 'tasks' && records.length > 0) {
                const statusCount = {};
                const emptyFields = { start_date: 0, deadline: 0, assignees: 0, blocker: 0 };
                
                records.forEach(r => {
                    statusCount[r.status] = (statusCount[r.status] || 0) + 1;
                    if (!r.start_date) emptyFields.start_date++;
                    if (!r.deadline) emptyFields.deadline++;
                    if (!r.assignees || r.assignees.length === 0) emptyFields.assignees++;
                });
                
                console.log('   状态分布:', statusCount);
                console.log('   空字段统计:', emptyFields);
            }
            
            // 详细诊断 users
            if (name === 'users' && records.length > 0) {
                const roleCount = {};
                records.forEach(r => {
                    roleCount[r.role || 'undefined'] = (roleCount[r.role || 'undefined'] || 0) + 1;
                });
                console.log('   角色分布:', roleCount);
            }
            
        } catch (e) {
            report[name] = { exists: false, error: e.message };
            console.log(`❌ ${name}: 不存在或无法访问`);
        }
    }
    
    console.log('\n');
    return report;
}

async function updateUsersCollection() {
    console.log('👥 更新 Users 集合结构...');
    
    try {
        const col = await pb.collections.getOne('_pb_users_auth_');
        let needsUpdate = false;
        
        const requiredFields = [
            { name: 'role', type: 'select', options: { maxSelect: 1, values: ['admin', 'manager', 'employee'] } },
            { name: 'department', type: 'select', options: { maxSelect: 1, values: DEPARTMENTS } },
            { name: 'position', type: 'text' },
            { name: 'phone', type: 'text' },
            { name: 'flower_count', type: 'number', options: { min: 0 } },
            { name: 'is_active', type: 'bool' },
        ];
        
        for (const field of requiredFields) {
            if (!col.schema.find(f => f.name === field.name)) {
                col.schema.push(field);
                needsUpdate = true;
                console.log(`   + 添加字段: ${field.name}`);
            }
        }
        
        if (needsUpdate) {
            // 更新规则
            col.createRule = '';
            col.listRule = '@request.auth.id != ""';
            col.viewRule = '@request.auth.id != ""';
            col.updateRule = '@request.auth.id = id || @request.auth.role = "admin"';
            
            await pb.collections.update('_pb_users_auth_', col);
            console.log('   ✅ Users 集合已更新');
        } else {
            console.log('   ℹ️ Users 集合已是最新');
        }
    } catch (e) {
        console.error('   ❌ 更新失败:', e.message);
    }
}

async function ensureCollection(name, schema, rules = {}) {
    console.log(`📦 检查集合: ${name}...`);
    
    const defaultRules = {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    };
    const finalRules = { ...defaultRules, ...rules };
    
    try {
        const existing = await pb.collections.getOne(name);
        
        // 检查并添加缺失字段
        let needsUpdate = false;
        for (const field of schema) {
            if (!existing.schema.find(f => f.name === field.name)) {
                existing.schema.push(field);
                needsUpdate = true;
                console.log(`   + 添加字段: ${field.name}`);
            }
        }
        
        // 始终更新权限规则
        const ruleChanged = Object.keys(finalRules).some(k => existing[k] !== finalRules[k]);
        if (ruleChanged) {
            needsUpdate = true;
            console.log(`   🔒 更新权限规则`);
        }
        
        if (needsUpdate) {
            try {
                await pb.collections.update(name, { ...existing, ...finalRules });
            } catch (updateErr) {
                console.log(`   ⚠️ 更新跳过: ${updateErr.message}`);
            }
        }
        console.log(`   ✅ ${name} 集合已就绪`);
        return existing.id;
        
    } catch (e) {
        // 创建新集合
        console.log(`   创建新集合: ${name}`);
        
        try {
            const col = await pb.collections.create({
                name,
                type: 'base',
                schema,
                ...finalRules,
            });
            console.log(`   ✅ ${name} 集合创建成功`);
            return col.id;
        } catch (createErr) {
            console.log(`   ⚠️ 集合创建跳过: ${createErr.message}`);
            try {
                const existing = await pb.collections.getOne(name);
                return existing.id;
            } catch (e2) {
                return null;
            }
        }
    }
}

async function setupCollections() {
    console.log('\n📚 ========== 设置集合结构 ==========\n');
    
    await updateUsersCollection();
    
    // Projects 集合 — 经理专属更新/删除
    const managerOnlyRules = {
        updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
        deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    };
    const projectsId = await ensureCollection('projects', [
        { name: 'name', type: 'text', required: true },
        { name: 'code', type: 'text' },
        { name: 'status', type: 'select', required: true, options: { maxSelect: 1, values: ['active', 'completed', 'archived'] } },
        { name: 'description', type: 'text' },
        { name: 'progress', type: 'number', options: { min: 0, max: 100 } },
        { name: 'manager', type: 'relation', options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'created_by', type: 'relation', options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'start_date', type: 'date' },
        { name: 'end_date', type: 'date' },
        { name: 'deadline', type: 'date' },
        { name: 'total_tasks', type: 'number' },
        { name: 'completed_tasks', type: 'number' },
        { name: 'current_stage', type: 'text' },
        { name: 'members', type: 'relation', options: { collectionId: '_pb_users_auth_' } },
    ], managerOnlyRules);
    
    // Tasks 集合 - 员工可查看同项目所有任务（时间轴需要），可更新自己被分配的任务
    const taskMemberRule = '@request.auth.id != "" && (assignees.id ?= @request.auth.id || @request.auth.role = "manager" || @request.auth.role = "admin" || project.members ~ @request.auth.id)';
    const taskRules = {
        listRule: taskMemberRule,
        viewRule: taskMemberRule,
        updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || assignees.id ?= @request.auth.id',
        deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    };
    await ensureCollection('tasks', [
        { name: 'project', type: 'relation', required: true, options: { collectionId: projectsId, maxSelect: 1 } },
        { name: 'stage_name', type: 'text', required: true },
        { name: 'status', type: 'select', required: true, options: { 
            maxSelect: 1, 
            values: ['pending', 'in_progress', 'blocked', 'completed', 'overdue'] // 统一状态！
        }},
        { name: 'priority', type: 'select', options: { maxSelect: 1, values: ['low', 'normal', 'high'] } },
        { name: 'description', type: 'text' },
        { name: 'completed_steps', type: 'text' },
        { name: 'next_steps', type: 'text' },
        { name: 'assignees', type: 'relation', options: { collectionId: '_pb_users_auth_' } },
        { name: 'created_by', type: 'relation', options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'start_date', type: 'date' },
        { name: 'deadline', type: 'date' },
        { name: 'completed_at', type: 'date' },
        { name: 'sequence', type: 'number' },
        { name: 'is_milestone', type: 'bool' },
        { name: 'blocker', type: 'json' },
        { name: 'predecessor_tasks', type: 'relation', options: { collectionId: 'tasks' } },
        { name: 'next_assignees', type: 'relation', options: { collectionId: '_pb_users_auth_' } },
    ], taskRules);
    
    // Handoffs 集合
    await ensureCollection('handoffs', [
        { name: 'project', type: 'relation', required: true, options: { collectionId: projectsId, maxSelect: 1 } },
        { name: 'from_task', type: 'relation', options: { collectionId: 'tasks', maxSelect: 1 } },
        { name: 'proposed_title', type: 'text', required: true },
        { name: 'proposed_description', type: 'text' },
        { name: 'proposed_assignees', type: 'relation', options: { collectionId: '_pb_users_auth_' } },
        { name: 'proposed_start_date', type: 'date' },
        { name: 'proposed_due_date', type: 'date' },
        { name: 'status', type: 'select', required: true, options: { maxSelect: 1, values: ['pending', 'approved', 'rejected'] } },
        { name: 'submitter', type: 'relation', options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'reviewer', type: 'relation', options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'review_note', type: 'text' },
        { name: 'approved_task', type: 'relation', options: { collectionId: 'tasks', maxSelect: 1 } },
    ]);
    
    // Comments 集合
    await ensureCollection('comments', [
        { name: 'project', type: 'relation', options: { collectionId: projectsId, maxSelect: 1 } },
        { name: 'step', type: 'relation', options: { collectionId: 'tasks', maxSelect: 1 } },
        { name: 'author', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'content', type: 'text', required: true },
        { name: 'mentions', type: 'relation', options: { collectionId: '_pb_users_auth_' } },
    ]);
    
    // Audit Logs 集合 — 增加复核状态字段
    await ensureCollection('audit_logs', [
        { name: 'project', type: 'relation', options: { collectionId: projectsId, maxSelect: 1 } },
        { name: 'task', type: 'relation', options: { collectionId: 'tasks', maxSelect: 1 } },
        { name: 'action_type', type: 'text', required: true },
        { name: 'operator', type: 'relation', options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'before_data', type: 'json' },
        { name: 'after_data', type: 'json' },
        { name: 'note', type: 'text' },
        { name: 'review_status', type: 'select', options: { maxSelect: 1, values: ['unread', 'read', 'approved'] } },
        { name: 'reviewed_by', type: 'relation', options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
    ], {
        updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    });
    
    // AI Summaries 集合
    await ensureCollection('ai_summaries', [
        { name: 'project', type: 'relation', options: { collectionId: projectsId, maxSelect: 1 } },
        { name: 'target_user', type: 'relation', options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'date', type: 'date' },
        { name: 'content', type: 'text' },
        { name: 'risk_level', type: 'select', options: { maxSelect: 1, values: ['low', 'medium', 'high'] } },
        { name: 'model_used', type: 'text' },
        { name: 'input_snapshot', type: 'json' },
    ]);
    
    // Notifications 集合
    await ensureCollection('notifications', [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', maxSelect: 1 } },
        { name: 'type', type: 'text' },
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'text' },
        { name: 'link_type', type: 'text' },
        { name: 'link_id', type: 'text' },
        { name: 'is_read', type: 'bool' },
        { name: 'read_at', type: 'date' },
    ]);
    
    console.log('\n');
}

async function cleanOldData() {
    console.log('🧹 ========== 清理旧数据 ==========\n');
    
    const collectionsToClean = ['tasks', 'projects', 'handoffs', 'comments', 'audit_logs', 'ai_summaries', 'notifications'];
    
    for (const name of collectionsToClean) {
        try {
            const records = await pb.collection(name).getFullList();
            console.log(`   删除 ${name}: ${records.length} 条...`);
            for (const r of records) {
                try {
                    await pb.collection(name).delete(r.id);
                } catch (e) { /* ignore */ }
            }
        } catch (e) {
            console.log(`   跳过 ${name}: ${e.message}`);
        }
    }
    
    console.log('   ✅ 清理完成\n');
}

async function createUsers() {
    console.log('👥 ========== 创建/更新用户 ==========\n');
    
    const userIds = [];
    
    for (const [i, u] of USERS.entries()) {
        try {
            // 查找现有用户
            let existingUser = null;
            try {
                existingUser = await pb.collection('users').getFirstListItem(`username="${u.username}"`);
            } catch (e) { /* 不存在 */ }
            
            const userData = {
                name: u.name,
                role: u.role,
                ...(u.dept ? { department: u.dept } : {}),
                position: u.position || '',
                flower_count: randomInt(5, 80),
                is_active: true,
            };
            
            if (existingUser) {
                await pb.collection('users').update(existingUser.id, userData);
                userIds.push(existingUser.id);
                console.log(`   [${i}] 更新: ${u.name} (${u.role})`);
            } else {
                const newUser = await pb.collection('users').create({
                    username: u.username,
                    email: `${u.username}@engineering.com`,
                    emailVisibility: true,
                    password: '12345678',
                    passwordConfirm: '12345678',
                    ...userData
                });
                userIds.push(newUser.id);
                console.log(`   [${i}] 创建: ${u.name} (${u.role})`);
            }
        } catch (e) {
            console.error(`   ❌ ${u.username} 失败:`, e.message);
            userIds.push(null);
        }
    }
    
    console.log(`\n   ✅ 用户处理完成: ${userIds.filter(Boolean).length}/${USERS.length}\n`);
    return userIds;
}

const FEMALE_CHARS = '芳萍欣娟丽艳敏玲琴红梅燕霞芬琳娜婷慧颖静雪璐瑶蕾薇妍菲晶露淑英秀珍玉凤云莲香兰菊翠桂娥妹娣娇';
function inferGender(name) {
    if (!name || typeof name !== 'string') return 'male';
    const n = String(name).replace(/\s*\([^)]*\)/g, '').trim();
    return FEMALE_CHARS.includes(n.slice(-1)) ? 'female' : 'male';
}

async function addAvatarsForNewUsers() {
    const style = (process.env.AVATAR_STYLE || 'cartoon').toLowerCase();
    console.log(`👤 ========== 为无头像用户添加头像（${style === 'cartoon' ? '专业卡通' : '文字全名'}）==========\n`);
    const getAvatarUrl = (seed, gender) => {
        if (style === 'text') {
            const colors = ['2563eb', '475569', '1e40af', '334155'];
            const color = colors[Math.abs(String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length];
            const len = Math.min(4, Math.max(2, seed.length));
            return `https://ui-avatars.com/api/?name=${encodeURIComponent(seed)}&length=${len}&size=256&background=${color}&color=fff&bold=true&rounded=true&uppercase=false&format=svg`;
        }
        const isFemale = gender === 'female';
        const hair = isFemale ? 'long,bobCut,pigtails,curly,bobBangs,curlyBun,straightBun' : 'buzzcut,shortCombover,fade,bald,balding';
        const params = new URLSearchParams({ seed, hair, radius: '50', backgroundType: 'solid', eyes: 'open,glasses,happy', mouth: 'smile,smirk', body: 'rounded', clothingColor: '456dff,475569', facialHairProbability: isFemale ? '0' : '35', backgroundColor: 'e8eef5,f1f5f9' });
        return `https://api.dicebear.com/7.x/personas/svg?${params}`;
    };
    try {
        const users = await pb.collection('users').getFullList();
        let updatedCount = 0;
        for (const user of users) {
            if (!user.avatar) {
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
                    console.log(`   ✅ ${user.name || user.username} 头像已添加`);
                    updatedCount++;
                } catch (e) {
                    console.log(`   ⚠️ ${user.name || user.username} 头像添加失败: ${e.message}`);
                }
            }
        }
        console.log(`\n   ✅ 头像更新完成: ${updatedCount}/${users.length}\n`);
    } catch (e) {
        console.error(`   ❌ 添加头像失败: ${e.message}\n`);
    }
}

async function createProjectsAndTasks(userIds) {
    console.log('📁 ========== 创建项目和任务 ==========\n');
    
    const now = new Date();
    const createdTasks = [];
    
    for (const [pIdx, proj] of PROJECTS.entries()) {
        const projectStart = addDays(now, proj.startOffset);
        const projectEnd = addDays(now, proj.startOffset + proj.duration);
        const managerId = userIds[proj.managerIdx] || userIds[1];
        
        // 收集本项目涉及的所有人员（经理 + 任务负责人）
        const workflow = WORKFLOWS[proj.type] || WORKFLOWS.renovation;
        const memberSet = new Set([managerId]);
        for (const step of workflow) {
            const aid = userIds[step.assigneeIdx] || userIds[randomInt(3, 9)];
            if (aid) memberSet.add(aid);
        }
        const memberIds = [...memberSet].filter(Boolean);

        // 创建项目
        let projectId;
        try {
            const p = await pb.collection('projects').create({
                name: proj.name,
                code: proj.code,
                description: proj.description,
                status: 'active',
                progress: 0,
                manager: managerId,
                created_by: managerId,
                start_date: projectStart,
                deadline: projectEnd,
                members: memberIds,
            });
            projectId = p.id;
            console.log(`\n📂 项目: ${proj.name} (成员: ${memberIds.length}人)`);
            console.log(`   开始: ${projectStart.split('T')[0]} | 截止: ${projectEnd.split('T')[0]}`);
        } catch (e) {
            console.error(`   ❌ 项目创建失败: ${e.message}`);
            continue;
        }
        
        // 获取工作流（复用上面的 workflow 变量）
        let currentOffset = proj.startOffset;
        let completedCount = 0;
        let currentStage = '';
        let sequence = 1000;
        
        // 创建任务
        for (const [tIdx, step] of workflow.entries()) {
            const taskStart = addDays(now, currentOffset);
            const taskEnd = addDays(now, currentOffset + step.days);
            const assigneeId = userIds[step.assigneeIdx] || userIds[randomInt(3, 9)];
            
            // 计算状态 - 修复：确保 in_progress 正确生成
            const nowTime = now.getTime();
            const startTime = new Date(taskStart).getTime();
            const endTime = new Date(taskEnd).getTime();
            
            let status;
            let completedAt = null;
            let blocker = null;
            
            if (endTime < nowTime) {
                // 过去的任务
                const rand = Math.random();
                if (rand > 0.2) {
                    status = 'completed';
                    completedAt = taskEnd;
                    completedCount++;
                } else if (rand > 0.1) {
                    status = 'overdue';  // 10% 逾期
                } else {
                    status = 'in_progress';  // 10% 仍在进行（延期）
                    currentStage = step.stage;
                }
            } else if (startTime <= nowTime && endTime >= nowTime) {
                // 当前进行中的任务
                currentStage = step.stage;
                const rand = Math.random();
                if (rand > 0.85) {
                    status = 'blocked';  // 15% 卡点
                    blocker = {
                        reason_type: randomChoice(['waiting_approval', 'waiting_materials', 'technical_issue', 'external_dependency']),
                        reason_detail: randomChoice([
                            '等待甲方确认变更方案',
                            '材料供应商延期交货',
                            '技术方案需要专家评审',
                            '需要上级部门审批文件',
                            '现场条件暂不满足施工要求',
                        ]),
                        need_help_from: [managerId],
                        expected_resolve: addDays(now, randomInt(2, 7)),
                    };
                } else {
                    status = 'in_progress';  // 85% 正常进行中
                }
            } else {
                // 未来的任务
                status = 'pending';
            }
            
            // 生成步骤描述
            const completedSteps = status !== 'pending' ? [
                `${step.stage} 工作启动`,
                '资料收集与整理',
                '初步方案编制',
            ].join('\n') : '';
            
            const nextSteps = [
                tIdx < workflow.length - 1 ? `下一步: ${workflow[tIdx + 1].stage}` : '流程即将完成',
                '提交审核材料',
                '归档相关文档',
            ].join('\n');
            
            try {
                const task = await pb.collection('tasks').create({
                    project: projectId,
                    stage_name: step.stage,
                    status,
                    priority: step.priority || 'normal',
                    is_milestone: step.isMilestone || false,
                    description: `${proj.name} - ${step.stage}`,
                    completed_steps: completedSteps,
                    next_steps: nextSteps,
                    assignees: [assigneeId],
                    created_by: managerId,
                    start_date: taskStart,
                    deadline: taskEnd,
                    completed_at: completedAt,
                    sequence,
                    blocker,
                });
                createdTasks.push(task);
                process.stdout.write(status === 'completed' ? '✓' : status === 'blocked' ? '!' : status === 'in_progress' ? '▶' : '○');
            } catch (e) {
                process.stdout.write('✗');
            }
            
            currentOffset += step.days;
            sequence += 1000;
        }
        
        // 更新项目统计
        const progress = Math.round((completedCount / workflow.length) * 100);
        try {
            await pb.collection('projects').update(projectId, {
                progress,
                total_tasks: workflow.length,
                completed_tasks: completedCount,
                current_stage: currentStage || workflow[0].stage,
                end_date: addDays(now, currentOffset),
            });
            console.log(` (进度: ${progress}%)`);
        } catch (e) {
            console.log(` (统计更新失败)`);
        }
    }
    
    console.log(`\n\n   ✅ 任务创建完成: ${createdTasks.length} 条\n`);
    return createdTasks;
}

async function createSampleData(userIds, tasks) {
    console.log('📝 ========== 创建示例数据 ==========\n');
    
    // 获取一些任务用于关联
    const blockedTasks = tasks.filter(t => t.status === 'blocked');
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const managerIds = userIds.slice(1, 3).filter(Boolean);
    const employeeIds = userIds.slice(3).filter(Boolean);
    
    // 创建交接记录
    console.log('   创建交接记录...');
    if (completedTasks.length > 0) {
        for (let i = 0; i < Math.min(3, completedTasks.length); i++) {
            const task = completedTasks[i];
            try {
                await pb.collection('handoffs').create({
                    project: task.project,
                    from_task: task.id,
                    proposed_title: `${task.stage_name} 后续工作`,
                    proposed_description: '请接手后续工作并完成相关文档',
                    proposed_assignees: [randomChoice(employeeIds)],
                    proposed_due_date: addDays(new Date(), randomInt(7, 14)),
                    status: 'pending',
                    submitter: task.assignees?.[0] || employeeIds[0],
                });
            } catch (e) { /* ignore */ }
        }
        console.log('   ✅ 交接记录已创建');
    }
    
    // 创建评论
    console.log('   创建评论...');
    const sampleComments = [
        '进度正常，按计划推进中',
        '遇到一些小问题，已在协调解决',
        '请尽快提交相关资料',
        '注意质量把控，不要赶进度',
        '已完成初步审核，请查收',
        '@张经理 这个需要您确认一下',
    ];
    
    for (const task of tasks.slice(0, 10)) {
        try {
            await pb.collection('comments').create({
                step: task.id,
                project: task.project,
                author: randomChoice([...managerIds, ...employeeIds]),
                content: randomChoice(sampleComments),
            });
        } catch (e) { /* ignore */ }
    }
    console.log('   ✅ 评论已创建');
    
    // 创建通知
    console.log('   创建通知...');
    const notifications = [];
    
    for (const managerId of managerIds) {
        notifications.push({
            user: managerId,
            type: 'handoff_pending',
            title: '待审核交接',
            content: `有新的交接申请等待您的审核`,
            is_read: false,
        });
    }
    
    for (const task of blockedTasks.slice(0, 3)) {
        notifications.push({
            user: managerIds[0],
            type: 'blocker_reported',
            title: '任务卡点上报',
            content: `${task.stage_name} 任务遇到卡点，需要协助`,
            link_type: 'task',
            link_id: task.id,
            is_read: false,
        });
    }
    
    for (const n of notifications) {
        try {
            await pb.collection('notifications').create(n);
        } catch (e) { /* ignore */ }
    }
    console.log('   ✅ 通知已创建');
    
    // 创建审计日志
    console.log('   创建审计日志...');
    for (const task of tasks.slice(0, 20)) {
        try {
            await pb.collection('audit_logs').create({
                project: task.project,
                task: task.id,
                action_type: task.status === 'completed' ? 'mark_complete' : 'update_status',
                operator: task.assignees?.[0] || employeeIds[0],
                after_data: { status: task.status },
                note: `状态更新为 ${task.status}`,
            });
        } catch (e) { /* ignore */ }
    }
    console.log('   ✅ 审计日志已创建\n');
}

async function generateSummaryReport() {
    console.log('📈 ========== 生成摘要报告 ==========\n');
    
    const [projects, tasks, users] = await Promise.all([
        pb.collection('projects').getFullList(),
        pb.collection('tasks').getFullList(),
        pb.collection('users').getFullList(),
    ]);
    
    console.log('   📊 数据统计:');
    console.log(`      - 用户总数: ${users.length}`);
    console.log(`      - 项目总数: ${projects.length}`);
    console.log(`      - 任务总数: ${tasks.length}`);
    
    const statusCount = {};
    tasks.forEach(t => {
        statusCount[t.status] = (statusCount[t.status] || 0) + 1;
    });
    console.log('      - 任务状态分布:', statusCount);
    
    const userWithTasks = {};
    tasks.forEach(t => {
        (t.assignees || []).forEach(uid => {
            userWithTasks[uid] = (userWithTasks[uid] || 0) + 1;
        });
    });
    console.log(`      - 有任务的用户数: ${Object.keys(userWithTasks).length}`);
    
    console.log('\n   🎉 数据库重构完成！\n');
    console.log('   📱 测试账号:');
    console.log('      老板: admin_boss / 12345678 (admin)');
    console.log('      经理: zhang_manager / 12345678 (manager)');
    console.log('      经理: wang_manager / 12345678 (manager)');
    console.log('      员工: chen_doc / 12345678 (employee)');
    console.log('      其他员工: li_audit, liu_eng, zhao_site...\n');
}

// ============ 主函数 ============
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('     🔧 PocketBase 数据库完整重构工具 v2.0');
    console.log('═══════════════════════════════════════════════════\n');
    
    // 1. 认证
    if (!await authenticate()) return;
    
    // 2. 诊断当前状态
    await diagnoseDatabase();
    
    // 3. 设置集合结构
    await setupCollections();
    
    // 4. 清理旧数据
    await cleanOldData();
    
    // 5. 创建用户
    const userIds = await createUsers();
    
    // 5.5 为无头像用户添加头像
    await addAvatarsForNewUsers();
    
    // 6. 创建项目和任务
    const tasks = await createProjectsAndTasks(userIds);
    
    // 7. 创建示例数据
    await createSampleData(userIds, tasks);
    
    // 8. 生成报告
    await generateSummaryReport();
}

main().catch(console.error);
