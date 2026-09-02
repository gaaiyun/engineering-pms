/// <reference path="../pb_data/types.d.ts" />

// 支持正式名册重建：增加综合部，并为受控全项目管理员 Agent 增加人员维护 scope。
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

  const records = dao.findRecordsByFilter('service_accounts', 'enabled = true', '', 0, 0)
  records.forEach((record) => {
    const scopes = record.getStringSlice('scopes') || []
    const allowedProjects = record.getStringSlice('allowed_projects') || []
    if (allowedProjects.length > 0 || scopes.indexOf('read') === -1 || scopes.indexOf('write') === -1 || scopes.indexOf('delete') === -1) return
    let owner
    try { owner = dao.findRecordById('users', record.getString('owner')) } catch (_) { return }
    if (!owner.getBool('is_active') || owner.getBool('must_change_password') || owner.getString('role') !== 'admin') return
    if (scopes.indexOf('people_manage') === -1) {
      scopes.push('people_manage')
      record.set('scopes', scopes)
      dao.saveRecord(record)
    }
  })
}, (_) => {
  // 生产结构和授权通过部署前冷备回滚，避免移除正在使用的部门或 scope。
})
