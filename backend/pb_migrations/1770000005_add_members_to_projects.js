/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("t0d4fd6w124977r")

  // add members field
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "members001",
    "name": "members",
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

  // update list rule to filter by members
  collection.listRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || members ~ @request.auth.id"
  collection.viewRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || members ~ @request.auth.id"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("t0d4fd6w124977r")

  // remove members field
  collection.schema.removeField("members001")

  // restore original rules
  collection.listRule = "@request.auth.id != \"\""
  collection.viewRule = "@request.auth.id != \"\""

  return dao.saveCollection(collection)
})


