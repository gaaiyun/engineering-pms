/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const notifications = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  try {
    const f = notifications.schema.getFieldByName("type")
    const v = new Set(f.options.values || [])
    v.add("audit_rejected")
    f.options.values = [...v]
  } catch (_) { /* ignore */ }

  return dao.saveCollection(notifications)
}, (db) => {
  const dao = new Dao(db)
  const notifications = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  try {
    const f = notifications.schema.getFieldByName("type")
    f.options.values = (f.options.values || []).filter((x) => x !== "audit_rejected")
  } catch (_) { /* ignore */ }

  return dao.saveCollection(notifications)
})
