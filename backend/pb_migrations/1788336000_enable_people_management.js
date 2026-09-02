/// <reference path="../pb_data/types.d.ts" />

// 支持正式名册重建：增加综合部和人员维护 scope 的可选值。
// 这里只扩展 schema，不修改任何既有服务账号；people_manage 必须由管理员创建服务账号时显式授予。
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('_pb_users_auth_')
  const department = users.schema.getFieldByName('department')
  if (department && department.type === 'select') {
    const values = new Set(department.options.values || [])
    values.add('综合部')
    department.options.values = [...values]
    dao.saveCollection(users)
  }

  const serviceAccounts = dao.findCollectionByNameOrId('service_accounts')
  const scopesField = serviceAccounts.schema.getFieldByName('scopes')
  const scopeValues = new Set(scopesField.options.values || [])
  scopeValues.add('people_manage')
  scopesField.options.values = [...scopeValues]
  dao.saveCollection(serviceAccounts)
}, (_) => {
  // 生产结构和授权通过部署前冷备回滚，避免移除正在使用的部门或 scope。
})
