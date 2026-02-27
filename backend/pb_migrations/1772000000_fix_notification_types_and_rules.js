/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)

  // ===== Fix notifications =====
  const notifications = dao.findCollectionByNameOrId("purhahujq0wmfxe")

  // Add missing type enum values (task_update, project_update) used by frontend
  try {
    const f = notifications.schema.getFieldByName("type")
    f.options.values = [
      "task", "task_update", "task_assigned", "step_updated",
      "handoff", "handoff_pending", "handoff_result",
      "blocker", "blocker_reported",
      "project_update",
      "deadline_warning", "overdue",
      "flower", "comment_mention", "escalation", "progress_update", "system",
    ]
  } catch (_) { /* ignore */ }

  // Restore correct per-user rules (1771969798 migration broke these)
  notifications.listRule = "@request.auth.id = user"
  notifications.viewRule = "@request.auth.id = user"
  notifications.createRule = "@request.auth.id != \"\""
  notifications.updateRule = "@request.auth.id = user"
  notifications.deleteRule = "@request.auth.id = user"

  dao.saveCollection(notifications)

  // ===== Fix projects =====
  const projects = dao.findCollectionByNameOrId("t0d4fd6w124977r")

  // Restore member-based list/view rules (1771969798 migration broke these)
  projects.listRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || members ~ @request.auth.id"
  projects.viewRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\" || members ~ @request.auth.id"

  dao.saveCollection(projects)
}, (db) => {
  const dao = new Dao(db)

  // Revert notifications
  const notifications = dao.findCollectionByNameOrId("purhahujq0wmfxe")
  notifications.listRule = "@request.auth.id != \"\""
  notifications.viewRule = "@request.auth.id != \"\""
  notifications.updateRule = "@request.auth.id != \"\""
  notifications.deleteRule = "@request.auth.role = \"admin\" || @request.auth.role = \"manager\""
  dao.saveCollection(notifications)

  // Revert projects
  const projects = dao.findCollectionByNameOrId("t0d4fd6w124977r")
  projects.listRule = "@request.auth.id != \"\""
  projects.viewRule = "@request.auth.id != \"\""
  dao.saveCollection(projects)
})
