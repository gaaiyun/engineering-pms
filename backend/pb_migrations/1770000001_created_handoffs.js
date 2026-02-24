/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "hnd0ffsv2pms001",
    "created": "2026-02-03 00:00:01.000Z",
    "updated": "2026-02-03 00:00:01.000Z",
    "name": "handoffs",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "hproj001",
        "name": "project",
        "type": "relation",
        "required": true,
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
        "id": "hfrom001",
        "name": "from_task",
        "type": "relation",
        "required": true,
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
        "id": "htitl001",
        "name": "proposed_title",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false,
        "id": "hdesc001",
        "name": "proposed_description",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false,
        "id": "hassi001",
        "name": "proposed_assignees",
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
      },
      {
        "system": false,
        "id": "hstdt001",
        "name": "proposed_start_date",
        "type": "date",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "min": "", "max": "" }
      },
      {
        "system": false,
        "id": "hdue0001",
        "name": "proposed_due_date",
        "type": "date",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": { "min": "", "max": "" }
      },
      {
        "system": false,
        "id": "hstat001",
        "name": "status",
        "type": "select",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": { "maxSelect": 1, "values": ["pending", "approved", "rejected"] }
      },
      {
        "system": false,
        "id": "hsub0001",
        "name": "submitter",
        "type": "relation",
        "required": true,
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
        "id": "hrev0001",
        "name": "reviewer",
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
        "id": "hnote001",
        "name": "review_note",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": { "min": null, "max": null, "pattern": "" }
      },
      {
        "system": false,
        "id": "happ0001",
        "name": "approved_task",
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
  const collection = dao.findCollectionByNameOrId("hnd0ffsv2pms001")
  return dao.deleteCollection(collection)
})

