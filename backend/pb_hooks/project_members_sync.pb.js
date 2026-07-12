/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateRequest((e) => {
  try {
    const task = e.record
    const projectId = task ? task.getString('project') : ''
    if (!projectId) return
    const project = $app.dao().findRecordById('projects', projectId)
    const members = project.getStringSlice('members') || []
    const assignees = task.getStringSlice('assignees') || []
    const managerId = project.getString('manager')
    const merged = members.slice()
    if (managerId && merged.indexOf(managerId) === -1) merged.push(managerId)
    assignees.forEach((id) => { if (id && merged.indexOf(id) === -1) merged.push(id) })
    if (merged.length !== members.length) {
      project.set('members', merged)
      $app.dao().saveRecord(project)
    }
  } catch (error) {
    console.log('[project members] create sync failed', error)
  }
}, 'tasks')

onRecordAfterUpdateRequest((e) => {
  try {
    const task = e.record
    const projectId = task ? task.getString('project') : ''
    if (!projectId) return
    const project = $app.dao().findRecordById('projects', projectId)
    const members = project.getStringSlice('members') || []
    const assignees = task.getStringSlice('assignees') || []
    const managerId = project.getString('manager')
    const merged = members.slice()
    if (managerId && merged.indexOf(managerId) === -1) merged.push(managerId)
    assignees.forEach((id) => { if (id && merged.indexOf(id) === -1) merged.push(id) })
    if (merged.length !== members.length) {
      project.set('members', merged)
      $app.dao().saveRecord(project)
    }
  } catch (error) {
    console.log('[project members] update sync failed', error)
  }
}, 'tasks')
