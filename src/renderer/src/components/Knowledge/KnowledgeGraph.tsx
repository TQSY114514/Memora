import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { KnowledgeEntry, KnowledgeGraphData } from '@shared/types'

/**
 * 知识图谱可视化组件（纯 SVG，0 依赖）
 *
 * 布局：按 type 分三层同心圆环
 * - knowledge（紫）最外圈
 * - decision（橙）中圈
 * - task（绿）最内圈
 *
 * 边：
 * - 实线 = 显式关系（knowledge_relations 表）
 * - 虚线 = 隐式关联（同 source_session_id）
 *
 * 交互：
 * - 点击节点：高亮该节点 + 关联边 + 邻居
 * - hover：tooltip
 * - 滚轮缩放 + 拖拽平移
 */

const TYPE_COLORS: Record<string, string> = {
  knowledge: '#6d5dfc',
  decision: '#d97757',
  task: '#10a37f'
}

const TYPE_LABELS: Record<string, string> = {
  knowledge: '知识',
  decision: '决策',
  task: '任务'
}

const RELATION_LABELS: Record<string, string> = {
  'supports': '支持',
  'contradicts': '矛盾',
  'derived-from': '派生',
  'relates-to': '关联',
  'decision-from-session': '决策来源',
  'same-session': '同源对话'
}

interface NodePosition {
  x: number
  y: number
}

