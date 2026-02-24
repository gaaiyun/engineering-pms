/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("u1yzlxykrh2gyjt")

  const hasField = (name) => {
    try {
      return !!collection.schema.getFieldByName(name)
    } catch (_) {
      return false
    }
  }

  // ---- status enum: align to v2 (keep "processing" for legacy data compatibility) ----
  try {
    const statusField = collection.schema.getFieldByName("status")
    statusField.options.values = [
      "pending",
      "in_progress",
      "blocked",
      "completed",
      "overdue",
      "processing", // legacy
    ]
  } catch (_) {
    // ignore
  }

  // ---- fields used by v2 frontend/scripts ----
  if (!hasField("description")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "dscv2a01",
      "name": "description",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    }))
  }

  if (!hasField("priority")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "prtv2a01",
      "name": "priority",
      "type": "select",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "maxSelect": 1, "values": ["low", "normal", "high"] }
    }))
  }

  if (!hasField("created_by")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "crbv2a01",
      "name": "created_by",
      "type": "relation",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {
        "collectionId": "_pb_users_auth_",
        "cascadeDelete": false,
        "minSelect": null,
        "maxSelect": 1,
        "displayFields": null
      }
    }))
  }

  if (!hasField("start_date")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "stdv2a01",
      "name": "start_date",
      "type": "date",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": "", "max": "" }
    }))
  }

  if (!hasField("completed_at")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "cmpv2a01",
      "name": "completed_at",
      "type": "date",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": "", "max": "" }
    }))
  }

  if (!hasField("sequence")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "seqv2a01",
      "name": "sequence",
      "type": "number",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    }))
  }

  if (!hasField("is_milestone")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "mlsv2a01",
      "name": "is_milestone",
      "type": "bool",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    }))
  }

  if (!hasField("blocker")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "blkv2a01",
      "name": "blocker",
      "type": "json",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "maxSize": 2000000 }
    }))
  }

  if (!hasField("predecessor_tasks")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "prdv2a01",
      "name": "predecessor_tasks",
      "type": "relation",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {
        "collectionId": "u1yzlxykrh2gyjt",
        "cascadeDelete": false,
        "minSelect": null,
        "maxSelect": null,
        "displayFields": null
      }
    }))
  }

  if (!hasField("next_assignees")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "nxtv2a01",
      "name": "next_assignees",
      "type": "relation",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {
        "collectionId": "_pb_users_auth_",
        "cascadeDelete": false,
        "minSelect": null,
        "maxSelect": null,
        "displayFields": null
      }
    }))
  }

  // Optional: Admin approval/scoring (used by AdminDashboard)
  if (!hasField("approved")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "aprv2a01",
      "name": "approved",
      "type": "bool",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    }))
  }

  if (!hasField("approved_by")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "apbv2a01",
      "name": "approved_by",
      "type": "relation",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {
        "collectionId": "_pb_users_auth_",
        "cascadeDelete": false,
        "minSelect": null,
        "maxSelect": 1,
        "displayFields": null
      }
    }))
  }

  if (!hasField("score")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "scrv2a01",
      "name": "score",
      "type": "number",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": 0, "max": null, "noDecimal": false }
    }))
  }

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("u1yzlxykrh2gyjt")

  // revert status enum
  try {
    const statusField = collection.schema.getFieldByName("status")
    statusField.options.values = ["pending", "processing", "completed", "overdue"]
  } catch (_) {
    // ignore
  }

  // remove added fields
  collection.schema.removeField("dscv2a01")
  collection.schema.removeField("prtv2a01")
  collection.schema.removeField("crbv2a01")
  collection.schema.removeField("stdv2a01")
  collection.schema.removeField("cmpv2a01")
  collection.schema.removeField("seqv2a01")
  collection.schema.removeField("mlsv2a01")
  collection.schema.removeField("blkv2a01")
  collection.schema.removeField("prdv2a01")
  collection.schema.removeField("nxtv2a01")
  collection.schema.removeField("aprv2a01")
  collection.schema.removeField("apbv2a01")
  collection.schema.removeField("scrv2a01")

  return dao.saveCollection(collection)
})

