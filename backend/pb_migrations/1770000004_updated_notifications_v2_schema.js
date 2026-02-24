/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  const hasField = (name) => {
    try {
      return !!collection.schema.getFieldByName(name)
    } catch (_) {
      return false
    }
  }

  // Rename legacy fields to current naming (preserve data)
  try {
    const f = collection.schema.getFieldByName("message")
    f.name = "content"
  } catch (_) { /* ignore */ }

  try {
    const f = collection.schema.getFieldByName("related_id")
    f.name = "link_id"
  } catch (_) { /* ignore */ }

  // Add missing fields
  if (!hasField("link_type")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "lnktyp01",
      "name": "link_type",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    }))
  }

  if (!hasField("read_at")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "readat01",
      "name": "read_at",
      "type": "date",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": "", "max": "" }
    }))
  }

  // Expand type enum to cover v2 notifications
  try {
    const f = collection.schema.getFieldByName("type")
    f.options.values = [
      "task",
      "task_assigned",
      "step_updated",
      "handoff",
      "handoff_pending",
      "handoff_result",
      "blocker",
      "blocker_reported",
      "deadline_warning",
      "overdue",
      "flower",
      "comment_mention",
      "escalation",
      "progress_update",
      "system",
    ]
  } catch (_) { /* ignore */ }

  // Tighten rules: only recipient can list/view/update/delete
  collection.listRule = "@request.auth.id = user"
  collection.viewRule = "@request.auth.id = user"
  collection.createRule = "@request.auth.id != \"\""
  collection.updateRule = "@request.auth.id = user"
  collection.deleteRule = "@request.auth.id = user"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  // revert renames
  try {
    const f = collection.schema.getFieldByName("content")
    f.name = "message"
  } catch (_) { /* ignore */ }

  try {
    const f = collection.schema.getFieldByName("link_id")
    f.name = "related_id"
  } catch (_) { /* ignore */ }

  // remove added fields
  collection.schema.removeField("lnktyp01")
  collection.schema.removeField("readat01")

  // revert type enum
  try {
    const f = collection.schema.getFieldByName("type")
    f.options.values = ["task", "overdue", "system", "flower"]
  } catch (_) { /* ignore */ }

  // revert rules
  collection.listRule = "@request.auth.id != \"\""
  collection.viewRule = "@request.auth.id != \"\""
  collection.createRule = "@request.auth.id != \"\""
  collection.updateRule = "@request.auth.id != \"\""
  collection.deleteRule = null

  return dao.saveCollection(collection)
})

