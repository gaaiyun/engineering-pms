/// <reference path="../pb_data/types.d.ts" />
/**
 * 用户账号入口分为两类：
 * 1. 未登录访客只能自助注册启用的 employee；
 * 2. admin 可以创建任意角色，并维护或删除账号。
 */
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('_pb_users_auth_')

  // 不在结构迁移中猜测历史 false 的含义。生产库可能已有明确停用账号；
  // 如旧环境需要回填，必须依据私有账号清单单独执行并逐项验收。

  const activeAdmin = '@request.auth.id != "" && @request.auth.is_active = true && @request.auth.role = "admin"'
  users.createRule = activeAdmin + ' || (@request.auth.id = "" && @request.data.role = "employee" && @request.data.is_active = true && @request.data.flower_count:isset = false && @request.data.phone:isset = false)'
  users.updateRule = '@request.auth.is_active = true && (@request.auth.role = "admin" || (@request.auth.id = id && @request.data.role:isset = false && @request.data.is_active:isset = false && @request.data.flower_count:isset = false))'
  users.deleteRule = activeAdmin
  return dao.saveCollection(users)
}, (db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('_pb_users_auth_')
  users.createRule = '@request.data.role = "employee"'
  users.updateRule = '@request.auth.role = "admin" || (@request.auth.id = id && @request.data.role:isset = false && @request.data.is_active:isset = false && @request.data.flower_count:isset = false)'
  users.deleteRule = '@request.auth.role = "admin"'
  return dao.saveCollection(users)
})
