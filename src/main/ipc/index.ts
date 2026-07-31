import { registerSystemHandlers } from './handlers/system.ipc'
import { registerWorkspaceHandlers } from './handlers/workspace.ipc'
import { registerSessionHandlers } from './handlers/session.ipc'
import { registerImportHandlers } from './handlers/import.ipc'
import { registerSearchHandlers } from './handlers/search.ipc'
import { registerAiHandlers } from './handlers/ai.ipc'
import { registerSharingHandlers } from './handlers/sharing.ipc'
import { registerBgImportHandlers } from './handlers/bgImport.ipc'
import { registerKnowledgeHandlers } from './handlers/knowledge.ipc'

export function registerIpcHandlers(): void {
  registerSystemHandlers()
  registerWorkspaceHandlers()
  registerSessionHandlers()
  registerImportHandlers()
  registerSearchHandlers()
  registerAiHandlers()
  registerSharingHandlers()
  registerBgImportHandlers()
  registerKnowledgeHandlers()
}
