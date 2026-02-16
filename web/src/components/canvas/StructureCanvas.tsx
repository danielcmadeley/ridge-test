import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Stage, Layer, Line, Circle } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Button } from '@/components/ui/button'
import { GridLayer } from './GridLayer'
import { NodeShape } from './NodeShape'
import { ElementLine } from './ElementLine'
import { SupportShape } from './SupportShape'
import { PointLoadArrow, UDLArrows } from './LoadArrow'
import { CanvasToolbar } from './CanvasToolbar'
import { useAnalysisResults } from '@/components/AppToolbar'
import {
  toStructureInput,
  useStructure,
  useStructureDispatch,
} from '@/lib/structure-store'
import { fetchDiagrams } from '@/lib/api'
import type { DiagramOutput } from '@/lib/types'

const DEFAULT_GRID_SIZE = 60 // pixels per metre
const MIN_GRID_SIZE = 20
const MAX_GRID_SIZE = 200
const SUPPORT_CYCLE: Array<'pinned' | 'fixed' | 'roller'> = [
  'pinned',
  'fixed',
  'roller',
]

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function reversePointPairs(points: number[]) {
  const out: number[] = []
  for (let i = points.length - 2; i >= 0; i -= 2) {
    out.push(points[i], points[i + 1])
  }
  return out
}

