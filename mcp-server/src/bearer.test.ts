import { describe, expect, it } from 'vitest'
import { isAuthorizedBearer } from './bearer.js'

describe('MCP bearer authentication', () => {
  const token = 'a'.repeat(40)

  it('accepts an exact bearer token', () => {
    expect(isAuthorizedBearer(`Bearer ${token}`, token)).toBe(true)
  })

  it('rejects missing, malformed, repeated and wrong tokens', () => {
    expect(isAuthorizedBearer(undefined, token)).toBe(false)
    expect(isAuthorizedBearer('Basic abc', token)).toBe(false)
    expect(isAuthorizedBearer(`Bearer ${token},other`, token)).toBe(false)
    expect(isAuthorizedBearer(`Bearer ${'b'.repeat(40)}`, token)).toBe(false)
    expect(isAuthorizedBearer(`Bearer ${token.slice(0, 39)}`, token)).toBe(false)
  })

  it('rejects non-string header arrays', () => {
    expect(isAuthorizedBearer([`Bearer ${token}`], token)).toBe(false)
  })
})
