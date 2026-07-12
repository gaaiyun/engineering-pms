/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId('_pb_users_auth_')

  if (!collection.schema.getFieldByName('department')) {
    collection.schema.addField(new SchemaField({
      system: false,
      id: 'dept2026',
      name: 'department',
      type: 'text',
      required: false,
      presentable: false,
      unique: false,
      options: {
        min: null,
        max: 80,
        pattern: '',
      },
    }))
  }

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId('_pb_users_auth_')
  const field = collection.schema.getFieldByName('department')
  if (field) collection.schema.removeField(field.id)
  return dao.saveCollection(collection)
})