interface KnowledgeGraphProps {
  workspaceId: string
  onEntryClick?: (entry: KnowledgeEntry) => void
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600

export function KnowledgeGraph({ workspaceId, onEntryClick }: KnowledgeGraphProps) {
  const [data, setData] = useState<KnowledgeGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  useEffect(() => {
    setLoading(true)
    setError(null)
    setSelectedId(null)
    window.Memora.knowledge
      .graphData(workspaceId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [workspaceId])

  // 布局计算：按 type 分三层同心圆环
  const positions = useMemo(() => {
    if (!data) return new Map<string, NodePosition>()
    return layoutNodes(data.nodes, CANVAS_WIDTH, CANVAS_HEIGHT)
  }, [data])

  // 选中节点的关联节点集合
  const highlightedIds = useMemo(() => {
    if (!selectedId || !data) return null
    const related = new Set<string>([selectedId])
    for (const edge of data.edges) {
      if (edge.from === selectedId) related.add(edge.to)
      if (edge.to === selectedId) related.add(edge.from)
    }
    return related
  }, [selectedId, data])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 只在点击空白区域（svg 本身或背景 rect）时开始平移
      const target = e.target as Element
      if (target === svgRef.current || target.tagName === 'rect') {
        isPanning.current = true
        panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
      }
    },
    [pan]
  )

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy })
  }, [])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 text-sm p-4 text-center">
        {error}
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-muted">
        <div className="text-center">
          <div className="text-4xl mb-2 opacity-30">🕸️</div>
          <p className="text-sm">知识图谱为空</p>
          <p className="text-xs mt-1">先提炼或新建知识条目，图谱将自动展示关联</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 relative bg-bg-tertiary overflow-hidden">
      {/* 缩放工具栏 */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-bg-primary/90 border border-border rounded-lg px-2 py-1">
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}
          className="text-xs px-1.5 hover:bg-bg-hover rounded"
          title="缩小"
        >
          −
        </button>
        <span className="text-xs text-fg-muted w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(3, z * 1.25))}
          className="text-xs px-1.5 hover:bg-bg-hover rounded"
          title="放大"
        >
          +
        </button>
        <button
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
          className="text-xs px-1.5 hover:bg-bg-hover rounded"
          title="重置视图"
        >
          ⟲
        </button>
      </div>

      {/* 图例 */}
      <div className="absolute top-3 left-3 z-10 bg-bg-primary/90 border border-border rounded-lg px-3 py-2 space-y-1">
        {['knowledge', 'decision', 'task'].map((type) => (
          <div key={type} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[type] }}
            />
            <span className="text-fg-secondary">{TYPE_LABELS[type]}</span>
            <span className="text-fg-muted">
              {data.nodes.filter((n) => n.type === type).length}
            </span>
          </div>
        ))}
        <div className="border-t border-border pt-1 mt-1 space-y-0.5">
          <div className="flex items-center gap-2 text-[10px] text-fg-muted">
            <span className="w-4 h-px bg-fg-muted" /> 显式关系
          </div>
          <div className="flex items-center gap-2 text-[10px] text-fg-muted">
            <span className="w-4 h-px border-t border-dashed border-fg-muted" /> 同源对话
          </div>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning.current ? 'grabbing' : 'default' }}
      >
        {/* 透明背景 rect 用于捕获空白点击（触发平移） */}
        <rect x="0" y="0" width="100%" height="100%" fill="transparent" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 边 */}
          {data.edges.map((edge, idx) => {
            const from = positions.get(edge.from)
            const to = positions.get(edge.to)
            if (!from || !to) return null
            const isHighlighted =
              highlightedIds && highlightedIds.has(edge.from) && highlightedIds.has(edge.to)
            const isDimmed = highlightedIds && !isHighlighted
            const color = TYPE_COLORS[data.nodes.find((n) => n.id === edge.from)?.type || 'knowledge']
            return (
              <line
                key={idx}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={color}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={isDimmed ? 0.08 : edge.implicit ? 0.25 : 0.5}
                strokeDasharray={edge.implicit ? '4 4' : undefined}
              />
            )
          })}

          {/* 节点 */}
          {data.nodes.map((node) => {
            const pos = positions.get(node.id)
            if (!pos) return null
            const color = TYPE_COLORS[node.type] || '#6b7280'
            const isSelected = selectedId === node.id
            const isHovered = hoveredId === node.id
            const isDimmed = highlightedIds && !highlightedIds.has(node.id)
            const isTaskDone = node.type === 'task' && node.status === 'done'
            const radius = isSelected ? 10 : isHovered ? 9 : 7

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedId(selectedId === node.id ? null : node.id)
                  onEntryClick?.(node)
                }}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: 'pointer', opacity: isDimmed ? 0.2 : 1, transition: 'opacity 0.2s' }}
              >
                {/* 选中节点的光晕 */}
                {isSelected && (
                  <circle r={radius + 6} fill={color} fillOpacity={0.15} />
                )}
                <circle
                  r={radius}
                  fill={isTaskDone ? 'var(--bg-primary, #fff)' : color}
                  stroke={color}
                  strokeWidth={isTaskDone ? 2 : isSelected ? 3 : 1.5}
                  strokeOpacity={isTaskDone ? 0.5 : 1}
                />
                {isTaskDone && (
                  <path
                    d="M-3,0 L-1,2 L3,-2"
                    stroke={color}
                    strokeWidth="1.5"
                    fill="none"
                  />
                )}
                <text
                  y={radius + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  className="pointer-events-none"
                  style={{ userSelect: 'none' }}
                >
                  {node.title.length > 12 ? node.title.slice(0, 12) + '…' : node.title}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* hover tooltip */}
      {hoveredId &&
        data &&
        (() => {
          const entry = data.nodes.find((n) => n.id === hoveredId)
          if (!entry) return null
          const pos = positions.get(hoveredId)
          if (!pos) return null
          const x = pos.x * zoom + pan.x
          const y = pos.y * zoom + pan.y
          return (
            <div
              className="absolute z-20 bg-bg-primary border border-border rounded-lg px-3 py-2 shadow-lg max-w-[240px] pointer-events-none"
              style={{
                left: Math.min(x + 15, (svgRef.current?.clientWidth || 800) - 250),
                top: Math.max(y - 10, 0)
              }}
            >
              <p className="text-xs font-medium text-fg-primary mb-0.5">{entry.title}</p>
              <p className="text-[10px] text-fg-muted">
                {TYPE_LABELS[entry.type]} · {entry.source}
              </p>
              {entry.content && (
                <p className="text-[10px] text-fg-secondary mt-1 line-clamp-2">
                  {entry.content}
                </p>
              )}
            </div>
          )
        })()}

      {/* 选中节点详情面板 */}
      {selectedId &&
        data &&
        (() => {
          const entry = data.nodes.find((n) => n.id === selectedId)
          if (!entry) return null
          const relatedEdges = data.edges.filter(
            (e) => e.from === selectedId || e.to === selectedId
          )
          return (
            <div className="absolute bottom-3 left-3 right-3 z-10 bg-bg-primary/95 border border-border rounded-lg p-3.5 max-w-md mx-auto shadow-lg">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[entry.type] }}
                  />
                  <h4 className="text-sm font-medium text-fg-primary">{entry.title}</h4>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-fg-muted hover:text-fg-primary text-xs flex-shrink-0"
                >
                  ✕
                </button>
              </div>
              <p className="text-[10px] text-fg-muted mb-2">
                {TYPE_LABELS[entry.type]} · {entry.source} · {relatedEdges.length} 个关联
              </p>
              {entry.content && (
                <p className="text-xs text-fg-secondary line-clamp-3 mb-2">{entry.content}</p>
              )}
              {relatedEdges.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-fg-muted uppercase tracking-wider">关联</p>
                  {relatedEdges.slice(0, 5).map((edge, idx) => {
                    const otherId = edge.from === selectedId ? edge.to : edge.from
                    const other = data.nodes.find((n) => n.id === otherId)
                    if (!other) return null
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedId(otherId)}
                        className="block w-full text-left text-[11px] text-fg-secondary hover:text-fg-primary hover:bg-bg-hover px-1.5 py-0.5 rounded"
                      >
                        <span className="text-fg-muted mr-1">
                          {RELATION_LABELS[edge.relation] || edge.relation}:
                        </span>
                        {other.title}
                      </button>
                    )
                  })}
                  {relatedEdges.length > 5 && (
                    <p className="text-[10px] text-fg-muted">还有 {relatedEdges.length - 5} 条…</p>
                  )}
                </div>
              )}
            </div>
          )
        })()}
    </div>
  )
}