export function StructureCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const didPan = useRef(false)
  const lastPanPos = useRef<{ x: number; y: number } | null>(null)
  const [dims, setDims] = useState({ width: 800, height: 600 })
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE)
  const [diagramMode, setDiagramMode] = useState<
    'none' | 'deflection' | 'axial' | 'shear' | 'moment'
  >('none')
  const [diagramData, setDiagramData] = useState<Record<string, DiagramOutput>>({})
  const [diagramLoading, setDiagramLoading] = useState(false)
  const [diagramError, setDiagramError] = useState<string | null>(null)
  const [hoverProbe, setHoverProbe] = useState<{
    px: number
    py: number
    element: string
    x: number
    value: number
  } | null>(null)
  const [showLoads, setShowLoads] = useState(true)
  const [loadCaseVisibility, setLoadCaseVisibility] = useState<
    Record<string, boolean>
  >({})
  const [placementCursor, setPlacementCursor] = useState<{
    mx: number
    my: number
  } | null>(null)

  // Canvas origin offset (pixels): where (0, 0) in structural coords maps to
  const [offset, setOffset] = useState({ x: 200, y: 400 })

  const state = useStructure()
  const dispatch = useStructureDispatch()
  const { results } = useAnalysisResults()
  const elementNames = useMemo(
    () => state.elements.map((e) => e.name),
    [state.elements],
  )
  const structureForDiagrams = useMemo(() => toStructureInput(state), [state])

  useEffect(() => {
    setLoadCaseVisibility((prev) => {
      const next: Record<string, boolean> = {}
      for (const lc of state.loadCases) {
        next[lc.id] = prev[lc.id] ?? true
      }
      return next
    })
  }, [state.loadCases])

  const visibleUdls = useMemo(() => {
    if (!showLoads) return []
    return state.udls.filter((u) => loadCaseVisibility[u.loadCaseId] ?? true)
  }, [showLoads, state.udls, loadCaseVisibility])

  const visiblePointLoads = useMemo(() => {
    if (!showLoads) return []
    return state.pointLoads.filter((p) => loadCaseVisibility[p.loadCaseId] ?? true)
  }, [showLoads, state.pointLoads, loadCaseVisibility])

  const canDeleteSelected = useMemo(() => {
    if (!state.selectedId) return false
    const id = state.selectedId
    return (
      state.nodes.some((n) => n.id === id) ||
      state.elements.some((e) => e.id === id) ||
      state.supports.some((s) => s.id === id) ||
      state.udls.some((u) => u.id === id) ||
      state.pointLoads.some((p) => p.id === id)
    )
  }, [state.selectedId, state.nodes, state.elements, state.supports, state.udls, state.pointLoads])

  const deleteById = useCallback(
    (id: string) => {
      if (state.nodes.some((n) => n.id === id)) {
        dispatch({ type: 'DELETE_NODE', id })
        return
      }
      if (state.elements.some((e) => e.id === id)) {
        dispatch({ type: 'DELETE_ELEMENT', id })
        return
      }
      if (state.supports.some((s) => s.id === id)) {
        dispatch({ type: 'DELETE_SUPPORT', id })
        return
      }
      if (state.udls.some((u) => u.id === id)) {
        dispatch({ type: 'DELETE_UDL', id })
        return
      }
      if (state.pointLoads.some((p) => p.id === id)) {
        dispatch({ type: 'DELETE_POINT_LOAD', id })
      }
    },
    [dispatch, state.nodes, state.elements, state.supports, state.udls, state.pointLoads],
  )

  const deleteSelected = useCallback(() => {
    if (!state.selectedId) return
    deleteById(state.selectedId)
  }, [state.selectedId, deleteById])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      if (!canDeleteSelected) return
      e.preventDefault()
      deleteSelected()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canDeleteSelected, deleteSelected])

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDims({ width, height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Convert structural coords (m) to canvas pixels
  const toPixel = useCallback(
    (mx: number, my: number) => ({
      px: mx * gridSize + offset.x,
      py: -my * gridSize + offset.y,
    }),
    [gridSize, offset],
  )

  // Convert canvas pixels to structural metres (snapped)
  const toMetres = useCallback(
    (px: number, py: number) => ({
      mx: Math.round((px - offset.x) / gridSize),
      my: -Math.round((py - offset.y) / gridSize),
    }),
    [gridSize, offset],
  )

  const setZoomAt = useCallback(
    (nextGridSize: number, anchorPx: number, anchorPy: number) => {
      const clamped = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, nextGridSize))
      if (Math.abs(clamped - gridSize) < 1e-9) return

      const xMetres = (anchorPx - offset.x) / gridSize
      const yMetres = -(anchorPy - offset.y) / gridSize

      setGridSize(clamped)
      setOffset({
        x: anchorPx - xMetres * clamped,
        y: anchorPy + yMetres * clamped,
      })
    },
    [gridSize, offset],
  )

  const fitToStructure = useCallback(() => {
    if (state.nodes.length === 0 || dims.width <= 2 || dims.height <= 2) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of state.nodes) {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x)
      maxY = Math.max(maxY, node.y)
    }

    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const padPx = 56
    const availableW = Math.max(1, dims.width - padPx * 2)
    const availableH = Math.max(1, dims.height - padPx * 2)
    const nextGrid = Math.max(
      MIN_GRID_SIZE,
      Math.min(MAX_GRID_SIZE, Math.min(availableW / spanX, availableH / spanY)),
    )

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setGridSize(nextGrid)
    setOffset({
      x: dims.width / 2 - cx * nextGrid,
      y: dims.height / 2 + cy * nextGrid,
    })
  }, [state.nodes, dims.width, dims.height])

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (didPan.current) {
      didPan.current = false
      return
    }

    // Only handle clicks on the stage itself (not on shapes)
    if (e.target !== e.currentTarget) return

    const stage = e.currentTarget.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const { mx, my } = toMetres(pos.x, pos.y)

    if (state.selectedTool === 'node') {
      dispatch({ type: 'ADD_NODE', x: mx, y: my })
    } else if (state.selectedTool === 'select') {
      dispatch({ type: 'SELECT', id: null })
    }
  }

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.currentTarget.getStage()
    if (!stage) return

    const isMiddleButton = e.evt.button === 1
    const isLeftDragPan =
      e.evt.button === 0 &&
      state.selectedTool === 'select' &&
      e.target === e.currentTarget
    if (!isMiddleButton && !isLeftDragPan) return

    e.evt.preventDefault()
    isPanning.current = true
    didPan.current = false
    const pos = stage.getPointerPosition()
    lastPanPos.current = pos ? { x: pos.x, y: pos.y } : null
    stage.container().style.cursor = 'grabbing'
  }

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.currentTarget.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    if (
      state.pendingNodeId &&
      (state.selectedTool === 'beam' ||
        state.selectedTool === 'column' ||
        state.selectedTool === 'truss')
    ) {
      setPlacementCursor(toMetres(pos.x, pos.y))
    } else if (placementCursor) {
      setPlacementCursor(null)
    }

    if (!isPanning.current || !lastPanPos.current) return
    e.evt.preventDefault()

    const dx = pos.x - lastPanPos.current.x
    const dy = pos.y - lastPanPos.current.y
    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      didPan.current = true
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
      lastPanPos.current = { x: pos.x, y: pos.y }
    }
  }

  const handleStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (!isPanning.current) return
    const stage = e.currentTarget.getStage()
    if (!stage) return
    isPanning.current = false
    lastPanPos.current = null
    stage.container().style.cursor = 'default'
  }

  const handleStageMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
    setPlacementCursor(null)
    if (!isPanning.current) return
    const stage = e.currentTarget.getStage()
    if (!stage) return
    isPanning.current = false
    lastPanPos.current = null
    stage.container().style.cursor = 'default'
  }

  const handleNodeClick = (nodeId: string) => {
    const tool = state.selectedTool

    if (tool === 'erase') {
      dispatch({ type: 'DELETE_NODE', id: nodeId })
      return
    }

    if (tool === 'select') {
      dispatch({ type: 'SELECT', id: nodeId })
      return
    }

    if (tool === 'beam' || tool === 'column' || tool === 'truss') {
      if (state.pendingNodeId === null) {
        dispatch({ type: 'SET_PENDING_NODE', nodeId })
      } else if (state.pendingNodeId !== nodeId) {
        const role =
          tool === 'beam'
            ? 'beam'
            : tool === 'column'
              ? 'column'
              : 'truss_member'
        const defaultDesignation =
          role === 'truss_member'
            ? 'SHS 100x100x8.0'
            : role === 'column'
              ? 'UC 254x254x89'
              : 'UB 457x191x67'
        dispatch({
          type: 'ADD_ELEMENT',
          nodeI: state.pendingNodeId,
          nodeJ: nodeId,
          role,
          designation: defaultDesignation,
        })
      }
      return
    }

    if (tool === 'support') {
      const existing = state.supports.find((s) => s.nodeId === nodeId)
      const currentIdx = existing
        ? SUPPORT_CYCLE.indexOf(existing.type)
        : -1
      const nextType = SUPPORT_CYCLE[(currentIdx + 1) % SUPPORT_CYCLE.length]
      dispatch({
        type: 'ADD_SUPPORT',
        nodeId,
        supportType: nextType,
      })
      return
    }

    if (tool === 'load') {
      // Check if point load already exists for the active load case
      const existing = state.pointLoads.find(
        (p) => p.nodeId === nodeId && p.loadCaseId === state.activeLoadCaseId,
      )
      if (!existing) {
        dispatch({
          type: 'ADD_POINT_LOAD',
          nodeId,
          fx: 0,
          fy: -10000,
          mz: 0,
        })
      }
      dispatch({ type: 'SELECT', id: nodeId })
      return
    }
  }

  const handleElementClick = (elemId: string) => {
    if (state.selectedTool === 'erase') {
      dispatch({ type: 'DELETE_ELEMENT', id: elemId })
      return
    }

    if (state.selectedTool === 'select') {
      dispatch({ type: 'SELECT', id: elemId })
      return
    }

    if (state.selectedTool === 'load') {
      // Check if UDL already exists for the active load case
      const existing = state.udls.find(
        (u) => u.elementId === elemId && u.loadCaseId === state.activeLoadCaseId,
      )
      if (!existing) {
        dispatch({
          type: 'ADD_UDL',
          elementId: elemId,
          wx: 0,
          wy: -10000,
        })
      }
      dispatch({ type: 'SELECT', id: elemId })
      return
    }
  }

  const handleSupportClick = (supportId: string, nodeId: string) => {
    if (state.selectedTool === 'erase') {
      dispatch({ type: 'DELETE_SUPPORT', id: supportId })
      return
    }
    if (state.selectedTool === 'select') {
      dispatch({ type: 'SELECT', id: nodeId })
    }
  }

  const handlePointLoadClick = (pointLoadId: string, nodeId: string) => {
    if (state.selectedTool === 'erase') {
      dispatch({ type: 'DELETE_POINT_LOAD', id: pointLoadId })
      return
    }
    if (state.selectedTool === 'select') {
      dispatch({ type: 'SELECT', id: nodeId })
    }
  }

  const handleUdlClick = (udlId: string, elementId: string) => {
    if (state.selectedTool === 'erase') {
      dispatch({ type: 'DELETE_UDL', id: udlId })
      return
    }
    if (state.selectedTool === 'select') {
      dispatch({ type: 'SELECT', id: elementId })
    }
  }

  // Zoom with scroll wheel
  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = e.currentTarget.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const scaleBy = 1.1
    const newSize = e.evt.deltaY < 0 ? gridSize * scaleBy : gridSize / scaleBy
    setZoomAt(newSize, pointer.x, pointer.y)
  }

  useEffect(() => {
    if (!results || diagramMode === 'none' || elementNames.length === 0) {
      setDiagramData({})
      setDiagramError(null)
      setDiagramLoading(false)
      return
    }

    let mounted = true

    setDiagramLoading(true)
    setDiagramError(null)

    Promise.all(
      elementNames.map((name) =>
        fetchDiagrams({
          structure: structureForDiagrams,
          element_name: name,
        }),
      ),
    )
      .then((all) => {
        if (!mounted) return
        const next: Record<string, DiagramOutput> = {}
        for (const d of all) {
          next[d.element_name] = d
        }
        setDiagramData(next)
      })
      .catch((err: Error) => {
        if (!mounted) return
        setDiagramData({})
        setDiagramError(err.message)
      })
      .finally(() => {
        if (!mounted) return
        setDiagramLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [results, diagramMode, elementNames, structureForDiagrams])

  const activeDiagramKey =
    diagramMode === 'deflection'
      ? 'deflection'
      : diagramMode === 'axial'
        ? 'axial'
        : diagramMode === 'shear'
          ? 'shear'
          : diagramMode === 'moment'
            ? 'moment'
            : null

  const diagramColor =
    diagramMode === 'deflection'
      ? '#22c55e'
      : diagramMode === 'axial'
        ? '#a855f7'
        : diagramMode === 'shear'
          ? '#f59e0b'
          : '#ef4444'
  const diagramFillColor = hexToRgba(diagramColor, 0.5)

  const maxDiagramAbs = (() => {
    if (!activeDiagramKey) return 0
    let maxAbs = 0
    for (const d of Object.values(diagramData)) {
      for (const v of d[activeDiagramKey]) {
        maxAbs = Math.max(maxAbs, Math.abs(v))
      }
    }
    return maxAbs
  })()

  const interpolateDiagramValue = useCallback(
    (d: DiagramOutput, key: 'deflection' | 'axial' | 'shear' | 'moment', x: number) => {
      if (d.x.length === 0) return 0
      if (d.x.length === 1) return d[key][0] ?? 0
      if (x <= d.x[0]) return d[key][0] ?? 0
      if (x >= d.x[d.x.length - 1]) return d[key][d[key].length - 1] ?? 0

      for (let i = 0; i < d.x.length - 1; i++) {
        const x0 = d.x[i]
        const x1 = d.x[i + 1]
        if (x >= x0 && x <= x1) {
          const y0 = d[key][i] ?? 0
          const y1 = d[key][i + 1] ?? y0
          const t = x1 > x0 ? (x - x0) / (x1 - x0) : 0
          return y0 + (y1 - y0) * t
        }
      }

      return d[key][d[key].length - 1] ?? 0
    },
    [],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseMove = (evt: MouseEvent) => {
      if (isPanning.current || !activeDiagramKey || maxDiagramAbs <= 1e-9) {
        setHoverProbe(null)
        return
      }

      const rect = el.getBoundingClientRect()
      const mx = evt.clientX - rect.left
      const my = evt.clientY - rect.top

      if (mx < 0 || my < 0 || mx > rect.width || my > rect.height) {
        setHoverProbe(null)
        return
      }

      let best: {
        px: number
        py: number
        element: string
        x: number
        value: number
        dist: number
      } | null = null

      for (const elem of state.elements) {
        const d = diagramData[elem.name]
        if (!d) continue
        const ni = state.nodes.find((n) => n.id === elem.nodeI)
        const nj = state.nodes.find((n) => n.id === elem.nodeJ)
        if (!ni || !nj) continue

        const p1 = toPixel(ni.x, ni.y)
        const p2 = toPixel(nj.x, nj.y)
        const vx = p2.px - p1.px
        const vy = p2.py - p1.py
        const len2 = vx * vx + vy * vy
        if (len2 < 1e-9) continue

        const tRaw = ((mx - p1.px) * vx + (my - p1.py) * vy) / len2
        const t = Math.max(0, Math.min(1, tRaw))
        const bx = p1.px + vx * t
        const by = p1.py + vy * t
        const dist = Math.hypot(mx - bx, my - by)
        if (dist > 22) continue

        const dx = nj.x - ni.x
        const dy = nj.y - ni.y
        const L = Math.hypot(dx, dy)
        if (L < 1e-9) continue
        const s = dy / L

        const xAlong = t * L
        const value = interpolateDiagramValue(d, activeDiagramKey, xAlong)
        const maxOffsetPx = 34
        const offsetPx = (value / maxDiagramAbs) * maxOffsetPx
        const probePx = bx - s * offsetPx
        const probePy = by - (dx / L) * offsetPx

        if (!best || dist < best.dist) {
          best = {
            px: probePx,
            py: probePy,
            element: elem.name,
            x: xAlong,
            value,
            dist,
          }
        }
      }

      if (best) {
        setHoverProbe({
          px: best.px,
          py: best.py,
          element: best.element,
          x: best.x,
          value: best.value,
        })
      } else {
        setHoverProbe(null)
      }
    }

    const onMouseLeave = () => setHoverProbe(null)
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [
    activeDiagramKey,
    diagramData,
    interpolateDiagramValue,
    maxDiagramAbs,
    state.elements,
    state.nodes,
    toPixel,
  ])

  const diagramUnit =
    diagramMode === 'deflection'
      ? 'mm'
      : diagramMode === 'moment'
        ? 'kNm'
        : 'kN'
  const zoomPercent = Math.round((gridSize / DEFAULT_GRID_SIZE) * 100)
  const pendingNode =
    state.pendingNodeId === null
      ? null
      : state.nodes.find((n) => n.id === state.pendingNodeId) ?? null
  const placementPreviewColor =
    state.selectedTool === 'beam'
      ? '#262626'
      : state.selectedTool === 'column'
        ? '#404040'
        : '#525252'

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-neutral-400"
    >
      <CanvasToolbar
        canDeleteSelected={canDeleteSelected}
        onDeleteSelected={deleteSelected}
      />

      {/* Pending node indicator */}
      {state.pendingNodeId && (
        <div className="absolute z-10 rounded bg-amber-500/90 px-2 py-1 text-xs text-black md:top-2 md:right-56 max-md:top-14 max-md:left-2 max-md:right-2">
          Click second node to create{' '}
          {state.selectedTool === 'truss' ? 'truss member' : state.selectedTool}
        </div>
      )}

      {state.selectedTool === 'erase' && (
        <div className="absolute z-10 rounded bg-red-500/90 px-2 py-1 text-xs text-white md:top-2 md:right-56 max-md:top-14 max-md:left-2 max-md:right-2">
          Erase mode: click a node, element, support, or load to delete
        </div>
      )}

      <div className="absolute z-10 min-w-52 space-y-2 rounded-lg border border-border bg-card/90 px-2 py-2 text-xs backdrop-blur md:top-2 md:right-2 max-md:right-2 max-md:bottom-[4.6rem] max-md:min-w-0 max-md:w-[calc(100%-1rem)]">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <span className="text-muted-foreground">Zoom {zoomPercent}%</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-2 md:h-7"
              onClick={() => setZoomAt(gridSize / 1.15, dims.width / 2, dims.height / 2)}
              title="Zoom out"
            >
              -
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-2 md:h-7"
              onClick={() => setZoomAt(gridSize * 1.15, dims.width / 2, dims.height / 2)}
              title="Zoom in"
            >
              +
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-2 md:h-7"
              onClick={fitToStructure}
              disabled={state.nodes.length === 0}
              title="Fit structure to canvas"
            >
              Fit
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Canvas diagram</span>
          <select
            value={diagramMode}
            onChange={(e) =>
              setDiagramMode(
                e.target.value as
                  | 'none'
                  | 'deflection'
                  | 'axial'
                  | 'shear'
                  | 'moment',
              )
            }
            className="bg-secondary text-secondary-foreground rounded px-2 py-1 text-xs border border-border"
          >
            <option value="none">Off</option>
            <option value="deflection">Deflection</option>
            <option value="axial">Axial</option>
            <option value="shear">Shear</option>
            <option value="moment">Moment</option>
          </select>
        </div>

        <div className="border-t border-border pt-2 space-y-1">
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Show loads</span>
            <input
              type="checkbox"
              checked={showLoads}
              onChange={(e) => setShowLoads(e.target.checked)}
            />
          </label>

          {showLoads && (
            <div className="space-y-1">
              {state.loadCases.map((lc) => (
                <label
                  key={lc.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: lc.color }}
                    />
                    {lc.name}
                  </span>
                  <input
                    type="checkbox"
                    checked={loadCaseVisibility[lc.id] ?? true}
                    onChange={(e) =>
                      setLoadCaseVisibility((prev) => ({
                        ...prev,
                        [lc.id]: e.target.checked,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <Stage
        width={dims.width}
        height={dims.height}
        onClick={handleStageClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseLeave}
        onWheel={handleWheel}
      >
        <Layer>
          <GridLayer
            width={dims.width}
            height={dims.height}
            gridSize={gridSize}
            offsetX={offset.x}
            offsetY={offset.y}
          />
        </Layer>

        <Layer>
          {pendingNode && placementCursor && (
            (() => {
              const samePoint =
                pendingNode.x === placementCursor.mx &&
                pendingNode.y === placementCursor.my
              if (samePoint) return null
              const p1 = toPixel(pendingNode.x, pendingNode.y)
              const p2 = toPixel(placementCursor.mx, placementCursor.my)
              return (
                <Line
                  points={[p1.px, p1.py, p2.px, p2.py]}
                  stroke={placementPreviewColor}
                  strokeWidth={3}
                  opacity={0.5}
                  dash={[8, 6]}
                  listening={false}
                />
              )
            })()
          )}

          {/* Elements */}
          {state.elements.map((elem) => {
            const ni = state.nodes.find((n) => n.id === elem.nodeI)
            const nj = state.nodes.find((n) => n.id === elem.nodeJ)
            if (!ni || !nj) return null
            const p1 = toPixel(ni.x, ni.y)
            const p2 = toPixel(nj.x, nj.y)
            return (
              <ElementLine
                key={elem.id}
                x1={p1.px}
                y1={p1.py}
                x2={p2.px}
                y2={p2.py}
                name={elem.name}
                role={elem.role}
                selected={state.selectedId === elem.id}
                onSelect={() => handleElementClick(elem.id)}
                showName={elem.role === 'truss_member'}
              />
            )
          })}

          {/* UDLs */}
          {visibleUdls.map((udl) => {
            const elem = state.elements.find((e) => e.id === udl.elementId)
            if (!elem) return null
            const ni = state.nodes.find((n) => n.id === elem.nodeI)
            const nj = state.nodes.find((n) => n.id === elem.nodeJ)
            if (!ni || !nj) return null
            const p1 = toPixel(ni.x, ni.y)
            const p2 = toPixel(nj.x, nj.y)
            const lc = state.loadCases.find((l) => l.id === udl.loadCaseId)
            return (
              <UDLArrows
                key={udl.id}
                x1={p1.px}
                y1={p1.py}
                x2={p2.px}
                y2={p2.py}
                wy={udl.wy}
                color={lc?.color}
                onSelect={() => handleUdlClick(udl.id, udl.elementId)}
              />
            )
          })}

          {/* Point loads */}
          {visiblePointLoads.map((pl) => {
            const node = state.nodes.find((n) => n.id === pl.nodeId)
            if (!node) return null
            const p = toPixel(node.x, node.y)
            const lc = state.loadCases.find((l) => l.id === pl.loadCaseId)
            return (
              <PointLoadArrow
                key={pl.id}
                x={p.px}
                y={p.py}
                fx={pl.fx}
                fy={pl.fy}
                color={lc?.color}
                onSelect={() => handlePointLoadClick(pl.id, pl.nodeId)}
              />
            )
          })}

          {/* Supports */}
          {state.supports.map((sup) => {
            const node = state.nodes.find((n) => n.id === sup.nodeId)
            if (!node) return null
            const p = toPixel(node.x, node.y)
            return (
              <SupportShape
                key={sup.id}
                x={p.px}
                y={p.py}
                type={sup.type}
                onSelect={() => handleSupportClick(sup.id, sup.nodeId)}
              />
            )
          })}

          {/* Nodes (drawn last to be on top) */}
          {state.nodes.map((node) => {
            const p = toPixel(node.x, node.y)
            return (
              <NodeShape
                key={node.id}
                x={p.px}
                y={p.py}
                name={node.name}
                selected={
                  state.selectedId === node.id ||
                  state.pendingNodeId === node.id
                }
                onSelect={() => handleNodeClick(node.id)}
                onDragEnd={(mx, my) =>
                  dispatch({ type: 'MOVE_NODE', id: node.id, x: mx, y: my })
                }
                draggable={state.selectedTool === 'select'}
                gridSize={gridSize}
                offsetX={offset.x}
                offsetY={offset.y}
              />
            )
          })}
        </Layer>

        {activeDiagramKey && (
          <Layer>
            {state.elements.map((elem) => {
              const d = diagramData[elem.name]
              if (!d) return null
              const ni = state.nodes.find((n) => n.id === elem.nodeI)
              const nj = state.nodes.find((n) => n.id === elem.nodeJ)
              if (!ni || !nj) return null

              const dx = nj.x - ni.x
              const dy = nj.y - ni.y
              const L = Math.hypot(dx, dy)
              if (L < 1e-9) return null
              const c = dx / L
              const s = dy / L

              const values = d[activeDiagramKey]
              const points: number[] = []
              const baselinePoints: number[] = []
              const maxOffsetPx = 34

              for (let i = 0; i < d.x.length; i++) {
                const x = d.x[i]
                const baseMx = ni.x + c * x
                const baseMy = ni.y + s * x
                const base = toPixel(baseMx, baseMy)
                baselinePoints.push(base.px, base.py)
                const v = values[i] ?? 0
                const offsetPx =
                  maxDiagramAbs > 1e-9 ? (v / maxDiagramAbs) * maxOffsetPx : 0

                points.push(base.px - s * offsetPx, base.py - c * offsetPx)
              }

              const shadedPolygon = [...points, ...reversePointPairs(baselinePoints)]

              return [
                <Line
                  key={`${elem.id}-${activeDiagramKey}-fill`}
                  points={shadedPolygon}
                  closed
                  fill={diagramFillColor}
                  listening={false}
                />,
                <Line
                  key={`${elem.id}-${activeDiagramKey}`}
                  points={points}
                  stroke={diagramColor}
                  strokeWidth={2}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />,
              ]
            })}

            {hoverProbe && (
              <Circle
                x={hoverProbe.px}
                y={hoverProbe.py}
                radius={4}
                fill={diagramColor}
                stroke="#fff"
                strokeWidth={1}
                listening={false}
              />
            )}
          </Layer>
        )}
      </Stage>

      {hoverProbe && activeDiagramKey && (
        <div
          className="absolute z-10 bg-card/95 border border-border rounded px-2 py-1 text-xs pointer-events-none"
          style={{ left: hoverProbe.px + 10, top: hoverProbe.py + 10 }}
        >
          <div className="font-medium">{hoverProbe.element}</div>
          <div className="text-muted-foreground">x = {hoverProbe.x.toFixed(2)} m</div>
          <div>
            {hoverProbe.value.toFixed(2)} {diagramUnit}
          </div>
        </div>
      )}

      {(diagramLoading || diagramError) && diagramMode !== 'none' && (
        <div className="absolute z-10 rounded border border-border bg-card/90 px-2 py-1 text-xs backdrop-blur md:bottom-2 md:right-2 max-md:top-14 max-md:left-2 max-md:right-2">
          {diagramLoading
            ? 'Loading canvas diagrams...'
            : `Canvas diagram error: ${(diagramError ?? '').slice(0, 80)}`}
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10 rounded border border-border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground max-md:hidden">
        Zoom: mouse wheel · Pan: drag canvas or middle mouse · Fit: button
      </div>
    </div>
  )
}
