export type OutputFormat = 'json' | 'markdown'

function escapeMarkdown(value: unknown) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').replace(/</g, '&lt;')
}

function toMarkdown(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '')
  if (Array.isArray(value)) {
    if (value.length === 0) return '暂无数据'
    const rows = value as Array<Record<string, unknown>>
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))].slice(0, 12)
    return `| ${keys.map(escapeMarkdown).join(' | ')} |\n| ${keys.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${keys.map(key => escapeMarkdown(row[key])).join(' | ')} |`).join('\n')}`
  }
  const record = value as Record<string, unknown>
  if (Array.isArray(record.items)) {
    const header = [`第 ${record.page ?? 1} 页`, record.has_more ? '还有下一页' : '已到末页'].join('，')
    return `${header}\n\n${toMarkdown(record.items)}`
  }
  return Object.entries(record).map(([key, item]) => `- **${escapeMarkdown(key)}**：${escapeMarkdown(typeof item === 'object' ? JSON.stringify(item) : item)}`).join('\n')
}

export function toolResult(data: Record<string, unknown>, format: OutputFormat = 'markdown') {
  return {
    content: [{ type: 'text' as const, text: format === 'json' ? JSON.stringify(data, null, 2) : toMarkdown(data) }],
    structuredContent: data,
  }
}
