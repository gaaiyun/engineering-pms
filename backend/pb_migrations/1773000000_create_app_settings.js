/// <reference path="../pb_data/types.d.ts" />
/**
 * C1 安全 — 创建 app_settings collection 服务端存 API key
 *
 * 背景（Agent D v2 HIGH-CRITICAL）：siliconflow API key 明文存
 * localStorage，多处读写（AIConsole / SettingsPage / ManagerDashboard）。
 * 任何 XSS / 装了恶意浏览器插件的用户都能拖走 key。
 *
 * 修复：API key 服务端存储 → PB hook 代理 LLM 请求。
 *
 * 表设计：
 *   key: string (PK，e.g. "siliconflow_api_key")
 *   value: string (实际 token，PB SQLite 文件级权限保护)
 *   updated_by: relation users (谁更新的)
 *
 * 权限规则（严格收紧）：
 *   listRule: admin || manager
 *   viewRule: admin || manager
 *   createRule: admin（仅 admin 能加新 key）
 *   updateRule: admin || manager
 *   deleteRule: admin
 *
 * 注：value 字段虽然 PB 仍以明文存 SQLite，但访问受 RLS 限制，比
 * localStorage 安全度高一个数量级（用户浏览器侧根本读不到 value）。
 * 进一步的加密由部署侧 SQLite 文件权限管控。
 */
migrate((db) => {
  const collection = new Collection({
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
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin"',
  })

  const dao = new Dao(db)
  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId('app_settings')
  return dao.deleteCollection(collection)
})
