/// <reference path="../pb_data/types.d.ts" />
/**
 * Production reconciliation for diverged migration histories.
 *
 * This migration resolves collections by name and never assumes the IDs used
 * by the local demo database. It only creates the server-only app_settings
 * collection (when absent) and enables manager/admin users to persist their
 * own AI summaries. API clients cannot read app_settings at all.
 *
 * Rollback is intentionally a no-op. Production rollback must restore the
 * verified pre-migration cold backup instead of deleting secrets or records.
 */
migrate((db) => {
  const dao = new Dao(db)

  let appSettings = null
  try {
    appSettings = dao.findCollectionByNameOrId('app_settings')
  } catch (_) {
    // The production database currently has no app_settings collection.
  }

  if (!appSettings) {
    appSettings = new Collection({
      id: 'appsettv2pms01',
      type: 'base',
      name: 'app_settings',
      system: false,
      schema: [
        {
          id: 'asetkey001',
          name: 'key',
          type: 'text',
          required: true,
          unique: true,
          options: { max: 100 },
        },
        {
          id: 'asetval002',
          name: 'value',
          type: 'text',
          required: false,
          options: { max: 5000 },
        },
        {
          id: 'asetdesc03',
          name: 'description',
          type: 'text',
          required: false,
          options: { max: 500 },
        },
        {
          id: 'asetupdby4',
          name: 'updated_by',
          type: 'relation',
          required: false,
          options: {
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            minSelect: null,
            maxSelect: 1,
          },
        },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_appset_key ON app_settings(key)'],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    })
    dao.saveCollection(appSettings)
  } else {
    appSettings.listRule = null
    appSettings.viewRule = null
    appSettings.createRule = null
    appSettings.updateRule = null
    appSettings.deleteRule = null
    dao.saveCollection(appSettings)
  }

  const summaries = dao.findCollectionByNameOrId('ai_summaries')
  const ownManagerSummary = '(@request.auth.role = "admin" || @request.auth.role = "manager") && target_user = @request.auth.id'
  summaries.listRule = ownManagerSummary
  summaries.viewRule = ownManagerSummary
  summaries.createRule = ownManagerSummary
  summaries.updateRule = ownManagerSummary
  summaries.deleteRule = ownManagerSummary
  dao.saveCollection(summaries)
}, (_) => {
  // Forward-only reconciliation. Restore the verified cold backup to rollback.
})
