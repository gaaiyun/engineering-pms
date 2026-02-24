/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("hnd0ffsv2pms001")

  collection.deleteRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\""

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("hnd0ffsv2pms001")

  collection.deleteRule = null

  return dao.saveCollection(collection)
})
