import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { KnowledgeEntry, KnowledgeGraphData } from '@shared/types'

/**
 * 交互式知识图谱可视化组件（纯 SVG + TypeScript 力导向算法，0 依赖）
 *
 * 功能：
 * - 力导向布局：节点自动排布，避免重叠
 * - 拖拽：可拖拽节点移动位置
 * - 展开/折叠：点击节点展开关联邻居
 * - 时间筛选：按时间段筛选显示的节点
 * - 缩放 + 平移：滚轮缩放，拖拽背景平移
 *
 * 边：
 * - 实线 = 显式关系（knowledge_relations 表）
 * - 虚线 = 隐式关联（同 source_session_id）
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
  vx: number
  vy: number
  fixed: boolean
}

interface KnowledgeGraphProps {
  workspaceId: string
  onEntryClick?: (entry: KnowledgeEntry) => void
}

const CANVAS_WIDTH = 900
const CANVAS_HEIGHT = 650

export function KnowledgeGraph({ workspaceId, onEntryClick }: KnowledgeGraphProps) {
  const [data, setData] = useState<KnowledgeGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [timeFilter, setTimeFilter] = useState<'all' | 'week' | 'month' | 'year'>(() => {
    const saved = localStorage.getItem('memora-kg-timefilter')
    return (saved as 'all' | 'week' | 'month' | 'year') || 'all'
  })

  const svgRef = useRef<SVGSVGElement>(null)
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number } | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const positionsRef = useRef<Map<string, NodePosition>>(new Map())

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

  // 时间筛选
  useEffect(() => {
    localStorage.setItem('memora-kg-timefilter', timeFilter)
  }, [timeFilter])

  // 过滤后的节点
  const filteredNodes = useMemo(() => {
    if (!data) return []
    const now = new Date()
    let cutoff: Date | null = null
    switch (timeFilter) {
      case 'week': cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
      case 'month': cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
      case 'year': cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break
      default: return data.nodes
    }
    return data.nodes.filter((n) => new Date(n.createdAt) >= cutoff!)
  }, [data, timeFilter])

  // 过滤后的边（只保留两端节点都在过滤结果中的边）
  const filteredEdges = useMemo(() => {
    if (!data) return []
    const nodeIds = new Set(filteredNodes.map((n) => n.id))
    return data.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
  }, [data, filteredNodes])

  // 力导向布局初始化
  useEffect(() => {
    if (filteredNodes.length === 0) {
      positionsRef.current = new Map()
      return
    }

    const positions = new Map<string, NodePosition>()
    const centerX = CANVAS_WIDTH / 2
    const centerY = CANVAS_HEIGHT / 2

    // 初始化位置（随机分布，但按类型分组）
    const typeGroups: Record<string, number[]> = { knowledge: [], decision: [], task: [] }
    filteredNodes.forEach((n, i) => {
      const angle = (i / filteredNodes.length) * 2 * Math.PI
      const radius = 100 + Math.random() * 200
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)
      positions.set(n.id, { x, y, vx: 0, vy: 0, fixed: false })
      typeGroups[n.type]?.push(i)
    })

    // 力导向模拟（简化版）
    const alpha = { value: 1 }
    const alphaDecay = 0.02
    const repulsionStrength = 5000
    const attractionStrength = 0.01
    const centerStrength = 0.01
    const maxIterations = 300

    const nodeIds = Array.from(positions.keys())
    const edgePairs = new Set<string>()

    // 构建邻接关系
    const adjacency = new Map<string, Set<string>>()
    for (const nodeId of nodeIds) {
      adjacency.set(nodeId, new Set())
    }
    for (const edge of filteredEdges) {
      adjacency.get(edge.from)?.add(edge.to)
      adjacency.get(edge.to)?.add(edge.from)
      edgePairs.add(`${edge.from}|${edge.to}`)
      edgePairs.add(`${edge.to}|${edge.from}`)
    }

    let iteration = 0
    function simulate() {
      if (alpha.value < 0.001 || iteration >= maxIterations) {
        // 固定展开节点的位置
        for (const [id, pos] of positions) {
          if (expandedIds.has(id)) {
            pos.fixed = true
          }
        }
        positionsRef.current = positions
        return
      }

      alpha.value *= (1 - alphaDecay)
      iteration++

      // 计算力
      for (let i = 0; i < nodeIds.length; i++) {
        const idA = nodeIds[i]
        const posA = positions.get(idA)!
        if (posA.fixed) continue

        let fx = 0, fy = 0

        // 排斥力（节点之间）
        for (let j = 0; j < nodeIds.length; j++) {
          if (i === j) continue
          const idB = nodeIds[j]
          const posB = positions.get(idB)!
          const dx = posA.x - posB.x
          const dy = posA.y - posB.y
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
          const force = repulsionStrength / (dist * dist)
          fx += (dx / dist) * force
          fy += (dy / dist) * force
        }

        // 吸引力（边连接的节点）
        const neighbors = adjacency.get(idA)!
        for (const neighborId of neighbors) {
          const posB = positions.get(neighborId)!
          const dx = posB.x - posA.x
          const dy = posB.y - posA.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          fx += dx * attractionStrength * dist
          fy += dy * attractionStrength * dist
        }

        // 中心引力
        fx += (centerX - posA.x) * centerStrength
        fy += (centerY - posA.y) * centerStrength

        // 应用速度
        posA.vx = (posA.vx + fx) * 0.6
        posA.vy = (posA.vy + fy) * 0.6
        posA.x += posA.vx
        posA.y += posA.vy

        // 边界约束
        posA.x = Math.max(30, Math.min(CANVAS_WIDTH - 30, posA.x))
        posA.y = Math.max(30, Math.min(CANVAS_HEIGHT - 30, posA.y))
      }

      animFrameRef.current = requestAnimationFrame(simulate)
    }

    animFrameRef.current = requestAnimationFrame(simulate)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [filteredNodes, filteredEdges, expandedIds])

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
      const target = e.target as Element
      if (target === svgRef.current || target.tagName === 'rect') {
        isPanning.current = true
        panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
      }
    },
    [pan]
  )

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const pos = positionsRef.current.get(dragRef.current.nodeId)
      if (pos) {
        const dx = (e.clientX - dragRef.current.startX) / zoom
        const dy = (e.clientY - dragRef.current.startY) / zoom
        pos.x = Math.max(30, Math.min(CANVAS_WIDTH - 30, pos.x + dx))
        pos.y = Math.max(30, Math.min(CANVAS_HEIGHT - 30, pos.y + dy))
        dragRef.current.startX = e.clientX
        dragRef.current.startY = e.clientY
        setSelectedId((prev) => prev) // 强制重渲染
      }
      return
    }
    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy })
  }, [zoom])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    dragRef.current = null
  }, [])

  function handleNodeDragStart(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation()
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY }
  }

  function handleNodeClick(e: React.MouseEvent, nodeId: string, entry: KnowledgeEntry) {
    e.stopPropagation()
    if (dragRef.current) return
    setSelectedId(selectedId === nodeId ? null : nodeId)
    onEntryClick?.(entry)
  }

  function handleNodeDoubleClick(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation()
    const next = new Set(expandedIds)
    if (next.has(nodeId)) {
      next.delete(nodeId)
    } else {
      next.add(nodeId)
    }
    setExpandedIds(next)
  }

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
          <div className="mb-2 flex justify-center opacity-30 text-accent">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="6" r="3" /><circle cx="19" cy="6" r="3" /><circle cx="12" cy="18" r="3" /><path d="M7 8l4 7" /><path d="m13 15 4-7" /></svg>
          </div>
          <p className="text-sm">知识图谱为空</p>
          <p className="text-xs mt-1">先提炼或新建知识条目，图谱将自动展示关联</p>
        </div>
      </div>
    )
  }

  const positions = positionsRef.current
  const timeFilterOptions: Array<{ key: typeof timeFilter; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'week', label: '本周' },
    { key: 'month', label: '本月' },
    { key: 'year', label: '今年' }
  ]

  return (
    <div className="flex-1 relative bg-bg-tertiary overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {/* 时间筛选 */}
        <div className="flex items-center gap-0.5 bg-bg-primary/90 border border-border rounded-lg px-1 py-0.5">
          {timeFilterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setTimeFilter(opt.key)}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                timeFilter === opt.key
                  ? 'bg-accent text-white'
                  : 'text-fg-muted hover:bg-bg-hover'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* 缩放控制 */}
        <div className="flex items-center gap-1 bg-bg-primary/90 border border-border rounded-lg px-2 py-1">
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
              {filteredNodes.filter((n) => n.type === type).length}
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
        {expandedIds.size > 0 && (
          <div className="border-t border-border pt-1 mt-1">
            <button
              onClick={() => setExpandedIds(new Set())}
              className="text-[10px] text-accent hover:underline"
            >
              收起全部 ({expandedIds.size})
            </button>
          </div>
        )}
      </div>

      {/* 提示信息 */}
      <div className="absolute bottom-3 left-3 z-10 text-[10px] text-fg-muted bg-bg-primary/80 border border-border rounded px-2 py-1">
        拖拽节点移动 · 双击展开关联 · 滚轮缩放 · 拖拽背景平移
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
        <rect x="0" y="0" width="100%" height="100%" fill="transparent" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 边 */}
          {filteredEdges.map((edge, idx) => {
            const from = positions.get(edge.from)
            const to = positions.get(edge.to)
            if (!from || !to) return null
            const isHighlighted =
              highlightedIds && highlightedIds.has(edge.from) && highlightedIds.has(edge.to)
            const isDimmed = highlightedIds && !isHighlighted
            const fromNode = filteredNodes.find((n) => n.id === edge.from)
            const color = TYPE_COLORS[fromNode?.type || 'knowledge']
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
          {filteredNodes.map((node) => {
            const pos = positions.get(node.id)
            if (!pos) return null
            const color = TYPE_COLORS[node.type] || '#6b7280'
            const isSelected = selectedId === node.id
            const isHovered = hoveredId === node.id
            const isDimmed = highlightedIds && !highlightedIds.has(node.id)
            const isExpanded = expandedIds.has(node.id)
            const isTaskDone = node.type === 'task' && node.status === 'done'
            const radius = isSelected ? 10 : isExpanded ? 9 : isHovered ? 8 : 7

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseDown={(e) => handleNodeDragStart(e, node.id)}
                onClick={(e) => handleNodeClick(e, node.id, node)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, node.id)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: dragRef.current?.nodeId === node.id ? 'grabbing' : 'pointer', opacity: isDimmed ? 0.2 : 1, transition: 'opacity 0.2s' }}
              >
                {/* 展开节点的光晕 */}
                {isExpanded && (
                  <circle r={radius + 8} fill={color} fillOpacity={0.08} />
                )}
                {/* 选中节点的光晕 */}
                {isSelected && !isExpanded && (
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
          const entry = filteredNodes.find((n) => n.id === hoveredId)
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
          const entry = filteredNodes.find((n) => n.id === selectedId)
          if (!entry) return null
          const relatedEdges = data.edges.filter(
            (e) => e.from === selectedId || e.to === selectedId
          )
          return (
            <div className="absolute bottom-12 left-3 right-3 z-10 bg-bg-primary/95 border border-border rounded-lg p-3.5 max-w-md mx-auto shadow-lg">
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
                  title="关闭"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>
              <p className="text-[10px] text-fg-muted mb-2">
                {TYPE_LABELS[entry.type]} · {entry.source} · {relatedEdges.length} 个关联
                {' · '}{new Date(entry.createdAt).toLocaleDateString('zh-CN')}
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