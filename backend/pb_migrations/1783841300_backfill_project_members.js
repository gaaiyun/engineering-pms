/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const dao = new Dao(db)
  const projects = dao.findRecordsByFilter('projects', 'id != ""', '', 10000, 0)
  projects.forEach((project) => {
    const members = project.getStringSlice('members') || []
    const merged = members.slice()
    const managerId = project.getString('manager')
    if (managerId && merged.indexOf(managerId) === -1) merged.push(managerId)
    const tasks = dao.findRecordsByFilter('tasks', `project = "${project.id}"`, '', 10000, 0)
    tasks.forEach((task) => {
      const assignees = task.getStringSlice('assignees') || []
      assignees.forEach((id) => { if (id && merged.indexOf(id) === -1) merged.push(id) })
    })
    if (merged.length !== members.length) {
      project.set('members', merged)
      dao.saveRecord(project)
    }
  })
}, (_) => {
  // 成员并集是非破坏性数据修复，不在 down 中移除。
})

