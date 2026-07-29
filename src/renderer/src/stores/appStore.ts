import { create } from 'zustand'
import type { Workspace, ChatSession, Folder } from '@shared/types'

interface AppState {
  // 当前选中的
  activeWorkspaceId: string | null
  activeFolderId: string | null
  activeSessionId: string | null

  // 数据缓存
  workspaces: Workspace[]
  folders: Folder[]
  sessions: ChatSession[]
  activeSession: ChatSession | null

  // 搜索
  searchQuery: string
  searchResults: import('@shared/types').SearchResult[] | null
  isSearchMode: boolean

  // UI 状态
  loading: boolean
  error: string | null

  // Actions
  setActiveWorkspace: (id: string | null) => void
  setActiveFolder: (id: string | null) => void
  setActiveSession: (id: string | null) => void
  setWorkspaces: (ws: Workspace[]) => void
  setFolders: (f: Folder[]) => void
  setSessions: (s: ChatSession[]) => void
  setActiveSessionData: (s: ChatSession | null) => void
  setSearch: (query: string, results: import('@shared/types').SearchResult[] | null) => void
  clearSearch: () => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
}

export const useStore = create<AppState>((set) => ({
  activeWorkspaceId: null,
  activeFolderId: null,
  activeSessionId: null,
  workspaces: [],
  folders: [],
  sessions: [],
  activeSession: null,
  searchQuery: '',
  searchResults: null,
  isSearchMode: false,
  loading: false,
  error: null,

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id, activeFolderId: null }),
  setActiveFolder: (id) => set({ activeFolderId: id }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setWorkspaces: (ws) => set({ workspaces: ws }),
  setFolders: (f) => set({ folders: f }),
  setSessions: (s) => set({ sessions: s }),
  setActiveSessionData: (s) => set({ activeSession: s }),
  setSearch: (query, results) =>
    set({ searchQuery: query, searchResults: results, isSearchMode: !!query }),
  clearSearch: () =>
    set({ searchQuery: '', searchResults: null, isSearchMode: false }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e })
}))
