/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("t0d4fd6w124977r")

  collection.listRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || members ~ @request.auth.id"
  collection.viewRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || members ~ @request.auth.id"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("t0d4fd6w124977r")

  collection.listRule = "@request.auth.id != \"\""
  collection.viewRule = "@request.auth.id != \"\""

  return dao.saveCollection(collection)
})
