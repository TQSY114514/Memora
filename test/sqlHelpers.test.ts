import { describe, it, expect } from 'vitest'
import { buildUpdateSets } from '../src/database/repositories/sqlHelpers'

describe('buildUpdateSets', () => {
  it('normal update: builds sets and params for all mapped fields present in patch', () => {
    const { sets, params } = buildUpdateSets(
      { value: 'foo', confidence: 0.9 },
      { value: 'value', confidence: 'confidence' }
    )

    expect(sets).toHaveLength(2)
    expect(sets).toContain('value = @value')
    expect(sets).toContain('confidence = @confidence')
    expect(params).toEqual({ value: 'foo', confidence: 0.9 })
  })

  it('partial update: only fields present in patch are included', () => {
    const { sets, params } = buildUpdateSets(
      { value: 'bar' },
      { value: 'value', confidence: 'confidence', subject: 'subject' }
    )

    expect(sets).toEqual(['value = @value'])
    expect(params).toEqual({ value: 'bar' })
  })

  it('empty patch: returns empty sets array and no params', () => {
    const { sets, params } = buildUpdateSets({}, { value: 'value', confidence: 'confidence' })

    expect(sets).toEqual([])
    expect(params).toEqual({})
  })

  it('invalid column name is filtered out by the column-name regex', () => {
    // 'invalid column' (space) and '1bad' (leading digit) both fail
    // /^[a-zA-Z_][a-zA-Z0-9_]*$/ and must be skipped, leaving the valid column only.
    const { sets, params } = buildUpdateSets(
      { value: 'foo', bad: 'x', worse: 'y' },
      { value: 'value', bad: 'invalid column', worse: '1bad' }
    )

    expect(sets).toEqual(['value = @value'])
    expect(params).toEqual({ value: 'foo' })
    expect(sets.some((s) => s.includes('invalid column'))).toBe(false)
    expect(sets.some((s) => s.includes('1bad'))).toBe(false)
  })

  it('extra fields in patch that are not in columnMap are ignored', () => {
    const { sets, params } = buildUpdateSets(
      { value: 'foo', confidence: 0.9, unknownField: 'ignore-me', id: 123 },
      { value: 'value', confidence: 'confidence' }
    )

    expect(sets).toHaveLength(2)
    expect(params).toEqual({ value: 'foo', confidence: 0.9 })
    expect(params).not.toHaveProperty('unknownField')
    expect(params).not.toHaveProperty('id')
  })

  it('column missing from patch (not in patch) is skipped even if in columnMap', () => {
    // confidence is in columnMap but absent from patch -> should not appear
    const { sets, params } = buildUpdateSets(
      { value: 'only' },
      { value: 'value', confidence: 'confidence' }
    )

    expect(sets).toEqual(['value = @value'])
    expect(params).not.toHaveProperty('confidence')
  })
})
