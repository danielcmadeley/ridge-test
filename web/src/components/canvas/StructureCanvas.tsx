import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Stage, Layer, Line, Circle, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { AlertTriangle, Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
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
import type { DiagramOutput, SupportType } from '@/lib/types'

const DEFAULT_GRID_SIZE = 60 // pixels per metre
const MIN_GRID_SIZE = 0.42
const MAX_GRID_SIZE = 42000
const AXIAL_COLOR_THRESHOLD_KN = 0.5
const DEFLECTION_TARGET_MAX_PX = 120
const GRID_STEP_OPTIONS_M = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 10, 50, 100]
const DEFAULT_BEAM_DESIGNATION = 'UB 457x191x67'
const DEFAULT_COLUMN_DESIGNATION = 'UC 254x254x89'
const DEFAULT_YOUNGS_MODULUS_N_PER_MM2 = 210000
const GRID_STEP_LABELS = new Map<number, string>([
  [0.001, '1 mm'],
  [0.005, '5 mm'],
  [0.01, '1 cm'],
  [0.05, '5 cm'],
  [0.1, '10 cm'],
  [0.5, '50 cm'],
  [1, '1 m'],
  [10, '10 m'],
  [50, '50 m'],
  [100, '100 m'],
])
function axialSignColor(values: number[]) {
  if (values.length === 0) return '#a855f7'
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length
  if (avg > AXIAL_COLOR_THRESHOLD_KN) return '#dc2626'
  if (avg < -AXIAL_COLOR_THRESHOLD_KN) return '#2563eb'
  return '#6b7280'
}

function chooseGridStepMetres(pxPerMetre: number) {
  const targetPx = 42
  let best = GRID_STEP_OPTIONS_M[0]
  let bestDist = Number.POSITIVE_INFINITY

  for (const step of GRID_STEP_OPTIONS_M) {
    const spacingPx = pxPerMetre * step
    const dist = Math.abs(spacingPx - targetPx)
    if (dist < bestDist) {
      best = step
      bestDist = dist
    }
  }

  return best
}

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

function pointInRect(
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  return x >= minX && x <= maxX && y >= minY && y <= maxY
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const val = (by - ay) * (cx - bx) - (bx - ax) * (cy - by)
  if (Math.abs(val) < 1e-9) return 0
  return val > 0 ? 1 : 2
}

function onSegment(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (
    bx <= Math.max(ax, cx) &&
    bx >= Math.min(ax, cx) &&
    by <= Math.max(ay, cy) &&
    by >= Math.min(ay, cy)
  )
}

function segmentsIntersect(
  p1x: number,
  p1y: number,
  q1x: number,
  q1y: number,
  p2x: number,
  p2y: number,
  q2x: number,
  q2y: number,
) {
  const o1 = orientation(p1x, p1y, q1x, q1y, p2x, p2y)
  const o2 = orientation(p1x, p1y, q1x, q1y, q2x, q2y)
  const o3 = orientation(p2x, p2y, q2x, q2y, p1x, p1y)
  const o4 = orientation(p2x, p2y, q2x, q2y, q1x, q1y)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p1x, p1y, p2x, p2y, q1x, q1y)) return true
  if (o2 === 0 && onSegment(p1x, p1y, q2x, q2y, q1x, q1y)) return true
  if (o3 === 0 && onSegment(p2x, p2y, p1x, p1y, q2x, q2y)) return true
  if (o4 === 0 && onSegment(p2x, p2y, q1x, q1y, q2x, q2y)) return true
  return false
}

function lineIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  if (pointInRect(x1, y1, minX, minY, maxX, maxY) || pointInRect(x2, y2, minX, minY, maxX, maxY)) {
    return true
  }

  return (
    segmentsIntersect(x1, y1, x2, y2, minX, minY, maxX, minY) ||
    segmentsIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY) ||
    segmentsIntersect(x1, y1, x2, y2, maxX, maxY, minX, maxY) ||
    segmentsIntersect(x1, y1, x2, y2, minX, maxY, minX, minY)
  )
}

interface StructureCanvasProps {
  module?: 'frame' | 'truss'
  mobileControlsOpen?: boolean
}

