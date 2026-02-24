/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "auditv2pms00001",
    "created": "2026-02-03 00:00:03.000Z",
    "updated": "2026-02-03 00:00:03.000Z",
    "name": "audit_logs",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "aproj001",
        "name": "project",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "t0d4fd6w124977r",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "atask001",
        "name": "task",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "u1yzlxykrh2gyjt",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "aact0001",
        "name": "action_type",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false,
        "id": "aopr0001",
        "name": "operator",
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
      },
      {
        "system": false,
        "id": "abef0001",
        "name": "before_data",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "maxSize": 2000000 }
      },
      {
        "system": false,
        "id": "aaft0001",
        "name": "after_data",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "maxSize": 2000000 }
      },
      {
        "system": false,
        "id": "anot0001",
        "name": "note",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      }
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "createRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id != \"\"",
    "deleteRule": null,
    "options": {}
  })

  return Dao(db).saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("auditv2pms00001")
  return dao.deleteCollection(collection)
})

