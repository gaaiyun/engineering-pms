/// <reference path="../pb_data/types.d.ts" />
/**
 * P0-3 安全 + 一致性修复（Agent C 数据流审计发现）
 *
 * 原 rules（来自 1770000001_created_handoffs.js）：
 *   handoffs.updateRule = '@request.auth.id != ""'
 *
 * 漏洞：任何登录用户能 PATCH /api/collections/handoffs/records/:id
 *   body { "status": "approved" } 直接绕过 useApproveHandoff 全流程：
 *   - 不创建下游任务
 *   - 不写 audit_log
 *   - 不通知项目成员
 *   - 不验证 reviewer 身份
 *
 * 修复：updateRule 限制为 admin / manager（与 audit_logs 一致策略）。
 *
 * 同时收紧：
 *   audit_logs.createRule 强制 operator = auth.id（防伪造审计）
 *
 * down migration：还原成原 rule（用于回退）
 */
migrate((db) => {
  const dao = new Dao(db)

  // 1) handoffs.updateRule 收紧
  const handoffs = dao.findCollectionByNameOrId("hnd0ffsv2pms001")
  handoffs.updateRule = '@request.auth.role = "admin" || @request.auth.role = "manager"'
  dao.saveCollection(handoffs)

  // 2) audit_logs.createRule 强制 operator 与 auth 一致（P1-2，顺带修）
  const auditLogs = dao.findCollectionByNameOrId("auditv2pms00001")
  auditLogs.createRule = '@request.auth.id != "" && operator = @request.auth.id'
  dao.saveCollection(auditLogs)

  return null
}, (db) => {
  const dao = new Dao(db)

  // 回退 handoffs.updateRule
  const handoffs = dao.findCollectionByNameOrId("hnd0ffsv2pms001")
  handoffs.updateRule = '@request.auth.id != ""'
  dao.saveCollection(handoffs)

  // 回退 audit_logs.createRule
  const auditLogs = dao.findCollectionByNameOrId("auditv2pms00001")
  auditLogs.createRule = '@request.auth.id != ""'
  dao.saveCollection(auditLogs)

  return null
})
