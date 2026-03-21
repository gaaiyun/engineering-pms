/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  try {
    const field = collection.schema.getFieldByName("type")
    const values = new Set(field.options.values || [])

    for (const value of [
      "task",
      "task_update",
      "task_assigned",
      "task_rollback",
      "step_updated",
      "handoff",
      "handoff_pending",
      "handoff_result",
      "blocker",
      "blocker_reported",
      "project_update",
      "deadline_warning",
      "overdue",
      "flower",
      "comment_mention",
      "escalation",
      "progress_update",
      "audit_rejected",
      "system",
    ]) {
      values.add(value)
    }

    field.options.values = [...values]
  } catch (_) { /* ignore */ }

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  try {
    const field = collection.schema.getFieldByName("type")
    field.options.values = [
      "task",
      "task_update",
      "task_assigned",
      "step_updated",
      "handoff",
      "handoff_pending",
      "handoff_result",
      "blocker",
      "blocker_reported",
      "project_update",
      "deadline_warning",
      "overdue",
      "flower",
      "comment_mention",
      "escalation",
      "progress_update",
      "system",
      "audit_rejected",
    ]
  } catch (_) { /* ignore */ }

  return dao.saveCollection(collection)
})
