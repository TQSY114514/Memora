import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the database layer so importing memoryLifecycle does not pull in
// electron / better-sqlite3 (both unavailable in the vitest node environment).
vi.mock('../src/database/connection', () => ({
  getDatabase: vi.fn()
}))
vi.mock('../src/database/repositories/preferencesRepo', () => ({
  listPreferences: vi.fn(() => [])
}))

import {
  ebbinghausRetention,
  memoryStrength,
  classifyMemoryTier
} from '../src/main/memoryLifecycle'
import type { Preference } from '@shared/types'

// Fixed "now" so time-based math is deterministic.
const NOW = new Date('2026-01-15T00:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

function makePref(overrides: Partial<Preference> = {}): Preference {
  return {
    id: 'p1',
    workspaceId: 'ws1',
    subject: 'language',
    value: 'TypeScript',
    confidence: 0.5,
    source: 'manual',
    status: 'active',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    accessCount: 0,
    ...overrides
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ebbinghausRetention', () => {
  it('returns 1.0 at t=0 (and for negative time)', () => {
    expect(ebbinghausRetention(0, 0)).toBe(1.0)
    expect(ebbinghausRetention(0, 5)).toBe(1.0)
    expect(ebbinghausRetention(-3, 2)).toBe(1.0)
  })

  it('higher accessCount yields higher retention at the same elapsed time', () => {
    const days = 10
    const r0 = ebbinghausRetention(days, 0) // S=1
    const r2 = ebbinghausRetention(days, 2) // S=30
    const r4 = ebbinghausRetention(days, 4) // S=180

    expect(r4).toBeGreaterThan(r2)
    expect(r2).toBeGreaterThan(r0)
  })

  it('retention decreases monotonically over time for a fixed accessCount', () => {
    const r1 = ebbinghausRetention(1, 1) // S=6
    const r5 = ebbinghausRetention(5, 1)
    const r20 = ebbinghausRetention(20, 1)

    expect(r1).toBeGreaterThan(r5)
    expect(r5).toBeGreaterThan(r20)
    // all retention values stay within (0, 1]
    expect(r1).toBeLessThanOrEqual(1)
    expect(r20).toBeGreaterThan(0)
  })
})

// getStabilityFactor is module-private (not exported). We verify its mapping
// indirectly: at daysSinceLastAccess === S, R = e^(-t/S) collapses to e^-1,
// so each (accessCount -> S) pair is confirmed by checking that retention
// equals e^-1 exactly at t = S.
describe('getStabilityFactor (private — verified indirectly via ebbinghausRetention)', () => {
  it.each([
    [0, 1],
    [1, 6],
    [2, 30],
    [3, 90],
    [4, 180],
    [5, 180], // 4+ caps at 180
    [99, 180]
  ])('accessCount %i -> stability factor %i (retention == e^-1 at t=S)', (accessCount, S) => {
    expect(ebbinghausRetention(S, accessCount)).toBeCloseTo(Math.exp(-1), 5)
  })

  it('at t=2*S retention is e^-2 (confirms S scales the curve, not just a lookup)', () => {
    expect(ebbinghausRetention(12, 1)).toBeCloseTo(Math.exp(-2), 5) // S=6 -> e^(-12/6)=e^-2
    expect(ebbinghausRetention(60, 2)).toBeCloseTo(Math.exp(-2), 5) // S=30 -> e^(-60/30)=e^-2
  })
})

describe('memoryStrength', () => {
  it('new preference (never accessed, high confidence) has moderate strength', () => {
    // lastAccessedAt undefined -> defaults to 30 days decay; accessCount 0 -> S=1,
    // so retention = e^-30 ~= 0, accessBonus = 0. strength ~= confidence * 0.5.
    const pref = makePref({ confidence: 0.9, accessCount: 0 }) // no lastAccessedAt

    const strength = memoryStrength(pref)

    expect(strength).toBeCloseTo(0.45, 2) // 0.9 * 0.5
    expect(strength).toBeGreaterThanOrEqual(0.3)
    expect(strength).toBeLessThan(0.6) // "moderate"
  })

  it('frequently accessed preference has higher strength than a fresh one', () => {
    const fresh = makePref({ confidence: 0.9, accessCount: 0 })
    const frequent = makePref({
      confidence: 0.9,
      accessCount: 10,
      lastAccessedAt: NOW.toISOString() // 0 days since access -> retention 1.0
    })

    const freshStrength = memoryStrength(fresh)
    const frequentStrength = memoryStrength(frequent)

    // 0.9*0.5 + 1.0*0.3 + min(0.2, 10*0.02) = 0.45 + 0.3 + 0.2 = 0.95
    expect(frequentStrength).toBeCloseTo(0.95, 2)
    expect(frequentStrength).toBeGreaterThan(freshStrength)
  })

  it('strength is clamped to [0, 1]', () => {
    const low = makePref({ confidence: 0, accessCount: 0 }) // 0*0.5 + ~0 + 0 = 0
    const high = makePref({
      confidence: 1,
      accessCount: 100,
      lastAccessedAt: NOW.toISOString()
    })

    expect(memoryStrength(low)).toBeGreaterThanOrEqual(0)
    expect(memoryStrength(low)).toBeLessThanOrEqual(1)
    expect(memoryStrength(high)).toBeLessThanOrEqual(1)
  })
})

describe('classifyMemoryTier', () => {
  it('very new + no access -> working (overrides strength via the freshness rule)', () => {
    const pref = makePref({
      createdAt: NOW.toISOString(), // 0 days old (< 7)
      accessCount: 0, // (< 2)
      confidence: 0.9,
      lastAccessedAt: NOW.toISOString() // would otherwise give high strength
    })

    expect(classifyMemoryTier(pref)).toBe('working')
  })

  it('high strength (old, well-accessed, high confidence) -> long_term', () => {
    const pref = makePref({
      createdAt: daysAgoIso(30), // not fresh
      accessCount: 10,
      lastAccessedAt: NOW.toISOString(),
      confidence: 0.9
    })

    expect(memoryStrength(pref)).toBeGreaterThan(0.6)
    expect(classifyMemoryTier(pref)).toBe('long_term')
  })

  it('medium strength -> short_term', () => {
    // confidence 0.4, accessCount 2 (accessBonus 0.04), accessed now:
    // strength = 0.4*0.5 + 1.0*0.3 + 0.04 = 0.54 -> short_term
    const pref = makePref({
      createdAt: daysAgoIso(30),
      accessCount: 2,
      lastAccessedAt: NOW.toISOString(),
      confidence: 0.4
    })

    const strength = memoryStrength(pref)
    expect(strength).toBeGreaterThanOrEqual(0.3)
    expect(strength).toBeLessThan(0.6)
    expect(classifyMemoryTier(pref)).toBe('short_term')
  })

  it('weak strength (low confidence, never accessed) -> working', () => {
    const pref = makePref({
      createdAt: daysAgoIso(30), // old enough to escape the freshness rule
      accessCount: 0,
      confidence: 0.1 // never accessed -> 30d decay; 0.1*0.5 + ~0 = 0.05 < 0.3
    })

    expect(memoryStrength(pref)).toBeLessThan(0.3)
    expect(classifyMemoryTier(pref)).toBe('working')
  })
})
