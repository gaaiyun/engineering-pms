/// <reference path="../pb_data/types.d.ts" />

// 3.06：关闭公开注册，并在首次登录或管理员重置密码后强制改密。
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('_pb_users_auth_')

  if (!users.schema.getFieldByName('must_change_password')) {
    users.schema.addField(new SchemaField({
      system: false,
      id: 'mustchg1',
      name: 'must_change_password',
      type: 'bool',
      required: false,
      presentable: false,
      unique: false,
      options: {},
    }))
  }

  const active = '@request.auth.id != "" && @request.auth.is_active = true'
  const ready = active + ' && @request.auth.must_change_password = false'
  users.listRule = ready
  users.viewRule = ready
  users.createRule = ready + ' && @request.auth.role = "admin"'
  users.updateRule = ready + ' && @request.data.must_change_password:isset = false && (@request.auth.role = "admin" || (@request.auth.id = id && @request.data.role:isset = false && @request.data.is_active:isset = false && @request.data.flower_count:isset = false))'
  users.deleteRule = ready + ' && @request.auth.role = "admin"'
  dao.saveCollection(users)

  // 强制改密期间不允许旧会话继续读取或写入业务集合。
  const businessCollections = [
    'projects', 'tasks', 'notifications', 'handoffs', 'audit_logs', 'comments',
    'device_tokens', 'attachments', 'flower_logs', 'progress_logs', 'ai_summaries',
    'app_settings',
  ]
  const ruleNames = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']
  businessCollections.forEach((name) => {
    let collection
    try { collection = dao.findCollectionByNameOrId(name) } catch (_) { return }
    ruleNames.forEach((ruleName) => {
      const rule = collection[ruleName]
      if (typeof rule === 'string' && rule.trim()) {
        collection[ruleName] = '@request.auth.must_change_password = false && (' + rule + ')'
      }
    })
    dao.saveCollection(collection)
  })

  try {
    const notifications = dao.findCollectionByNameOrId('notifications')
    notifications.updateRule = ready + ' && user = @request.auth.id && @request.data.user:isset = false && @request.data.type:isset = false && @request.data.title:isset = false && @request.data.content:isset = false && @request.data.link_type:isset = false && @request.data.link_id:isset = false'
    dao.saveCollection(notifications)
  } catch (_) {
    // 可选集合不存在时不阻断迁移。
  }

  try {
    const audits = dao.findCollectionByNameOrId('audit_logs')
    audits.updateRule = ready + ' && (@request.auth.role = "admin" || @request.auth.role = "manager") && @request.data.review_status = "read" && @request.data.reviewed_by = @request.auth.id && @request.data.action_type:isset = false && @request.data.project:isset = false && @request.data.task:isset = false && @request.data.operator:isset = false && @request.data.before_data:isset = false && @request.data.after_data:isset = false && @request.data.note:isset = false && @request.data.reject_note:isset = false'
    dao.saveCollection(audits)
  } catch (_) {
    // 可选集合不存在时不阻断迁移。
  }
}, (_) => {
  // 生产结构迁移使用冷备回滚，避免恢复过时权限规则。
})
