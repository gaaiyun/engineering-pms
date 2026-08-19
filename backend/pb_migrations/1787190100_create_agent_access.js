/// <reference path="../pb_data/types.d.ts" />

// 受控 Agent 身份、一次性确认和审计字段。所有集合 API rule 保持关闭。
migrate((db) => {
  const dao = new Dao(db)
  const usersId = dao.findCollectionByNameOrId('users').id
  const projectsId = dao.findCollectionByNameOrId('projects').id

  let serviceAccounts
  try {
    serviceAccounts = dao.findCollectionByNameOrId('service_accounts')
  } catch (_) {
    serviceAccounts = new Collection({
      id: 'svcagents000001',
      name: 'service_accounts',
      type: 'auth',
      system: false,
      schema: [
        { system: false, id: 'svcname1', name: 'name', type: 'text', required: true, presentable: true, unique: false, options: { min: 1, max: 100, pattern: '' } },
        { system: false, id: 'svcowner', name: 'owner', type: 'relation', required: true, presentable: false, unique: false, options: { collectionId: usersId, cascadeDelete: false, minSelect: 1, maxSelect: 1, displayFields: null } },
        { system: false, id: 'svcscope', name: 'scopes', type: 'select', required: true, presentable: false, unique: false, options: { maxSelect: 20, values: ['read', 'write', 'comment', 'approve', 'archive', 'delete', 'reassign'] } },
        { system: false, id: 'svcenabl', name: 'enabled', type: 'bool', required: false, presentable: false, unique: false, options: {} },
        { system: false, id: 'svcexp01', name: 'expires_at', type: 'date', required: true, presentable: false, unique: false, options: { min: '', max: '' } },
        { system: false, id: 'svclast1', name: 'last_used_at', type: 'date', required: false, presentable: false, unique: false, options: { min: '', max: '' } },
        { system: false, id: 'svcprojs', name: 'allowed_projects', type: 'relation', required: false, presentable: false, unique: false, options: { collectionId: projectsId, cascadeDelete: false, minSelect: null, maxSelect: 999, displayFields: null } },
      ],
      indexes: [],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      options: {
        allowEmailAuth: false,
        allowOAuth2Auth: false,
        allowUsernameAuth: true,
        exceptEmailDomains: null,
        manageRule: null,
        minPasswordLength: 32,
        onlyEmailDomains: null,
        onlyVerified: false,
        requireEmail: false,
      },
    })
    dao.saveCollection(serviceAccounts)
  }

  try {
    dao.findCollectionByNameOrId('agent_operations')
  } catch (_) {
    const operations = new Collection({
      id: 'agentops0000001',
      name: 'agent_operations',
      type: 'base',
      system: false,
      schema: [
        { system: false, id: 'opsvc001', name: 'service_account', type: 'relation', required: true, presentable: false, unique: false, options: { collectionId: serviceAccounts.id, cascadeDelete: false, minSelect: 1, maxSelect: 1, displayFields: null } },
        { system: false, id: 'opidem01', name: 'idempotency_key', type: 'text', required: true, presentable: false, unique: false, options: { min: 8, max: 120, pattern: '^[A-Za-z0-9._:-]+$' } },
        { system: false, id: 'opreq001', name: 'request_id', type: 'text', required: true, presentable: false, unique: false, options: { min: 8, max: 120, pattern: '^[A-Za-z0-9._:-]+$' } },
        { system: false, id: 'opact001', name: 'action', type: 'text', required: true, presentable: false, unique: false, options: { min: 1, max: 80, pattern: '^[a-z0-9_]+$' } },
        { system: false, id: 'ophash01', name: 'request_hash', type: 'text', required: true, presentable: false, unique: false, options: { min: 64, max: 64, pattern: '^[a-f0-9]{64}$' } },
        { system: false, id: 'opstatus', name: 'status', type: 'select', required: true, presentable: false, unique: false, options: { maxSelect: 1, values: ['pending', 'succeeded', 'failed'] } },
        { system: false, id: 'oppay001', name: 'payload', type: 'json', required: true, presentable: false, unique: false, options: { maxSize: 100000 } },
        { system: false, id: 'opres001', name: 'result', type: 'json', required: false, presentable: false, unique: false, options: { maxSize: 100000 } },
        { system: false, id: 'opcode01', name: 'confirmation_hash', type: 'text', required: false, presentable: false, unique: false, options: { min: null, max: 64, pattern: '' } },
        { system: false, id: 'opexp001', name: 'expires_at', type: 'date', required: false, presentable: false, unique: false, options: { min: '', max: '' } },
        { system: false, id: 'opused01', name: 'consumed_at', type: 'date', required: false, presentable: false, unique: false, options: { min: '', max: '' } },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_agent_ops_idempotency ON agent_operations (service_account, idempotency_key)'],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      options: {},
    })
    dao.saveCollection(operations)
  }

  const audits = dao.findCollectionByNameOrId('audit_logs')
  if (!audits.schema.getFieldByName('source')) {
    audits.schema.addField(new SchemaField({ system: false, id: 'audsrc01', name: 'source', type: 'select', required: false, presentable: false, unique: false, options: { maxSelect: 1, values: ['user', 'agent'] } }))
  }
  if (!audits.schema.getFieldByName('service_account')) {
    audits.schema.addField(new SchemaField({ system: false, id: 'audsvc01', name: 'service_account', type: 'relation', required: false, presentable: false, unique: false, options: { collectionId: serviceAccounts.id, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null } }))
  }
  if (!audits.schema.getFieldByName('request_id')) {
    audits.schema.addField(new SchemaField({ system: false, id: 'audreq01', name: 'request_id', type: 'text', required: false, presentable: false, unique: false, options: { min: null, max: 120, pattern: '' } }))
  }
  dao.saveCollection(audits)
}, (_) => {
  // 生产结构迁移使用冷备回滚。
})
