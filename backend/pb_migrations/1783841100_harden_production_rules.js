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
  const saveRules = (name, rules) => {
    const collection = dao.findCollectionByNameOrId(name)
    if (Object.prototype.hasOwnProperty.call(rules, 'listRule')) collection.listRule = rules.listRule
    if (Object.prototype.hasOwnProperty.call(rules, 'viewRule')) collection.viewRule = rules.viewRule
    if (Object.prototype.hasOwnProperty.call(rules, 'createRule')) collection.createRule = rules.createRule
    if (Object.prototype.hasOwnProperty.call(rules, 'updateRule')) collection.updateRule = rules.updateRule
    if (Object.prototype.hasOwnProperty.call(rules, 'deleteRule')) collection.deleteRule = rules.deleteRule
    dao.saveCollection(collection)
  }

  saveRules('users', {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.data.role = "employee"',
    updateRule: '@request.auth.role = "admin" || (@request.auth.id = id && @request.data.role:isset = false && @request.data.is_active:isset = false && @request.data.flower_count:isset = false)',
    deleteRule: '@request.auth.role = "admin"',
  })

  saveRules('projects', {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
  })

  const employeeTaskUpdate = 'assignees.id ?= @request.auth.id && @request.data.project:isset = false && @request.data.stage_name:isset = false && @request.data.description:isset = false && @request.data.assignees:isset = false && @request.data.created_by:isset = false && @request.data.start_date:isset = false && @request.data.deadline:isset = false && @request.data.sequence:isset = false && @request.data.priority:isset = false && @request.data.is_milestone:isset = false && @request.data.predecessor_tasks:isset = false && @request.data.next_assignees:isset = false'
  saveRules('tasks', {
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || (' + employeeTaskUpdate + ')',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
  })

  saveRules('notifications', {
    listRule: 'user = @request.auth.id',
    viewRule: 'user = @request.auth.id',
    createRule: null,
    updateRule: 'user = @request.auth.id && @request.data.user:isset = false',
    deleteRule: 'user = @request.auth.id',
  })

  const projectParticipant = '@request.auth.role = "admin" || @request.auth.role = "manager" || project.manager = @request.auth.id || project.members.id ?= @request.auth.id'
  saveRules('handoffs', {
    listRule: projectParticipant + ' || submitter = @request.auth.id || proposed_assignees.id ?= @request.auth.id',
    viewRule: projectParticipant + ' || submitter = @request.auth.id || proposed_assignees.id ?= @request.auth.id',
    createRule: '@request.auth.id != "" && submitter = @request.auth.id && from_task.assignees.id ?= @request.auth.id',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
  })

  saveRules('audit_logs', {
    listRule: projectParticipant,
    viewRule: projectParticipant,
    createRule: '@request.auth.id != "" && operator = @request.auth.id && (' + projectParticipant + ' || task.assignees.id ?= @request.auth.id)',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin"',
  })

  const commentParticipant = '@request.auth.role = "admin" || @request.auth.role = "manager" || project.manager = @request.auth.id || project.members.id ?= @request.auth.id || step.assignees.id ?= @request.auth.id'
  saveRules('comments', {
    listRule: commentParticipant,
    viewRule: commentParticipant,
    createRule: 'author = @request.auth.id && (' + commentParticipant + ')',
    updateRule: 'author = @request.auth.id && @request.data.author:isset = false',
    deleteRule: 'author = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager"',
  })

  saveRules('device_tokens', {
    listRule: 'user = @request.auth.id',
    viewRule: 'user = @request.auth.id',
    createRule: 'user = @request.auth.id',
    updateRule: 'user = @request.auth.id && @request.data.user:isset = false',
    deleteRule: 'user = @request.auth.id',
  })

  saveRules('attachments', {
    listRule: commentParticipant,
    viewRule: commentParticipant,
    createRule: 'uploader = @request.auth.id && (' + commentParticipant + ')',
    updateRule: 'uploader = @request.auth.id && @request.data.uploader:isset = false',
    deleteRule: 'uploader = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager"',
  })

  saveRules('flower_logs', {
    listRule: 'user = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager"',
    viewRule: 'user = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager"',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin"',
  })

  saveRules('progress_logs', {
    listRule: projectParticipant,
    viewRule: projectParticipant,
    createRule: 'user = @request.auth.id && (' + projectParticipant + ')',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin"',
  })
}, (_) => {
  // Forward-only production reconciliation; restore the cold backup to rollback.
})
