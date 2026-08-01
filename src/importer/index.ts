import type { Importer } from './types'
import { chatgptImporter } from './chatgpt'
import { claudeImporter } from './claude'
import { deepseekImporter } from './deepseek'
import { kimiImporter } from './kimi'
import { qwenImporter } from './qwen'
import { geminiImporter } from './gemini'
import { grokImporter } from './grok'
import { cursorImporter } from './cursor'
import { markdownImporter } from './markdown'
import { jsonImporter } from './json'
import { htmlImporter } from './html'
import { registerImporter, listImporters, detectImporter, getImporter } from './registry'

let initialized = false

/** 注册所有内置导入器（幂等） */
export function registerBuiltins(): void {
  if (initialized) return
  // 注册顺序影响 detect 优先级：专用导入器在前，通用兜底在后
  registerImporter(chatgptImporter)
  registerImporter(claudeImporter)
  registerImporter(deepseekImporter)
  registerImporter(kimiImporter)
  registerImporter(qwenImporter)
  registerImporter(geminiImporter)
  registerImporter(grokImporter)
  registerImporter(cursorImporter)
  registerImporter(markdownImporter)
  registerImporter(jsonImporter)
  registerImporter(htmlImporter)
  initialized = true
}

export type { Importer }
export { listImporters, detectImporter, getImporter }
