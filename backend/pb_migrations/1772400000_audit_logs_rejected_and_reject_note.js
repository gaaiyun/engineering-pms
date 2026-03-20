/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("auditv2pms00001")

  // Extend review_status select with "rejected" (manager reject in Review Center)
  try {
    const f = collection.schema.getFieldByName("review_status")
    f.options.values = ["unread", "read", "approved", "rejected"]
  } catch (_) { /* field missing — ignore */ }

  // Optional note when review_status is rejected
  let hasRejectNote = false
  try {
    hasRejectNote = !!collection.schema.getFieldByName("reject_note")
  } catch (_) {
    hasRejectNote = false
  }
  if (!hasRejectNote) {
    collection.schema.addField(new SchemaField({
      system: false,
      id: "rjnt0001",
      name: "reject_note",
      type: "text",
      required: false,
      presentable: false,
      unique: false,
      options: { min: null, max: null, pattern: "" }
    }))
  }

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("auditv2pms00001")

  try {
    const f = collection.schema.getFieldByName("review_status")
    f.options.values = ["unread", "read", "approved"]
  } catch (_) { /* ignore */ }

  try {
    collection.schema.removeField("rjnt0001")
  } catch (_) { /* ignore */ }

  return dao.saveCollection(collection)
})
