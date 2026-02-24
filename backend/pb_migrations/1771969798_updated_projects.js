/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("t0d4fd6w124977r")

  collection.listRule = "@request.auth.id != \"\""
  collection.viewRule = "@request.auth.id != \"\""
  collection.updateRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\""
  collection.deleteRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\""

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ddnjtmbm",
    "name": "code",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "dbpuowzx",
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

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "mf5itmgk",
    "name": "deadline",
    "type": "date",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": "",
      "max": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("t0d4fd6w124977r")

  collection.listRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || members ~ @request.auth.id"
  collection.viewRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || members ~ @request.auth.id"
  collection.updateRule = "@request.auth.id != \"\""
  collection.deleteRule = null

  // remove
  collection.schema.removeField("ddnjtmbm")

  // remove
  collection.schema.removeField("dbpuowzx")

  // remove
  collection.schema.removeField("mf5itmgk")

  return dao.saveCollection(collection)
})
