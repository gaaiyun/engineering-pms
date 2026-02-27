/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  collection.listRule = "@request.auth.id = user"
  collection.viewRule = "@request.auth.id = user"
  collection.updateRule = "@request.auth.id = user"
  collection.deleteRule = "@request.auth.id = user"

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "zkpyiiwu",
    "name": "type",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
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
        "task_update",
        "project_update"
      ]
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  collection.listRule = "@request.auth.id != \"\""
  collection.viewRule = "@request.auth.id != \"\""
  collection.updateRule = "@request.auth.id != \"\""
  collection.deleteRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\""

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "zkpyiiwu",
    "name": "type",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
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
        "system"
      ]
    }
  }))

  return dao.saveCollection(collection)
})