export function StructureCanvas({
  module = 'frame',
  mobileControlsOpen = false,
}: StructureCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const didPan = useRef(false)
  const isBoxSelecting = useRef(false)
  const didBoxSelect = useRef(false)
  const lastPanPos = useRef<{ x: number; y: number } | null>(null)
  const touchPanMode = useRef<'one' | 'two' | null>(null)
  const pinchStartDistance = useRef<number | null>(null)
  const pinchStartGridSize = useRef(DEFAULT_GRID_SIZE)
  const [dims, setDims] = useState({ width: 800, height: 600 })
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE)
  const [diagramMode, setDiagramMode] = useState<
    'none' | 'deflection' | 'axial' | 'shear' | 'moment'
  >('none')
  const [diagramData, setDiagramData] = useState<Record<string, DiagramOutput>>({})
  const [diagramLoading, setDiagramLoading] = useState(false)
  const [diagramError, setDiagramError] = useState<string | null>(null)

  const gridStepM = useMemo(() => chooseGridStepMetres(gridSize), [gridSize])
  const [hoverProbe, setHoverProbe] = useState<{
    px: number
    py: number
    element: string
    x: number
    value: number
  } | null>(null)
  const [showLoads, setShowLoads] = useState(true)
  const [showSupportReactions, setShowSupportReactions] = useState(true)
  const [showElementTag, setShowElementTag] = useState(true)
  const [showElementSection, setShowElementSection] = useState(false)
  const [showMemberEndReleases, setShowMemberEndReleases] = useState(false)
  const [loadCaseVisibility, setLoadCaseVisibility] = useState<
    Record<string, boolean>
  >({})
  const [placementCursor, setPlacementCursor] = useState<{
    mx: number
    my: number
  } | null>(null)
  const [deflectionSlider, setDeflectionSlider] = useState(0)
  const [boxSelectionStart, setBoxSelectionStart] = useState<{
    x: number
    y: number
  } | null>(null)
  const [boxSelectionEnd, setBoxSelectionEnd] = useState<{
    x: number
    y: number
  } | null>(null)
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([])
  const [beamDraftDesignation, setBeamDraftDesignation] = useState(
    DEFAULT_BEAM_DESIGNATION,
  )
  const [beamDraftYoungsModulus, setBeamDraftYoungsModulus] = useState(
    DEFAULT_YOUNGS_MODULUS_N_PER_MM2,
  )
  const [beamDraftReleaseStart, setBeamDraftReleaseStart] = useState(false)
  const [beamDraftReleaseEnd, setBeamDraftReleaseEnd] = useState(false)
  const [columnDraftDesignation, setColumnDraftDesignation] = useState(
    DEFAULT_COLUMN_DESIGNATION,
  )
  const [columnDraftYoungsModulus, setColumnDraftYoungsModulus] = useState(
    DEFAULT_YOUNGS_MODULUS_N_PER_MM2,
  )
  const [columnDraftReleaseStart, setColumnDraftReleaseStart] = useState(false)
  const [columnDraftReleaseEnd, setColumnDraftReleaseEnd] = useState(false)
  const [supportDraftType, setSupportDraftType] = useState<SupportType>('pinned')

  // Canvas origin offset (pixels): where (0, 0) in structural coords maps to
  const [offset, setOffset] = useState({ x: 200, y: 400 })

  const state = useStructure()
  const dispatch = useStructureDispatch()
  const { results, analysisInput } = useAnalysisResults()

  const currentInputKey = useMemo(() => JSON.stringify(toStructureInput(state)), [state])
  const analyzedInputKey = useMemo(
    () => (analysisInput ? JSON.stringify(analysisInput) : null),
    [analysisInput],
  )
  const analysisIsCurrent = !!results && !!analysisInput && analyzedInputKey === currentInputKey

  useEffect(() => {
    if (module === 'truss' && (state.selectedTool === 'beam' || state.selectedTool === 'column')) {
      dispatch({ type: 'SET_TOOL', tool: 'truss' })
    }
  }, [dispatch, module, state.selectedTool])
  const elementNames = useMemo(
    () => state.elements.map((e) => e.name),
    [state.elements],
  )

  const maxResultDispM = useMemo(() => {
    if (!results) return 0
    let maxDisp = 0
    for (const value of Object.values(results.displacements ?? {})) {
      const dxm = (value[0] ?? 0) / 1000
      const dym = (value[1] ?? 0) / 1000
      const mag = Math.hypot(dxm, dym)
      if (mag > maxDisp) maxDisp = mag
    }
    return maxDisp
  }, [results])

  const maxDiagramDeflectionM = useMemo(() => {
    let maxDeflMm = 0
    for (const d of Object.values(diagramData)) {
      for (const v of d.deflection) {
        const abs = Math.abs(v)
        if (abs > maxDeflMm) maxDeflMm = abs
      }
    }
    return maxDeflMm / 1000
  }, [diagramData])

  const maxRenderableDeflectionM = Math.max(maxResultDispM, maxDiagramDeflectionM)

  const deflectionFactor = useMemo(() => {
    if (deflectionSlider <= 0 || maxRenderableDeflectionM <= 1e-12) return 0
    const fullScaleFactor = DEFLECTION_TARGET_MAX_PX / (maxRenderableDeflectionM * gridSize)
    return (deflectionSlider / 100) * fullScaleFactor
  }, [deflectionSlider, gridSize, maxRenderableDeflectionM])

  const nodeRenderCoords = useMemo(() => {
    const map: Record<string, { mx: number; my: number }> = {}
    for (const node of state.nodes) {
      const disp = results?.displacements?.[node.name]
      const dxm = disp ? (disp[0] / 1000) * deflectionFactor : 0
      const dym = disp ? (disp[1] / 1000) * deflectionFactor : 0
      map[node.id] = {
        mx: node.x + dxm,
        my: node.y + dym,
      }
    }
    return map
  }, [deflectionFactor, results, state.nodes])

  useEffect(() => {
    if (module === 'truss' && (diagramMode === 'shear' || diagramMode === 'moment')) {
      setDiagramMode('axial')
    }
  }, [diagramMode, module])
  const structureForDiagrams = analysisInput

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

  const visibleSupportReactions = useMemo(() => {
    if (!showSupportReactions || !results || !analysisIsCurrent) return []

    const byNodeName = new Map(results.reactions.map((r) => [r.node, r]))
    return state.supports
      .map((sup) => {
        const node = state.nodes.find((n) => n.id === sup.nodeId)
        if (!node) return null
        const reaction = byNodeName.get(node.name)
        if (!reaction) return null
        return {
          id: sup.id,
          nodeId: sup.nodeId,
          fx: reaction.fx_kN * 1000,
          fy: reaction.fy_kN * 1000,
        }
      })
      .filter((item): item is { id: string; nodeId: string; fx: number; fy: number } => item !== null)
  }, [showSupportReactions, results, analysisIsCurrent, state.supports, state.nodes])

  const trussStability = useMemo(() => {
    if (module !== 'truss') {
      return { unstable: false, reasons: [] as string[] }
    }

    const reasons: string[] = []
    const trussElements = state.elements.filter((e) => e.role === 'truss_member')
    const nonTrussElements = state.elements.filter((e) => e.role !== 'truss_member')

    if (nonTrussElements.length > 0) {
      reasons.push('Contains beam/column elements (truss mode is axial-only).')
    }

    if (state.udls.length > 0) {
      reasons.push('Distributed member loads require bending stiffness.')
    }

    if (state.supports.some((s) => s.type === 'fixed')) {
      reasons.push('Fixed supports imply moment restraint, outside pin-jointed assumptions.')
    }

    const nodeSet = new Set<string>()
    for (const e of trussElements) {
      nodeSet.add(e.nodeI)
      nodeSet.add(e.nodeJ)
    }

    const joints = nodeSet.size
    const members = trussElements.length
    const reactionComponents = state.supports
      .filter((s) => nodeSet.has(s.nodeId))
      .reduce((sum, s) => {
        if (s.type === 'pinned') return sum + 2
        if (s.type === 'roller') return sum + 1
        return sum + 3
      }, 0)

    if (joints > 0 && reactionComponents < 3) {
      reasons.push('Insufficient support reactions for planar equilibrium (need at least 3).')
    }

    if (joints > 0 && members + reactionComponents < 2 * joints) {
      reasons.push('Mechanism risk: m + r < 2j, so equilibrium may require bending action.')
    }

    return {
      unstable: reasons.length > 0,
      reasons,
    }
  }, [module, state.elements, state.supports, state.udls])

  const frameReleaseStability = useMemo(() => {
    if (module !== 'frame') {
      return { unstable: false, reasons: [] as string[] }
    }

    const frameElements = state.elements.filter((e) => e.role !== 'truss_member')
    if (frameElements.length === 0) {
      return { unstable: false, reasons: [] as string[] }
    }

    const connected = new Map<string, Array<{ endPinned: boolean }>>()
    for (const elem of frameElements) {
      const a = connected.get(elem.nodeI) ?? []
      a.push({ endPinned: !!elem.releaseStart })
      connected.set(elem.nodeI, a)

      const b = connected.get(elem.nodeJ) ?? []
      b.push({ endPinned: !!elem.releaseEnd })
      connected.set(elem.nodeJ, b)
    }

    const fixedSupportNodeIds = new Set(
      state.supports.filter((s) => s.type === 'fixed').map((s) => s.nodeId),
    )

    const reasons: string[] = []
    for (const [nodeId, ends] of connected) {
      if (ends.length < 2) continue
      if (fixedSupportNodeIds.has(nodeId)) continue
      if (ends.every((r) => r.endPinned)) {
        const nodeName = state.nodes.find((n) => n.id === nodeId)?.name ?? nodeId
        reasons.push(`${nodeName} has only pinned member ends and no fixed restraint.`)
      }
    }

    return {
      unstable: reasons.length > 0,
      reasons,
    }
  }, [module, state.elements, state.nodes, state.supports])

  const canDeleteSelected = useMemo(() => {
    if (multiSelectedIds.length > 0) return true
    if (!state.selectedId) return false
    const id = state.selectedId
    return (
      state.nodes.some((n) => n.id === id) ||
      state.elements.some((e) => e.id === id) ||
      state.supports.some((s) => s.id === id) ||
      state.udls.some((u) => u.id === id) ||
      state.pointLoads.some((p) => p.id === id)
    )
  }, [multiSelectedIds.length, state.selectedId, state.nodes, state.elements, state.supports, state.udls, state.pointLoads])

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
    if (multiSelectedIds.length > 0) {
      const ids = Array.from(new Set(multiSelectedIds))
      for (const id of ids) {
        deleteById(id)
      }
      setMultiSelectedIds([])
      dispatch({ type: 'SELECT', id: null })
      return
    }
    if (!state.selectedId) return
    deleteById(state.selectedId)
  }, [dispatch, multiSelectedIds, state.selectedId, deleteById])

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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const stageEl = el.querySelector('canvas')?.parentElement
    if (!stageEl) return
    if (isPanning.current) return
    stageEl.style.cursor = state.selectedTool === 'drag' ? 'grab' : 'default'
  }, [state.selectedTool])

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
    (px: number, py: number) => {
      const rawX = (px - offset.x) / gridSize
      const rawY = -((py - offset.y) / gridSize)
      const snap = (value: number) =>
        Number((Math.round(value / gridStepM) * gridStepM).toFixed(6))
      return {
        mx: snap(rawX),
        my: snap(rawY),
      }
    },
    [gridSize, gridStepM, offset],
  )

  const toMetresRaw = useCallback(
    (px: number, py: number) => ({
      mx: (px - offset.x) / gridSize,
      my: -(py - offset.y) / gridSize,
    }),
    [gridSize, offset],
  )

  const selectIdsWithinBox = useCallback(
    (startPx: { x: number; y: number }, endPx: { x: number; y: number }) => {
      const minPxX = Math.min(startPx.x, endPx.x)
      const maxPxX = Math.max(startPx.x, endPx.x)
      const minPxY = Math.min(startPx.y, endPx.y)
      const maxPxY = Math.max(startPx.y, endPx.y)
      const dragDistance = Math.hypot(endPx.x - startPx.x, endPx.y - startPx.y)
      if (dragDistance < 6) {
        setMultiSelectedIds([])
        return false
      }

      const startM = toMetresRaw(minPxX, maxPxY)
      const endM = toMetresRaw(maxPxX, minPxY)
      const minX = Math.min(startM.mx, endM.mx)
      const maxX = Math.max(startM.mx, endM.mx)
      const minY = Math.min(startM.my, endM.my)
      const maxY = Math.max(startM.my, endM.my)

      const selectedNodeIds = state.nodes
        .filter((node) => pointInRect(node.x, node.y, minX, minY, maxX, maxY))
        .map((node) => node.id)

      const selectedElementIds = state.elements
        .filter((elem) => {
          const ni = state.nodes.find((n) => n.id === elem.nodeI)
          const nj = state.nodes.find((n) => n.id === elem.nodeJ)
          if (!ni || !nj) return false
          return lineIntersectsRect(ni.x, ni.y, nj.x, nj.y, minX, minY, maxX, maxY)
        })
        .map((elem) => elem.id)

      const selectedSupportIds = state.supports
        .filter((support) => selectedNodeIds.includes(support.nodeId))
        .map((support) => support.id)

      const selectedPointLoadIds = state.pointLoads
        .filter((pointLoad) => selectedNodeIds.includes(pointLoad.nodeId))
        .map((pointLoad) => pointLoad.id)

      const selectedUdlIds = state.udls
        .filter((udl) => selectedElementIds.includes(udl.elementId))
        .map((udl) => udl.id)

      const ids = [
        ...selectedElementIds,
        ...selectedNodeIds,
        ...selectedSupportIds,
        ...selectedPointLoadIds,
        ...selectedUdlIds,
      ]

      setMultiSelectedIds(ids)
      dispatch({ type: 'SELECT', id: ids[0] ?? null })
      return true
    },
    [dispatch, state.elements, state.nodes, state.pointLoads, state.supports, state.udls, toMetresRaw],
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

  const fitToOrigin = useCallback(() => {
    if (dims.width <= 2 || dims.height <= 2) return
    setOffset({
      x: dims.width / 2,
      y: dims.height / 2,
    })
  }, [dims.width, dims.height])

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (didPan.current) {
      didPan.current = false
      return
    }
    if (didBoxSelect.current) {
      didBoxSelect.current = false
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
      setMultiSelectedIds([])
      dispatch({ type: 'ADD_NODE', x: mx, y: my })
    } else if (state.selectedTool === 'select') {
      setMultiSelectedIds([])
      dispatch({ type: 'SELECT', id: null })
    }
  }

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.currentTarget.getStage()
    if (!stage) return

    const isMiddleButton = e.evt.button === 1
    const isLeftDragPan = e.evt.button === 0 && state.selectedTool === 'drag'
    const isLeftBoxSelect =
      e.evt.button === 0 &&
      state.selectedTool === 'select' &&
      e.target === e.currentTarget

    if (!isMiddleButton && !isLeftDragPan && !isLeftBoxSelect) return

    if (isLeftBoxSelect) {
      const pos = stage.getPointerPosition()
      if (!pos) return
      e.evt.preventDefault()
      isBoxSelecting.current = true
      didBoxSelect.current = false
      setBoxSelectionStart({ x: pos.x, y: pos.y })
      setBoxSelectionEnd({ x: pos.x, y: pos.y })
      return
    }

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

    if (isBoxSelecting.current && boxSelectionStart) {
      e.evt.preventDefault()
      setBoxSelectionEnd({ x: pos.x, y: pos.y })
      if (Math.hypot(pos.x - boxSelectionStart.x, pos.y - boxSelectionStart.y) > 3) {
        didBoxSelect.current = true
      }
      return
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
    if (isBoxSelecting.current && boxSelectionStart && boxSelectionEnd) {
      const didSelect = selectIdsWithinBox(boxSelectionStart, boxSelectionEnd)
      didBoxSelect.current = didSelect
      isBoxSelecting.current = false
      setBoxSelectionStart(null)
      setBoxSelectionEnd(null)
      return
    }

    if (!isPanning.current) return
    const stage = e.currentTarget.getStage()
    if (!stage) return
    isPanning.current = false
    lastPanPos.current = null
    stage.container().style.cursor = state.selectedTool === 'drag' ? 'grab' : 'default'
  }

  const handleStageMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
    setPlacementCursor(null)
    if (isBoxSelecting.current) {
      isBoxSelecting.current = false
      setBoxSelectionStart(null)
      setBoxSelectionEnd(null)
    }
    if (!isPanning.current) return
    const stage = e.currentTarget.getStage()
    if (!stage) return
    isPanning.current = false
    lastPanPos.current = null
    stage.container().style.cursor = state.selectedTool === 'drag' ? 'grab' : 'default'
  }

  const getTouchPoint = (touch: Touch, stage: ReturnType<KonvaEventObject<TouchEvent>['currentTarget']['getStage']>) => {
    const rect = stage.container().getBoundingClientRect()
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }

  const getTouchCenterAndDistance = (
    t1: Touch,
    t2: Touch,
    stage: ReturnType<KonvaEventObject<TouchEvent>['currentTarget']['getStage']>,
  ) => {
    const p1 = getTouchPoint(t1, stage)
    const p2 = getTouchPoint(t2, stage)
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    return { center, distance }
  }

  const handleStageTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    const stage = e.currentTarget.getStage()
    if (!stage) return
    const touches = e.evt.touches

    if (touches.length >= 2) {
      e.evt.preventDefault()
      const { center, distance } = getTouchCenterAndDistance(touches[0], touches[1], stage)
      touchPanMode.current = 'two'
      isPanning.current = true
      didPan.current = false
      lastPanPos.current = center
      pinchStartDistance.current = Math.max(distance, 1)
      pinchStartGridSize.current = gridSize
      return
    }

    if (touches.length === 1 && state.selectedTool === 'drag') {
      e.evt.preventDefault()
      const p = getTouchPoint(touches[0], stage)
      touchPanMode.current = 'one'
      isPanning.current = true
      didPan.current = false
      lastPanPos.current = p
      pinchStartDistance.current = null
    }
  }

  const handleStageTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const stage = e.currentTarget.getStage()
    if (!stage) return
    const touches = e.evt.touches

    if (touches.length >= 2) {
      e.evt.preventDefault()
      const { center, distance } = getTouchCenterAndDistance(touches[0], touches[1], stage)

      if (touchPanMode.current !== 'two') {
        touchPanMode.current = 'two'
        isPanning.current = true
        didPan.current = false
        lastPanPos.current = center
        pinchStartDistance.current = Math.max(distance, 1)
        pinchStartGridSize.current = gridSize
        return
      }

      if (lastPanPos.current) {
        const dx = center.x - lastPanPos.current.x
        const dy = center.y - lastPanPos.current.y
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          didPan.current = true
          setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
        }
      }
      lastPanPos.current = center

      const baseDistance = pinchStartDistance.current ?? Math.max(distance, 1)
      const ratio = Math.max(0.1, distance / Math.max(baseDistance, 1))
      const nextGrid = pinchStartGridSize.current * ratio
      setZoomAt(nextGrid, center.x, center.y)
      return
    }

    if (touches.length === 1 && touchPanMode.current === 'one' && state.selectedTool === 'drag') {
      e.evt.preventDefault()
      const p = getTouchPoint(touches[0], stage)
      if (lastPanPos.current) {
        const dx = p.x - lastPanPos.current.x
        const dy = p.y - lastPanPos.current.y
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          didPan.current = true
          setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
        }
      }
      lastPanPos.current = p
    }
  }

  const handleStageTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
    const stage = e.currentTarget.getStage()
    if (!stage) return
    const touches = e.evt.touches

    if (touches.length >= 2) {
      const { center, distance } = getTouchCenterAndDistance(touches[0], touches[1], stage)
      touchPanMode.current = 'two'
      isPanning.current = true
      lastPanPos.current = center
      pinchStartDistance.current = Math.max(distance, 1)
      pinchStartGridSize.current = gridSize
      return
    }

    if (touches.length === 1 && state.selectedTool === 'drag') {
      const p = getTouchPoint(touches[0], stage)
      touchPanMode.current = 'one'
      isPanning.current = true
      lastPanPos.current = p
      pinchStartDistance.current = null
      return
    }

    touchPanMode.current = null
    isPanning.current = false
    lastPanPos.current = null
    pinchStartDistance.current = null
    stage.container().style.cursor = state.selectedTool === 'drag' ? 'grab' : 'default'
  }

  const handleNodeClick = (nodeId: string) => {
    const tool = state.selectedTool

    if (tool === 'erase') {
      dispatch({ type: 'DELETE_NODE', id: nodeId })
      return
    }

    if (tool === 'select') {
      setMultiSelectedIds([nodeId])
      dispatch({ type: 'SELECT', id: nodeId })
      return
    }

    if (tool === 'beam' || tool === 'column' || tool === 'truss') {
      if (module === 'truss' && tool !== 'truss') {
        return
      }
      if (state.pendingNodeId === null) {
        setMultiSelectedIds([])
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
              ? columnDraftDesignation
              : beamDraftDesignation
        dispatch({
          type: 'ADD_ELEMENT',
          nodeI: state.pendingNodeId,
          nodeJ: nodeId,
          role,
          designation: defaultDesignation,
          youngsModulus:
            role === 'beam'
              ? beamDraftYoungsModulus
              : role === 'column'
                ? columnDraftYoungsModulus
              : DEFAULT_YOUNGS_MODULUS_N_PER_MM2,
          releaseStart:
            role === 'beam'
              ? beamDraftReleaseStart
              : role === 'column'
                ? columnDraftReleaseStart
                : false,
          releaseEnd:
            role === 'beam'
              ? beamDraftReleaseEnd
              : role === 'column'
                ? columnDraftReleaseEnd
                : false,
        })
      }
      return
    }

    if (tool === 'support') {
      dispatch({
        type: 'ADD_SUPPORT',
        nodeId,
        supportType: supportDraftType,
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
      return
    }
  }

  const handleElementClick = (elemId: string) => {
    if (state.selectedTool === 'erase') {
      dispatch({ type: 'DELETE_ELEMENT', id: elemId })
      return
    }

    if (state.selectedTool === 'select') {
      setMultiSelectedIds([elemId])
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
      return
    }
  }

  const handleSupportClick = (supportId: string, nodeId: string) => {
    if (state.selectedTool === 'erase') {
      dispatch({ type: 'DELETE_SUPPORT', id: supportId })
      return
    }
    if (state.selectedTool === 'select') {
      setMultiSelectedIds([nodeId])
      dispatch({ type: 'SELECT', id: nodeId })
    }
  }

  const handlePointLoadClick = (pointLoadId: string, nodeId: string) => {
    if (state.selectedTool === 'erase') {
      dispatch({ type: 'DELETE_POINT_LOAD', id: pointLoadId })
      return
    }
    if (state.selectedTool === 'select') {
      setMultiSelectedIds([nodeId])
      dispatch({ type: 'SELECT', id: nodeId })
    }
  }

  const handleUdlClick = (udlId: string, elementId: string) => {
    if (state.selectedTool === 'erase') {
      dispatch({ type: 'DELETE_UDL', id: udlId })
      return
    }
    if (state.selectedTool === 'select') {
      setMultiSelectedIds([elementId])
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
    const shouldFetch =
      !!results &&
      analysisIsCurrent &&
      !!structureForDiagrams &&
      elementNames.length > 0 &&
      (diagramMode !== 'none' || module === 'truss' || deflectionSlider > 0)

    if (!shouldFetch) {
      setDiagramData({})
      setDiagramError(null)
      setDiagramLoading(false)
      return
    }

    let mounted = true
    const diagramStructure = structureForDiagrams
    if (!diagramStructure) {
      setDiagramData({})
      setDiagramError(null)
      setDiagramLoading(false)
      return
    }

    setDiagramLoading(true)
    setDiagramError(null)

    Promise.all(
      elementNames.map((name) =>
        fetchDiagrams({
          structure: diagramStructure,
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
  }, [
    results,
    analysisIsCurrent,
    diagramMode,
    elementNames,
    module,
    structureForDiagrams,
    deflectionSlider,
  ])

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

  const canvasControls = (
    <>
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
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2 md:h-7"
            onClick={fitToOrigin}
            title="Center canvas on origin"
          >
            Origin
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
          {module !== 'truss' && <option value="shear">Shear</option>}
          {module !== 'truss' && <option value="moment">Moment</option>}
        </select>
      </div>

      {module === 'truss' && trussStability.unstable && (
        <div
          className="flex items-start gap-2 rounded border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-red-700 dark:text-red-300"
          title={trussStability.reasons.join('\n')}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="text-[11px] leading-snug">
            Unstable or bending-dependent truss.
          </div>
        </div>
      )}

      <div className="border-t border-border pt-2 space-y-1">
        <div className="mb-1 text-muted-foreground">Element labels</div>
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Show element tag</span>
          <input
            type="checkbox"
            checked={showElementTag}
            onChange={(e) => setShowElementTag(e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Show section size</span>
          <input
            type="checkbox"
            checked={showElementSection}
            onChange={(e) => setShowElementSection(e.target.checked)}
          />
        </label>
        {module === 'frame' && (
          <>
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Show member end releases</span>
              <input
                type="checkbox"
                checked={showMemberEndReleases}
                onChange={(e) => setShowMemberEndReleases(e.target.checked)}
              />
            </label>
            {showMemberEndReleases && (
              <div className="text-[11px] text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-[#facc15]" /> Pinned{' '}
                <span className="mx-1">•</span>
                <span className="inline-block h-2 w-2 rounded-full bg-[#16a34a]" /> Fixed
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-border pt-2 space-y-1">
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Show support reactions</span>
          <input
            type="checkbox"
            checked={showSupportReactions}
            onChange={(e) => setShowSupportReactions(e.target.checked)}
          />
        </label>

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
    </>
  )

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-neutral-100 dark:bg-neutral-400"
    >
      <CanvasToolbar
        module={module}
        canDeleteSelected={canDeleteSelected}
        onDeleteSelected={deleteSelected}
        beamDraftDesignation={beamDraftDesignation}
        beamDraftYoungsModulus={beamDraftYoungsModulus}
        beamDraftReleaseStart={beamDraftReleaseStart}
        beamDraftReleaseEnd={beamDraftReleaseEnd}
        columnDraftDesignation={columnDraftDesignation}
        columnDraftYoungsModulus={columnDraftYoungsModulus}
        columnDraftReleaseStart={columnDraftReleaseStart}
        columnDraftReleaseEnd={columnDraftReleaseEnd}
        supportDraftType={supportDraftType}
        onBeamDraftDesignationChange={setBeamDraftDesignation}
        onBeamDraftYoungsModulusChange={setBeamDraftYoungsModulus}
        onBeamDraftReleaseStartChange={setBeamDraftReleaseStart}
        onBeamDraftReleaseEndChange={setBeamDraftReleaseEnd}
        onColumnDraftDesignationChange={setColumnDraftDesignation}
        onColumnDraftYoungsModulusChange={setColumnDraftYoungsModulus}
        onColumnDraftReleaseStartChange={setColumnDraftReleaseStart}
        onColumnDraftReleaseEndChange={setColumnDraftReleaseEnd}
        onSupportDraftTypeChange={setSupportDraftType}
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

      <div className="absolute z-10 hidden min-w-52 space-y-2 rounded-lg border border-border bg-card/90 px-2 py-2 text-xs backdrop-blur md:right-2 md:top-2 md:block">
        {canvasControls}
      </div>

      {mobileControlsOpen && (
        <div className="absolute z-10 space-y-2 rounded-lg border border-border bg-card/90 px-2 py-2 text-xs backdrop-blur md:hidden left-2 right-2 bottom-[4.6rem]">
          {canvasControls}
        </div>
      )}

      <Stage
        width={dims.width}
        height={dims.height}
        style={{ touchAction: 'none' }}
        onClick={handleStageClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseLeave}
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageTouchEnd}
        onWheel={handleWheel}
      >
        <Layer>
          <GridLayer
            width={dims.width}
            height={dims.height}
            gridSize={gridSize}
            gridStepM={gridStepM}
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
              const pendingCoords = nodeRenderCoords[pendingNode.id] ?? {
                mx: pendingNode.x,
                my: pendingNode.y,
              }
              const p1 = toPixel(pendingCoords.mx, pendingCoords.my)
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

          {boxSelectionStart && boxSelectionEnd && (
            <Rect
              x={Math.min(boxSelectionStart.x, boxSelectionEnd.x)}
              y={Math.min(boxSelectionStart.y, boxSelectionEnd.y)}
              width={Math.abs(boxSelectionEnd.x - boxSelectionStart.x)}
              height={Math.abs(boxSelectionEnd.y - boxSelectionStart.y)}
              fill="rgba(59, 130, 246, 0.18)"
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[6, 4]}
              listening={false}
            />
          )}

          {/* Elements */}
          {state.elements.map((elem) => {
            const ni = nodeRenderCoords[elem.nodeI]
            const nj = nodeRenderCoords[elem.nodeJ]
            if (!ni || !nj) return null
            const p1 = toPixel(ni.mx, ni.my)
            const p2 = toPixel(nj.mx, nj.my)

            let animatedPoints: number[] | undefined
            const d = diagramData[elem.name]
            const niBase = state.nodes.find((n) => n.id === elem.nodeI)
            const njBase = state.nodes.find((n) => n.id === elem.nodeJ)
            if (deflectionSlider > 0 && d && niBase && njBase && d.x.length > 1) {
              const dx = njBase.x - niBase.x
              const dy = njBase.y - niBase.y
              const L = Math.hypot(dx, dy)
              if (L > 1e-9) {
                const c = dx / L
                const s = dy / L
                animatedPoints = []
                for (let i = 0; i < d.x.length; i++) {
                  const x = d.x[i] ?? 0
                  const vMm = d.deflection[i] ?? 0
                  const baseMx = niBase.x + c * x
                  const baseMy = niBase.y + s * x
                  const base = toPixel(baseMx, baseMy)
                  const offsetPx = (vMm / 1000) * gridSize * deflectionFactor
                  animatedPoints.push(base.px - s * offsetPx, base.py - c * offsetPx)
                }
              }
            }

            return (
              <ElementLine
                key={elem.id}
                x1={p1.px}
                y1={p1.py}
                x2={p2.px}
                y2={p2.py}
                points={animatedPoints}
                name={elem.name}
                designation={elem.designation}
                role={elem.role}
                selected={state.selectedId === elem.id || multiSelectedIds.includes(elem.id)}
                onSelect={() => handleElementClick(elem.id)}
                showName={showElementTag}
                showDesignation={showElementSection}
                showReleaseState={module === 'frame' && showMemberEndReleases}
                startPinned={!!elem.releaseStart}
                endPinned={!!elem.releaseEnd}
              />
            )
          })}

          {deflectionSlider > 0 &&
            state.elements.map((elem) => {
              const ni = state.nodes.find((n) => n.id === elem.nodeI)
              const nj = state.nodes.find((n) => n.id === elem.nodeJ)
              if (!ni || !nj) return null

              const p1 = toPixel(ni.x, ni.y)
              const p2 = toPixel(nj.x, nj.y)

              return (
                <Line
                  key={`${elem.id}-original-outline`}
                  points={[p1.px, p1.py, p2.px, p2.py]}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  dash={[5, 5]}
                  opacity={0.8}
                  listening={false}
                />
              )
            })}

          {/* UDLs */}
          {visibleUdls.map((udl) => {
            const elem = state.elements.find((e) => e.id === udl.elementId)
            if (!elem) return null
            const ni = nodeRenderCoords[elem.nodeI]
            const nj = nodeRenderCoords[elem.nodeJ]
            if (!ni || !nj) return null
            const p1 = toPixel(ni.mx, ni.my)
            const p2 = toPixel(nj.mx, nj.my)
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
            const node = nodeRenderCoords[pl.nodeId]
            if (!node) return null
            const p = toPixel(node.mx, node.my)
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
            const node = nodeRenderCoords[sup.nodeId]
            if (!node) return null
            const p = toPixel(node.mx, node.my)
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

          {/* Support reactions */}
          {visibleSupportReactions.map((reaction) => {
            const node = nodeRenderCoords[reaction.nodeId]
            if (!node) return null
            const p = toPixel(node.mx, node.my)
            return (
              <PointLoadArrow
                key={`${reaction.id}-reaction`}
                x={p.px}
                y={p.py}
                fx={reaction.fx}
                fy={reaction.fy}
                color="#b91c1c"
              />
            )
          })}

          {/* Nodes (drawn last to be on top) */}
          {state.nodes.map((node) => {
            const renderNode = nodeRenderCoords[node.id] ?? { mx: node.x, my: node.y }
            const p = toPixel(renderNode.mx, renderNode.my)
            return (
              <NodeShape
                key={node.id}
                x={p.px}
                y={p.py}
                name={node.name}
                selected={
                  state.selectedId === node.id ||
                  state.pendingNodeId === node.id ||
                  multiSelectedIds.includes(node.id)
                }
                onSelect={() => handleNodeClick(node.id)}
                onDragEnd={(mx, my) =>
                  dispatch({ type: 'MOVE_NODE', id: node.id, x: mx, y: my })
                }
                draggable={state.selectedTool === 'select' && deflectionSlider === 0}
                gridSize={gridSize}
                gridStepM={gridStepM}
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
              const isTrussAxialDiagram = module === 'truss' && activeDiagramKey === 'axial'
              const elementDiagramColor = isTrussAxialDiagram
                ? axialSignColor(d.axial)
                : diagramColor
              const elementDiagramFillColor = isTrussAxialDiagram
                ? hexToRgba(elementDiagramColor, 0.28)
                : diagramFillColor
              return [
                <Line
                  key={`${elem.id}-${activeDiagramKey}-fill`}
                  points={shadedPolygon}
                  closed
                  fill={elementDiagramFillColor}
                  listening={false}
                />,
                <Line
                  key={`${elem.id}-${activeDiagramKey}`}
                  points={points}
                  stroke={elementDiagramColor}
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
                fill={
                  module === 'truss' && activeDiagramKey === 'axial'
                    ? axialSignColor(diagramData[hoverProbe.element]?.axial ?? [])
                    : diagramColor
                }
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
        <div className="absolute z-10 rounded border border-border bg-card/90 px-2 py-1 text-xs backdrop-blur md:bottom-12 md:right-2 max-md:top-14 max-md:left-2 max-md:right-2">
          {diagramLoading
            ? 'Loading canvas diagrams...'
            : `Canvas diagram error: ${(diagramError ?? '').slice(0, 80)}`}
        </div>
      )}

      {module === 'frame' && frameReleaseStability.unstable && (
        <div
          className="absolute z-10 rounded border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-xs text-amber-900 backdrop-blur md:bottom-12 md:left-2 max-md:top-14 max-md:left-2 max-md:right-2"
          title={frameReleaseStability.reasons.join('\n')}
        >
          Potential instability from end releases: {frameReleaseStability.reasons[0]}
        </div>
      )}

      <div className="absolute bottom-24 left-2 z-10 rounded border border-border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur max-md:hidden">
        1 grid = {GRID_STEP_LABELS.get(gridStepM) ?? `${gridStepM} m`}
      </div>

      <div className="absolute bottom-2 left-2 z-10 w-72 rounded border border-border bg-card/90 px-2 py-2 text-[11px] text-muted-foreground backdrop-blur max-md:hidden">
        <div className="mb-1 flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5" />
          <span>Deflection Animation</span>
          <span className="ml-auto tabular-nums">{Math.round(deflectionSlider)}%</span>
        </div>
        <Slider
          value={[deflectionSlider]}
          onValueChange={(values) => setDeflectionSlider(values[0] ?? 0)}
          min={0}
          max={100}
          step={1}
        />
        {/* <div className="mt-1">Zoom: wheel · Pan: hand/middle · drag nodes disabled while animating</div> */}
        {deflectionSlider > 0 && !results && (
          <div className="mt-1 text-amber-700 dark:text-amber-400">
            Run analysis to animate deflection.
          </div>
        )}
        {deflectionSlider > 0 && results && !diagramLoading && maxRenderableDeflectionM <= 1e-12 && (
          <div className="mt-1 text-amber-700 dark:text-amber-400">
            No measurable deflection for the current case.
          </div>
        )}
      </div>
    </div>
  )
}
