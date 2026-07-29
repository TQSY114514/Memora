import type { Importer } from './types'

/** 导入器注册表 */
const registry = new Map<string, Importer>()

/** 注册导入器 */
export function registerImporter(importer: Importer): void {
  registry.set(importer.provider, importer)
}

/** 获取指定平台的导入器 */
export function getImporter(provider: string): Importer | undefined {
  return registry.get(provider)
}

/** 列出所有已注册导入器 */
export function listImporters(): Importer[] {
  return Array.from(registry.values())
}

/**
 * 自动探测：遍历所有导入器，找到第一个能处理该文件的
 * @returns 匹配的导入器，未匹配则返回 null
 */
export function detectImporter(filename: string, content: string): Importer | null {
  for (const importer of registry.values()) {
    try {
      if (importer.detect(filename, content)) return importer
    } catch {
      // 探测失败跳过
    }
  }
  return null
}
