/// <reference path="../pb_data/types.d.ts" />

// 新安装最初会把 department 建成 text；在任何业务账号写入前统一为与生产一致的受控枚举。
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('_pb_users_auth_')
  const values = ['工程部', '审计部', '财务部', '设计院', '监理部', '管理层', '综合部']
  const department = users.schema.getFieldByName('department')

  if (!department) throw new Error('users.department field is missing')

  if (department.type === 'select') {
    department.options.values = values
    department.options.maxSelect = 1
    return dao.saveCollection(users)
  }

  if (department.type !== 'text') throw new Error('users.department has an unsupported field type')

  const assigned = dao.findRecordsByFilter('users', 'department != ""', '', 0, 0)
  assigned.forEach((record) => {
    if (values.indexOf(record.getString('department')) === -1) {
      throw new Error('users.department contains a value outside the supported department list')
    }
  })

  const fieldId = department.id
  users.schema.removeField(fieldId)
  users.schema.addField(new SchemaField({
    system: false,
    id: fieldId,
    name: 'department',
    type: 'select',
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: values },
  }))
  return dao.saveCollection(users)
}, (_) => {
  // 不自动降级为自由文本，避免回滚时放宽生产数据约束。
})
