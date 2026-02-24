/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_")

  collection.listRule = "@request.auth.id != \"\""
  collection.viewRule = "@request.auth.id != \"\""
  collection.updateRule = "@request.auth.id = id || @request.auth.role = \"admin\""

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "fxdtuma8",
    "name": "phone",
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
    "id": "vjv6nt7q",
    "name": "is_active",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_")

  collection.listRule = "id != ''"
  collection.viewRule = "id != ''"
  collection.updateRule = "id = @request.auth.id"

  // remove
  collection.schema.removeField("fxdtuma8")

  // remove
  collection.schema.removeField("vjv6nt7q")

  return dao.saveCollection(collection)
})
