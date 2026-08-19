import { timingSafeEqual } from 'node:crypto'

export function isAuthorizedBearer(header: string | string[] | undefined, expected: string): boolean {
  if (typeof header !== 'string') return false
  const match = /^Bearer ([^\s,]+)$/.exec(header)
  if (!match?.[1]) return false
  const actualBuffer = Buffer.from(match[1])
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}
