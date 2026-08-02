import { registerSystemHandlers } from './handlers/system.ipc'
import { registerWorkspaceHandlers } from './handlers/workspace.ipc'
import { registerSessionHandlers } from './handlers/session.ipc'
import { registerImportHandlers } from './handlers/import.ipc'
import { registerSearchHandlers } from './handlers/search.ipc'
import { registerAiHandlers } from './handlers/ai.ipc'
import { registerSharingHandlers } from './handlers/sharing.ipc'
import { registerBgImportHandlers } from './handlers/bgImport.ipc'
import { registerKnowledgeHandlers } from './handlers/knowledge.ipc'
import { registerPreferenceHandlers } from './handlers/preferences.ipc'
import { registerMemoryLifecycleHandlers } from './handlers/memoryLifecycle.ipc'
import { registerDataMigrationHandlers } from './handlers/dataMigration.ipc'
import { registerMemoryIOHandlers } from './handlers/memoryIO.ipc'
import { registerDistillationHandlers } from './handlers/distillation.ipc'
import { registerAuditHandlers } from './handlers/audit.ipc'
import { registerMcpPermissionsHandlers } from './handlers/mcpPermissions.ipc'
import { registerMemoryAgentHandlers } from './handlers/memoryAgent.ipc'
import { registerSyncHandlers } from './handlers/sync.ipc'
import { registerCapsuleHandlers } from './handlers/capsule.ipc'
import { registerTeamHandlers } from './handlers/team.ipc'
import { registerTemplateHandlers } from './handlers/templates.ipc'
import { registerMigrationHandlers } from './handlers/migration.ipc'

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
  registerPreferenceHandlers()
  registerMemoryLifecycleHandlers()
  registerDataMigrationHandlers()
  registerMemoryIOHandlers()
  registerDistillationHandlers()
  registerAuditHandlers()
  registerMcpPermissionsHandlers()
  registerMemoryAgentHandlers()
  registerSyncHandlers()
  registerCapsuleHandlers()
  registerTeamHandlers()
  registerTemplateHandlers()
  registerMigrationHandlers()
}
