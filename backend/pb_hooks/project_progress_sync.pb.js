/// <reference path="../pb_data/types.d.ts" />
/**
 * PB Hook v3 — projects.total_tasks / completed_tasks / progress 自动维护
 *
 * v1/v2 失败教训：
 *   - v1: limit=0 不合法、错误冒泡阻塞 task create
 *   - v2: 外层定义的 function `recomputeProjectProgress` 在 hook callback
 *     沙箱内 ReferenceError（每个 onRecord 注册似乎是独立的 isolated scope）
 *
 * v3 修复：把函数体内联到每个 callback。代码重复但能跑。
 * 关键保障：所有错误被 try/catch 吞，绝不阻塞主请求。
 */

onRecordAfterCreateRequest((e) => {
  try {
    const projectId = e.record.getString('project')
    if (!projectId) return
    try {
      const dao = $app.dao()
      let project
      try { project = dao.findRecordById('projects', projectId) }
      catch { return }
      let allTasks
      try { allTasks = dao.findRecordsByFilter('tasks', 'project = "' + projectId + '"', '', 10000, 0) }
      catch (err) { console.log('[project_progress] findRecordsByFilter fail:', err); return }
      const total = allTasks.length
      let completed = 0
      for (let i = 0; i < allTasks.length; i++) {
        if (allTasks[i].getString('status') === 'completed') completed++
      }
      const progress = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0
      if (project.getInt('total_tasks') === total &&
          project.getInt('completed_tasks') === completed &&
          Math.abs(project.getFloat('progress') - progress) < 0.05) {
        return
      }
      project.set('total_tasks', total)
      project.set('completed_tasks', completed)
      project.set('progress', progress)
      try { dao.saveRecord(project); console.log('[project_progress] after-create recomputed', projectId, 'total=', total, 'completed=', completed, 'progress=', progress) }
      catch (saveErr) { console.log('[project_progress] save fail:', saveErr) }
    } catch (err) { console.log('[project_progress] create inner err:', err) }
  } catch (err) { console.log('[project_progress] create outer err:', err) }
}, 'tasks')

onRecordAfterUpdateRequest((e) => {
  try {
    const projectId = e.record.getString('project')
    if (!projectId) return
    try {
      const dao = $app.dao()
      let project
      try { project = dao.findRecordById('projects', projectId) }
      catch { return }
      let allTasks
      try { allTasks = dao.findRecordsByFilter('tasks', 'project = "' + projectId + '"', '', 10000, 0) }
      catch (err) { console.log('[project_progress] findRecordsByFilter fail:', err); return }
      const total = allTasks.length
      let completed = 0
      for (let i = 0; i < allTasks.length; i++) {
        if (allTasks[i].getString('status') === 'completed') completed++
      }
      const progress = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0
      if (project.getInt('total_tasks') === total &&
          project.getInt('completed_tasks') === completed &&
          Math.abs(project.getFloat('progress') - progress) < 0.05) {
        return
      }
      project.set('total_tasks', total)
      project.set('completed_tasks', completed)
      project.set('progress', progress)
      try { dao.saveRecord(project); console.log('[project_progress] after-update recomputed', projectId, 'total=', total, 'completed=', completed, 'progress=', progress) }
      catch (saveErr) { console.log('[project_progress] save fail:', saveErr) }
    } catch (err) { console.log('[project_progress] update inner err:', err) }
  } catch (err) { console.log('[project_progress] update outer err:', err) }
}, 'tasks')

onRecordAfterDeleteRequest((e) => {
  try {
    const projectId = e.record.getString('project')
    if (!projectId) return
    try {
      const dao = $app.dao()
      let project
      try { project = dao.findRecordById('projects', projectId) }
      catch { return }
      let allTasks
      try { allTasks = dao.findRecordsByFilter('tasks', 'project = "' + projectId + '"', '', 10000, 0) }
      catch (err) { console.log('[project_progress] findRecordsByFilter fail:', err); return }
      const total = allTasks.length
      let completed = 0
      for (let i = 0; i < allTasks.length; i++) {
        if (allTasks[i].getString('status') === 'completed') completed++
      }
      const progress = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0
      if (project.getInt('total_tasks') === total &&
          project.getInt('completed_tasks') === completed &&
          Math.abs(project.getFloat('progress') - progress) < 0.05) {
        return
      }
      project.set('total_tasks', total)
      project.set('completed_tasks', completed)
      project.set('progress', progress)
      try { dao.saveRecord(project); console.log('[project_progress] after-delete recomputed', projectId, 'total=', total, 'completed=', completed, 'progress=', progress) }
      catch (saveErr) { console.log('[project_progress] save fail:', saveErr) }
    } catch (err) { console.log('[project_progress] delete inner err:', err) }
  } catch (err) { console.log('[project_progress] delete outer err:', err) }
}, 'tasks')
