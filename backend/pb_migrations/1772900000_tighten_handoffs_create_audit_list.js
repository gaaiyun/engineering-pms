/// <reference path="../pb_data/types.d.ts" />
/**
 * Round 4 / Agent K 发现的 2 个安全漏洞修复
 *
 * P6（HIGH 越权）：
 *   原 handoffs.createRule = '@request.auth.id != ""'
 *   攻击：任何登录用户能给"别人的 task"创建 handoff，绕过流程上送。
 *   修复：要求 submitter = @request.auth.id（前端 useMarkTaskComplete
 *   已经传入 submitter: pb.authStore.model?.id，无破坏性）。
 *
 * P8（MED 信息泄露）：
 *   原 audit_logs.listRule = '@request.auth.id != ""'
 *   攻击：员工 A 能列出 project B 的所有审计日志（即使 A 不在 B.members）。
 *   修复：限制为 admin/manager OR project.members ~ auth.id。
 *
 * down migration 回退到原 rule。
 */
migrate((db) => {
  const dao = new Dao(db)

  // P6: handoffs.createRule
  const handoffs = dao.findCollectionByNameOrId("hnd0ffsv2pms001")
  handoffs.createRule = '@request.auth.id != "" && submitter = @request.auth.id'
  dao.saveCollection(handoffs)

  // P8: audit_logs.listRule
  const auditLogs = dao.findCollectionByNameOrId("auditv2pms00001")
  auditLogs.listRule = '@request.auth.role = "admin" || @request.auth.role = "manager" || project.members.id ?= @request.auth.id'
  // viewRule 同时收紧（防绕过 list 直接 view 拿到详情）
  auditLogs.viewRule = '@request.auth.role = "admin" || @request.auth.role = "manager" || project.members.id ?= @request.auth.id'
  dao.saveCollection(auditLogs)

  return null
}, (db) => {
  const dao = new Dao(db)

  // 回退
  const handoffs = dao.findCollectionByNameOrId("hnd0ffsv2pms001")
  handoffs.createRule = '@request.auth.id != ""'
  dao.saveCollection(handoffs)

  const auditLogs = dao.findCollectionByNameOrId("auditv2pms00001")
  auditLogs.listRule = '@request.auth.id != ""'
  auditLogs.viewRule = '@request.auth.id != ""'
  dao.saveCollection(auditLogs)

  return null
})
