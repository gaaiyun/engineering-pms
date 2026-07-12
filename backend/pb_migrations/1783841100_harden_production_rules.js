/// <reference path="../pb_data/types.d.ts" />
/**
 * Close the production rules that previously trusted every authenticated
 * browser. This migration is deployed only after notifications_api.pb.js and
 * the matching frontend command have passed the production-copy tests.
 *
 * Collections are resolved by name because production and local IDs diverged.
 * Rollback uses the verified cold backup; a hard-coded down migration would
 * overwrite environment-specific rules and is therefore intentionally empty.
 */
migrate((db) => {
  const dao = new Dao(db)
  const active = '@request.auth.id != "" && @request.auth.is_active = true'
  const activeManager = active + ' && (@request.auth.role = "admin" || @request.auth.role = "manager")'
  const saveRules = (name, rules) => {
    let collection
    try {
      collection = dao.findCollectionByNameOrId(name)
    } catch {
      // 历史生产库可能没有启用某个可选集合（例如 attachments）。
      // 权限收紧不应因此阻断其余集合迁移和 PocketBase 启动。
      return
    }
    if (Object.prototype.hasOwnProperty.call(rules, 'listRule')) collection.listRule = rules.listRule
    if (Object.prototype.hasOwnProperty.call(rules, 'viewRule')) collection.viewRule = rules.viewRule
    if (Object.prototype.hasOwnProperty.call(rules, 'createRule')) collection.createRule = rules.createRule
    if (Object.prototype.hasOwnProperty.call(rules, 'updateRule')) collection.updateRule = rules.updateRule
    if (Object.prototype.hasOwnProperty.call(rules, 'deleteRule')) collection.deleteRule = rules.deleteRule
    dao.saveCollection(collection)
  }

  saveRules('users', {
    listRule: active,
    viewRule: active,
    createRule: '@request.data.role = "employee"',
    updateRule: active + ' && (@request.auth.role = "admin" || (@request.auth.id = id && @request.data.role:isset = false && @request.data.is_active:isset = false && @request.data.flower_count:isset = false))',
    deleteRule: active + ' && @request.auth.role = "admin"',
  })

  const ownProject = '@request.auth.role = "admin" || @request.auth.role = "manager" || manager = @request.auth.id || members.id ?= @request.auth.id'
  saveRules('projects', {
    listRule: active + ' && (' + ownProject + ')',
    viewRule: active + ' && (' + ownProject + ')',
    createRule: activeManager,
    updateRule: activeManager,
    deleteRule: activeManager,
  })

  const taskParticipant = '@request.auth.role = "admin" || @request.auth.role = "manager" || project.manager = @request.auth.id || project.members.id ?= @request.auth.id || assignees.id ?= @request.auth.id'
  const employeeTaskUpdate = 'assignees.id ?= @request.auth.id && @request.data.project:isset = false && @request.data.stage_name:isset = false && @request.data.description:isset = false && @request.data.assignees:isset = false && @request.data.created_by:isset = false && @request.data.start_date:isset = false && @request.data.deadline:isset = false && @request.data.sequence:isset = false && @request.data.priority:isset = false && @request.data.is_milestone:isset = false && @request.data.predecessor_tasks:isset = false && @request.data.next_assignees:isset = false && @request.data.status:isset = false && @request.data.blocker:isset = false && @request.data.completed_at:isset = false && @request.data.approved:isset = false && @request.data.score:isset = false'
  saveRules('tasks', {
    listRule: active + ' && (' + taskParticipant + ')',
    viewRule: active + ' && (' + taskParticipant + ')',
    createRule: activeManager,
    updateRule: active + ' && (@request.auth.role = "admin" || @request.auth.role = "manager" || (' + employeeTaskUpdate + '))',
    deleteRule: activeManager,
  })

  saveRules('notifications', {
    listRule: active + ' && user = @request.auth.id',
    viewRule: active + ' && user = @request.auth.id',
    createRule: null,
    updateRule: active + ' && user = @request.auth.id && @request.data.user:isset = false',
    deleteRule: active + ' && user = @request.auth.id',
  })

  const projectParticipant = active + ' && (@request.auth.role = "admin" || @request.auth.role = "manager" || project.manager = @request.auth.id || project.members.id ?= @request.auth.id)'
  saveRules('handoffs', {
    listRule: projectParticipant + ' || submitter = @request.auth.id || proposed_assignees.id ?= @request.auth.id',
    viewRule: projectParticipant + ' || submitter = @request.auth.id || proposed_assignees.id ?= @request.auth.id',
    createRule: active + ' && submitter = @request.auth.id && from_task.assignees.id ?= @request.auth.id',
    updateRule: activeManager,
    deleteRule: activeManager,
  })

  saveRules('audit_logs', {
    listRule: projectParticipant,
    viewRule: projectParticipant,
    createRule: active + ' && operator = @request.auth.id && (' + projectParticipant + ' || task.assignees.id ?= @request.auth.id)',
    updateRule: activeManager,
    deleteRule: active + ' && @request.auth.role = "admin"',
  })

  const commentParticipant = active + ' && (@request.auth.role = "admin" || @request.auth.role = "manager" || project.manager = @request.auth.id || project.members.id ?= @request.auth.id || step.assignees.id ?= @request.auth.id)'
  saveRules('comments', {
    listRule: commentParticipant,
    viewRule: commentParticipant,
    createRule: 'author = @request.auth.id && (' + commentParticipant + ')',
    updateRule: active + ' && author = @request.auth.id && @request.data.author:isset = false',
    deleteRule: active + ' && (author = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager")',
  })

  saveRules('device_tokens', {
    listRule: active + ' && user = @request.auth.id',
    viewRule: active + ' && user = @request.auth.id',
    createRule: active + ' && user = @request.auth.id',
    updateRule: active + ' && user = @request.auth.id && @request.data.user:isset = false',
    deleteRule: active + ' && user = @request.auth.id',
  })

  saveRules('attachments', {
    listRule: commentParticipant,
    viewRule: commentParticipant,
    createRule: 'uploader = @request.auth.id && (' + commentParticipant + ')',
    updateRule: active + ' && uploader = @request.auth.id && @request.data.uploader:isset = false',
    deleteRule: active + ' && (uploader = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager")',
  })

  saveRules('flower_logs', {
    listRule: active + ' && (user = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager")',
    viewRule: active + ' && (user = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager")',
    createRule: activeManager,
    updateRule: activeManager,
    deleteRule: active + ' && @request.auth.role = "admin"',
  })

  saveRules('progress_logs', {
    listRule: projectParticipant,
    viewRule: projectParticipant,
    createRule: active + ' && user = @request.auth.id && (' + projectParticipant + ')',
    updateRule: activeManager,
    deleteRule: active + ' && @request.auth.role = "admin"',
  })
}, (_) => {
  // Forward-only production reconciliation; restore the cold backup to rollback.
})
