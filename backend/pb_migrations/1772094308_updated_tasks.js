/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("u1yzlxykrh2gyjt")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ers9za8r",
    "name": "status",
    "type": "select",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "pending",
        "in_progress",
        "blocked",
        "completed"
      ]
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("u1yzlxykrh2gyjt")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ers9za8r",
    "name": "status",
    "type": "select",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "pending",
        "in_progress",
        "blocked",
        "completed",
        "overdue",
        "processing"
      ]
    }
  }))

  return dao.saveCollection(collection)
})
