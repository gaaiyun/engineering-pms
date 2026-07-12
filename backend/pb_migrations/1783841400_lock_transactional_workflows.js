/// <reference path="../pb_data/types.d.ts" />

// 状态机和永久删除只允许经过服务端事务路由，浏览器不能直接拼装多请求绕过业务不变量。
migrate((db) => {
  const dao = new Dao(db)
  const activeManager = '@request.auth.id != "" && @request.auth.is_active = true && (@request.auth.role = "admin" || @request.auth.role = "manager")'

  const lock = (name, updateRule, deleteRule) => {
    let collection
    try {
      collection = dao.findCollectionByNameOrId(name)
    } catch {
      return
    }
    if (updateRule !== undefined) collection.updateRule = updateRule
    if (deleteRule !== undefined) collection.deleteRule = deleteRule
    dao.saveCollection(collection)
  }

  lock('handoffs', null, null)
  lock('tasks', undefined, null)
  lock('projects', undefined, null)
  lock(
    'audit_logs',
    activeManager + ' && @request.data.review_status = "read" && @request.data.action_type:isset = false && @request.data.project:isset = false && @request.data.task:isset = false && @request.data.operator:isset = false && @request.data.before_data:isset = false && @request.data.after_data:isset = false',
    null,
  )
}, (_) => {
  // 生产环境以维护冷备回滚，避免 down 覆盖环境特有规则。
})
