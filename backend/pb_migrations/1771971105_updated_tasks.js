/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("u1yzlxykrh2gyjt")

  collection.updateRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || assignees.id ?= @request.auth.id"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("u1yzlxykrh2gyjt")

  collection.updateRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\""

  return dao.saveCollection(collection)
})
