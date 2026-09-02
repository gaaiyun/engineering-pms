import { describe, expect, it } from 'vitest'
import { toolResult } from './format.js'

describe('MCP tool formatting', () => {
  const data = { page: 1, items: [{ title: 'a|b', note: '<unsafe>\nline' }] }

  it('keeps structured content identical for JSON and markdown', () => {
    const json = toolResult(data, 'json')
    const markdown = toolResult(data, 'markdown')
    expect(json.structuredContent).toEqual(data)
    expect(markdown.structuredContent).toEqual(data)
    expect(json.content[0]!.text).toContain('"title": "a|b"')
    expect(markdown.content[0]!.text).toContain('a\\|b')
    expect(markdown.content[0]!.text).toContain('&lt;unsafe>')
  })
})
