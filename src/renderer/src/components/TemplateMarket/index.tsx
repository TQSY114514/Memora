import { useState, useEffect, useCallback } from 'react'

interface TemplateMarketPanelProps {
  onClose: () => void
}

interface Template {
  id: string; name: string; description: string
  author: string; category: string; tags: string[]
  downloads: number; knowledgeCount: number; preferenceCount: number
}

const CATEGORIES = ['全部', '开发', '学术', '产品']

export function TemplateMarketPanel({ onClose }: TemplateMarketPanelProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<Record<string, unknown> | null>(null)
  const [importing, setImporting] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importResult, setImportResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.Memora.templates.list()
      setTemplates(list)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSelect(id: string) {
    setSelectedId(id)
    try {
      const template = await window.Memora.templates.get(id)
      setSelectedTemplate(template as Record<string, unknown>)
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleExport(id: string) {
    try {
      const json = await window.Memora.templates.export(id)
      if (json) {
        await window.Memora.saveFileDialog({
          defaultName: `memora_template_${id}.json`,
          content: json
        })
      }
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleImport() {
    if (!importJson) return
    setImporting(true)
    try {
      const result = await window.Memora.templates.import(importJson)
      if (result.success) {
        setImportResult(`模板"${(result.template as { name?: string })?.name ?? '未知'}"导入成功！`)
        setImportJson('')
        load()
      } else {
        setImportResult(`导入失败：${result.error}`)
      }
    } catch (e) {
      setImportResult(`导入失败：${String(e)}`)
    } finally {
      setImporting(false)
    }
  }

  const filtered = templates.filter((t) => {
    const matchCategory = activeCategory === '全部' || t.category === activeCategory
    const matchSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchCategory && matchSearch
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-lg shadow-xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">记忆模板市场</h2>
            <p className="text-xs text-fg-muted mt-0.5">社区驱动的专家记忆包，一键导入使用</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary text-lg">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 搜索 */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="Memora-input w-full text-sm"
            placeholder="搜索模板..."
          />

          {/* 分类 */}
          <div className="flex items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  activeCategory === cat
                    ? 'bg-accent text-white'
                    : 'bg-bg-hover text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 模板列表 */}
          {loading ? (
            <div className="text-center text-xs text-fg-muted py-8">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-xs text-fg-muted py-8">暂无模板</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleSelect(t.id)}
                  className={`bg-bg-hover rounded-md p-4 cursor-pointer transition-colors hover:bg-bg-tertiary ${
                    selectedId === t.id ? 'ring-1 ring-accent' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-medium">{t.name}</h3>
                    <span className="text-[10px] text-fg-muted bg-bg-primary px-1.5 py-0.5 rounded">
                      {t.category}
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted mt-1 line-clamp-2">{t.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {t.tags.map((tag) => (
                      <span key={tag} className="text-[10px] text-fg-muted bg-bg-primary px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-fg-muted">
                    <span>{t.author}</span>
                    <span>{t.knowledgeCount} 知识</span>
                    <span>{t.preferenceCount} 偏好</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExport(t.id) }}
                      className="text-[10px] text-accent hover:underline"
                    >导出</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 选中模板详情 */}
          {selectedTemplate && (
            <div className="bg-bg-hover rounded-md p-4">
              <h3 className="text-sm font-medium mb-2">模板详情</h3>
              <pre className="text-xs overflow-auto max-h-40 bg-bg-primary p-3 rounded">
                {JSON.stringify(selectedTemplate, null, 2)}
              </pre>
              <button
                onClick={() => { setSelectedId(null); setSelectedTemplate(null) }}
                className="text-xs text-fg-muted mt-2 hover:underline"
              >关闭</button>
            </div>
          )}

          {/* 导入模板 */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-medium mb-2">导入模板</h3>
            <div className="flex items-start gap-2">
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="Memora-input text-xs flex-1"
                rows={4}
                placeholder="粘贴模板 JSON..."
              />
              <button
                onClick={handleImport}
                disabled={importing || !importJson}
                className="Memora-btn Memora-btn-primary text-xs px-4 py-1.5"
              >
                {importing ? '导入中...' : '导入'}
              </button>
            </div>
            {importResult && (
              <div className="mt-2 p-2 rounded text-xs bg-accent/10 text-accent">
                {importResult}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-md text-xs bg-red-500/10 text-red-500">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}