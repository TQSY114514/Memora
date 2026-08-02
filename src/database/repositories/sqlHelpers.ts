/**
 * 共享 SQL 构建工具
 *
 * 统一 UPDATE SET 子句构建模式，确保列名走白名单、值走命名参数。
 */

/** 列名合法性校验（仅允许字母/数字/下划线） */
const COLUMN_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * 构建 UPDATE SET 子句（安全：列名走白名单校验，值走命名参数）
 *
 * @param patch 要更新的字段（camelCase key → snake_case column）
 * @param columnMap 允许更新的列映射：{ camelCaseKey: 'snake_case_column' }
 * @returns { sets: string[], params: Record<string, unknown> }
 *
 * @example
 * const { sets, params } = buildUpdateSets(
 *   { value: 'foo', confidence: 0.9 },
 *   { value: 'value', confidence: 'confidence' }
 * )
 * // sets: ['value = @value', 'confidence = @confidence']
 * // params: { value: 'foo', confidence: 0.9 }
 */
export function buildUpdateSets(
  patch: Record<string, unknown>,
  columnMap: Record<string, string>
): { sets: string[]; params: Record<string, unknown> } {
  const sets: string[] = []
  const params: Record<string, unknown> = {}

  for (const [key, column] of Object.entries(columnMap)) {
    if (key in patch && COLUMN_NAME_RE.test(column)) {
      sets.push(`${column} = @${column}`)
      params[column] = patch[key]
    }
  }

  return { sets, params }
}
