/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("auditv2pms00001")

  collection.deleteRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\""

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "8otlpqaa",
    "name": "review_status",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "unread",
        "read",
        "approved"
      ]
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "m1em6vos",
    "name": "reviewed_by",
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

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("auditv2pms00001")

  collection.deleteRule = null

  // remove
  collection.schema.removeField("8otlpqaa")

  // remove
  collection.schema.removeField("m1em6vos")

  return dao.saveCollection(collection)
})
