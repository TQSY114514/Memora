/**
 * MCP 工具 schema 定义
 *
 * 定义 Memora 暴露给外部 AI 工具的 25 个工具的 inputSchema。
 * handler 逻辑见 server.ts 的 callTool。
 */

export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string; [k: string]: unknown }>
    required?: string[]
  }
}

export const TOOLS: McpTool[] = [
  {
    name: 'search_sessions',
    description: '全文搜索 Memora 中的 AI 对话。支持搜索对话标题和消息内容。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '返回结果数量上限，默认 10' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_session',
    description: '获取指定对话的完整内容（含所有消息）。需要提供 sessionId。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '对话 ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'list_sessions',
    description: '列出 Memora 中的对话。可按工作区/文件夹筛选，支持分页。',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: '按文件夹筛选（可选）' },
        limit: { type: 'number', description: '返回数量上限，默认 20' },
        offset: { type: 'number', description: '偏移量，默认 0' }
      }
    }
  },
  {
    name: 'list_workspaces',
    description: '列出所有工作区及其文件夹结构。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_tags',
    description: '列出所有标签。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_session_summary',
    description: '获取指定对话的 AI 总结（摘要、关键要点、待办事项）。如果未生成过总结则返回 null。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '对话 ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'add_session',
    description: '在 Memora 中创建新对话。返回新对话的 ID。可指定 provider（如 ChatGPT/Claude/Gemini 等）和 folderId。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '对话标题' },
        provider: { type: 'string', description: 'AI 平台标识，如 Claude/ChatGPT/Gemini/DeepSeek 等' },
        folderId: { type: 'string', description: '目标文件夹 ID（可选）' },
        messages: { type: 'array', description: '消息列表', items: { type: 'object' } }
      },
      required: ['title', 'provider']
    }
  },
  {
    name: 'add_message',
    description: '向指定对话追加一条消息。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标对话 ID' },
        role: { type: 'string', description: '消息角色：user/assistant/system/tool' },
        content: { type: 'string', description: '消息内容' },
        model: { type: 'string', description: '使用的模型（可选）' }
      },
      required: ['sessionId', 'role', 'content']
    }
  },
  {
    name: 'memory_recall',
    description:
      '语义召回：基于向量相似度从全库对话中检索与问题最相关的片段。适合「我以前有没有讨论过 X」「之前那个决定是怎么做的」这类模糊召回。需要先在 Memora UI 配置 AI 并建立向量索引。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '自然语言问题或要召回的主题' },
        limit: { type: 'number', description: '返回结果数量上限，默认 5' },
        threshold: { type: 'number', description: '相似度阈值（0-1），默认 0.25' }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_write',
    description:
      '知识沉淀：把一条重要信息（架构决定、Bug 解决方案、经验教训等）写入 Memora 知识库，便于以后召回复用。默认写入 knowledge_entries 表（type=knowledge），可指定 type=decision/task 写入决策或待办。若提供 folderId 则同时创建一条对话记录。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '知识条目标题（如「Electron 项目改用 SQLite 的决定」）' },
        content: { type: 'string', description: '要沉淀的知识内容（支持多段文本）' },
        provider: {
          type: 'string',
          description: '来源标识，默认为 Unknown。可设为具体 AI 平台名或 Manual'
        },
        folderId: { type: 'string', description: '目标文件夹 ID（可选，提供时同时创建对话记录）' },
        type: {
          type: 'string',
          description: '知识条目类型：knowledge（默认）/ decision / task',
          enum: ['knowledge', 'decision', 'task']
        },
        workspaceId: { type: 'string', description: '目标工作区 ID（写入 knowledge_entries 时必填）' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'knowledge_search',
    description:
      '搜索 Memora 知识库中的知识/决策/任务条目（FTS 全文，支持中文）。适合查找提炼后的结构化知识，而非原始对话片段。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        type: {
          type: 'string',
          description: '筛选类型（可选）：knowledge / decision / task',
          enum: ['knowledge', 'decision', 'task']
        },
        limit: { type: 'number', description: '返回数量上限，默认 10' }
      },
      required: ['query']
    }
  },
  {
    name: 'decision_search',
    description:
      '专搜架构决策（type=decision）。「之前为什么这么定？」「以前做过什么架构决定？」用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '返回数量上限，默认 10' }
      },
      required: ['query']
    }
  },
  {
    name: 'project_context',
    description:
      '组装某个工作区的项目上下文：近期决策 + 未完成任务 + 核心知识条目。让 AI 快速恢复项目状态，无需翻阅原始对话。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '目标工作区 ID' }
      },
      required: ['workspaceId']
    }
  },
  {
    name: 'memory_profile',
    description:
      '用户画像：返回当前用户的全部偏好（preferences），按类别分组。包括用户喜欢什么、用什么、偏好什么。让 AI 快速了解用户。「用户喜欢什么？」「用户用什么编辑器？」「用户偏好什么框架？」用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '目标工作区 ID' }
      },
      required: ['workspaceId']
    }
  },
  {
    name: 'memory_save_preference',
    description:
      '保存用户偏好：把一条用户偏好（如「喜欢初音未来」「用 VSCode」「偏好 Python」）写入记忆。自动检测冲突——如果同类别已有不同偏好，旧记忆自动标记为 superseded。「用户说他换安卓了」「用户提到喜欢 Python」时用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '目标工作区 ID' },
        subject: { type: 'string', description: '偏好类别，如 music / phone / language / editor / framework' },
        value: { type: 'string', description: '偏好值，如 初音未来 / android / Python' },
        sessionId: { type: 'string', description: '来源对话 ID（可选）' },
        confidence: { type: 'number', description: '置信度 0-1，默认 0.5' }
      },
      required: ['workspaceId', 'subject', 'value']
    }
  },
  {
    name: 'memory_forget',
    description:
      '遗忘：将一条偏好标记为 archived（软删除，保留审计痕迹）。用户说「忘掉我之前说的」「那条信息过时了」时用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        preferenceId: { type: 'string', description: '要遗忘的偏好 ID' }
      },
      required: ['preferenceId']
    }
  },
  {
    name: 'preference_search',
    description:
      '搜索用户偏好：FTS 全文搜索偏好记忆。「用户有没有提到过喜欢什么音乐？」「用户用什么手机？」用这个工具。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        workspaceId: { type: 'string', description: '限定工作区（可选）' },
        limit: { type: 'number', description: '返回数量上限，默认 10' }
      },
      required: ['query']
    }
  },
  {
    name: 'update_session',
    description: '更新对话的元数据（标题、描述、文件夹、收藏状态）。对话内容不变。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标对话 ID' },
        title: { type: 'string', description: '新标题（可选）' },
        description: { type: 'string', description: '新描述（可选）' },
        folderId: { type: 'string', description: '移动到指定文件夹（可选，传空字符串移出文件夹）' },
        isFavorite: { type: 'boolean', description: '是否收藏（可选）' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'delete_session',
    description: '删除指定对话（级联删除所有消息和标签关联）。不可恢复。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '要删除的对话 ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'create_folder',
    description: '在工作区中创建新文件夹。可指定父文件夹创建子文件夹。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '目标工作区 ID' },
        name: { type: 'string', description: '文件夹名称' },
        parentId: { type: 'string', description: '父文件夹 ID（可选，不传则创建根文件夹）' }
      },
      required: ['workspaceId', 'name']
    }
  },
  {
    name: 'list_folders',
    description: '列出工作区中的所有文件夹。支持按工作区筛选。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '目标工作区 ID（可选，不传则列出所有）' }
      }
    }
  },
  {
    name: 'export_session',
    description: '将指定对话导出为 Markdown 格式文本。适合保存到文件或作为上下文粘贴。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '要导出的对话 ID' },
        format: { type: 'string', description: '导出格式：markdown（默认）/ html', enum: ['markdown', 'html'] }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'summarize_session',
    description: '为指定对话生成 AI 总结（摘要 + 关键要点 + 待办事项 + 知识提取 + 偏好提取）。需要先配置 AI 供应商。返回生成的总结对象。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '要总结的对话 ID' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'knowledge_entry_update',
    description: '更新知识库中的条目（知识/决策/任务）。可修改标题、内容、类型、状态。',
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string', description: '知识条目 ID' },
        title: { type: 'string', description: '新标题（可选）' },
        content: { type: 'string', description: '新内容（可选）' },
        type: { type: 'string', description: '新类型（可选）：knowledge / decision / task', enum: ['knowledge', 'decision', 'task'] },
        status: { type: 'string', description: '新状态（可选）：active / archived / open / done' }
      },
      required: ['entryId']
    }
  },
  {
    name: 'knowledge_entry_delete',
    description: '删除知识库中的条目。不可恢复。',
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string', description: '要删除的知识条目 ID' }
      },
      required: ['entryId']
    }
  }]