/**
 * 布局算法：按 type 分三层同心圆环
 * - knowledge 最外圈（半径 R）
 * - decision 中圈（半径 R * 0.65）
 * - task 最内圈（半径 R * 0.35）
 *
 * 每种类型在自己的圆环上均匀分布，避免不同类型节点重叠
 */
function layoutNodes(
  nodes: KnowledgeEntry[],
  width: number,
  height: number
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>()
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.min(width, height) * 0.4

  const groups: Record<string, KnowledgeEntry[]> = {
    knowledge: [],
    decision: [],
    task: []
  }
  nodes.forEach((n) => {
    if (groups[n.type]) groups[n.type].push(n)
    else groups.knowledge.push(n)
  })

  // 三层圆环配置：类型 -> { 半径比例, 起始角度偏移 }
  const ringConfig: Record<string, { radiusRatio: number; startAngle: number }> = {
    knowledge: { radiusRatio: 1.0, startAngle: -Math.PI / 2 },
    decision: { radiusRatio: 0.65, startAngle: -Math.PI / 2 + Math.PI / 6 },
    task: { radiusRatio: 0.35, startAngle: -Math.PI / 2 + Math.PI / 3 }
  }

  Object.entries(ringConfig).forEach(([type, { radiusRatio, startAngle }]) => {
    const items = groups[type]
    if (items.length === 0) return

    const radius = maxRadius * radiusRatio
    const angleStep = items.length > 1 ? (2 * Math.PI) / items.length : 0

    items.forEach((entry, idx) => {
      const angle = startAngle + idx * angleStep
      positions.set(entry.id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      })
    })
  })

  return positions
}
