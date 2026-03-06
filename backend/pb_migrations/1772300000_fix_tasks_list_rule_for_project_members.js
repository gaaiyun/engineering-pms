/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("u1yzlxykrh2gyjt")

  // Allow employees to see all tasks in projects they belong to (for timeline view)
  const rule = '@request.auth.id != "" && (' +
    'assignees.id ?= @request.auth.id || ' +
    '@request.auth.role = "manager" || ' +
    '@request.auth.role = "admin" || ' +
    'project.members ~ @request.auth.id' +
  ')'

  collection.listRule = rule
  collection.viewRule = rule

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("u1yzlxykrh2gyjt")

  const rule = '@request.auth.id != "" && (' +
    'assignees.id ?= @request.auth.id || ' +
    '@request.auth.role = "manager" || ' +
    '@request.auth.role = "admin"' +
  ')'

  collection.listRule = rule
  collection.viewRule = rule

  return dao.saveCollection(collection)
})
