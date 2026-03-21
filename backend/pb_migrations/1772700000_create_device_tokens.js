/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "devtoknsv2pms1",
    "created": "2026-03-21 00:00:00.000Z",
    "updated": "2026-03-21 00:00:00.000Z",
    "name": "device_tokens",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "dtusr0001",
        "name": "user",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "_pb_users_auth_",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "dtplt001",
        "name": "platform",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSelect": 1,
          "values": ["android", "ios", "web"]
        }
      },
      {
        "system": false,
        "id": "dtdvc001",
        "name": "device_id",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false,
        "id": "dttkn001",
        "name": "token",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false,
        "id": "dtnam001",
        "name": "device_name",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false,
        "id": "dtver001",
        "name": "app_version",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false,
        "id": "dtlst001",
        "name": "last_seen_at",
        "type": "date",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "min": "", "max": "" }
      },
      {
        "system": false,
        "id": "dtact001",
        "name": "is_active",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX idx_device_tokens_user_device ON device_tokens (user, platform, device_id)"
    ],
    "listRule": "user = @request.auth.id || @request.auth.role = \"admin\" || @request.auth.role = \"manager\"",
    "viewRule": "user = @request.auth.id || @request.auth.role = \"admin\" || @request.auth.role = \"manager\"",
    "createRule": "@request.auth.id != \"\"",
    "updateRule": "user = @request.auth.id || @request.auth.role = \"admin\" || @request.auth.role = \"manager\"",
    "deleteRule": "user = @request.auth.id || @request.auth.role = \"admin\" || @request.auth.role = \"manager\"",
    "options": {}
  })

  return Dao(db).saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("devtoknsv2pms1")
  return dao.deleteCollection(collection)
})
