/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("cmntsv2pms00001")

  collection.deleteRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\""

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("cmntsv2pms00001")

  collection.deleteRule = null

  return dao.saveCollection(collection)
})
