/// <reference path="../pb_data/types.d.ts" />

// 前端可选部门必须与 PocketBase select 字段保持一致，否则整次用户更新会被拒绝。
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('_pb_users_auth_')
  const department = users.schema.getFieldByName('department')

  // 早期全新安装可能仍使用 text 字段，此时本身可接受全部部门，无需转换类型。
  if (department && department.type === 'select') {
    department.options.values = ['工程部', '审计部', '财务部', '设计院', '监理部', '管理层']
    return dao.saveCollection(users)
  }
}, (_) => {
  // 生产结构通过部署前冷备回滚；不移除已被员工记录使用的部门值。
})
