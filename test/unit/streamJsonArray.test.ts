import { describe, it, expect } from 'vitest'
import { StreamParseError, LARGE_FILE_THRESHOLD } from '@importer/streamJsonArray'

describe('streamJsonArray', () => {
  describe('StreamParseError', () => {
    it('携带 code 和 message', () => {
      const err = new StreamParseError('NOT_ARRAY', '顶层不是数组')
      expect(err.code).toBe('NOT_ARRAY')
      expect(err.message).toBe('顶层不是数组')
      expect(err.name).toBe('StreamParseError')
      expect(err instanceof Error).toBe(true)
    })
  })

  describe('LARGE_FILE_THRESHOLD', () => {
    it('为 10MB', () => {
      expect(LARGE_FILE_THRESHOLD).toBe(10 * 1024 * 1024)
    })
  })
})
