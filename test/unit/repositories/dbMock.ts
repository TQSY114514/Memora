import { vi } from 'vitest'

export interface StmtResult {
  run?: unknown
  all?: unknown[]
  get?: unknown
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

/** Resolve a configured value: if it is a function, call it with the args. */
function resolve<T>(value: T | ((...args: any[]) => T), args: any[]): T {
  return typeof value === 'function' ? (value as (...a: any[]) => T)(...args) : value
}

/**
 * Build a flexible mock of the better-sqlite3 database used by the repositories.
 *
 * `prepare(sql)` returns an object with `run`/`all`/`get` that are configured
 * per-SQL via `stmtResults` (matched by whitespace-normalized substring of the
 * SQL). Anything not configured returns sensible defaults: `run` -> `{ changes: 1 }`,
 * `all` -> `[]`, `get` -> `undefined`.
 *
 * `run`/`all`/`get` may be a plain value or a function `(args) => value` for
 * stateful scenarios (e.g. a `get` that returns the row as it evolves or a `run`
 * that throws).
 */
export function makeDb() {
  const calls: any[] = []
  const stmtResults = new Map<string, StmtResult>()
  const db = {
    prepare: vi.fn((sql: string) => {
      calls.push(sql)
      const normalized = normalize(sql)
      const key = Array.from(stmtResults.keys()).find((k) => normalized.includes(k))
      const r = key ? stmtResults.get(key)! : {}
      return {
        run: vi.fn((...args: any[]) => {
          const ret = resolve(r.run, args) ?? { changes: 1 }
          calls.push({ run: args })
          return ret
        }),
        all: vi.fn((...args: any[]) => {
          const ret = resolve(r.all, args) ?? []
          calls.push({ all: args })
          return ret
        }),
        get: vi.fn((...args: any[]) => {
          const ret = resolve(r.get, args)
          calls.push({ get: args })
          return ret
        })
      }
    }),
    exec: vi.fn(),
    transaction: vi.fn((fn: () => void) => fn)
  }
  return { db, calls, stmtResults }
}