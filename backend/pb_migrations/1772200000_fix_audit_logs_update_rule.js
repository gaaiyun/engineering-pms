/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("auditv2pms00001")

  // Allow managers (not just admins) to update audit logs (mark read/approved)
  collection.updateRule = '@request.auth.role = "admin" || @request.auth.role = "manager"'

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("auditv2pms00001")

  collection.updateRule = '@request.auth.id != ""'

  return dao.saveCollection(collection)
})
