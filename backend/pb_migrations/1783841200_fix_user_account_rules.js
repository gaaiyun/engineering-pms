/// <reference path="../pb_data/types.d.ts" />
/**
 * 用户账号入口分为两类：
 * 1. 未登录访客只能自助注册启用的 employee；
 * 2. admin 可以创建任意角色，并维护或删除账号。
 */
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('_pb_users_auth_')

  // is_active 是后加字段，历史记录的 false 代表“尚未回填”而非明确停用。
  // 本迁移上线后，停用动作才由管理员界面显式产生。
  const existingUsers = dao.findRecordsByFilter('users', 'is_active = false', '', 10000, 0)
  existingUsers.forEach((record) => {
    record.set('is_active', true)
    dao.saveRecord(record)
  })

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
