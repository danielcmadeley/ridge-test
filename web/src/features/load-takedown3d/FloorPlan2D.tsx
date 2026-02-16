import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { LoadTakedownColumn, LoadTakedownElement, LoadTakedownSlab } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { useLoadTakedown3DStore } from './store'

const BASE_SCALE = 30 // px / m
const MIN_SCALE = 8
const MAX_SCALE = 120
const EPS = 1e-9

type Pt = { x: number; y: number }

function snap(v: number, grid: number) {
  if (grid <= 0) return v
  return Math.round(v / grid) * grid
}

function isColumnOnLevel(col: LoadTakedownColumn, elevation: number) {
  const tol = 1e-6
  const z0 = Math.min(col.base.z, col.base.z + col.height)
  const z1 = Math.max(col.base.z, col.base.z + col.height)
  return elevation >= z0 - tol && elevation <= z1 + tol
}

function isSlabOnLevel(slab: LoadTakedownSlab, elevation: number) {
  return Math.abs(slab.elevation - elevation) < 1e-6
}

function connectedColumnsForSlab(slab: LoadTakedownSlab, columns: LoadTakedownColumn[]) {
  const tol = Math.max(0.05, slab.thickness)
  return columns.filter((c) => {
    const z0 = Math.min(c.base.z, c.base.z + c.height)
    const z1 = Math.max(c.base.z, c.base.z + c.height)
    return slab.elevation >= z0 - tol && slab.elevation <= z1 + tol
  })
}

function clipHalfPlane(poly: Pt[], a: number, b: number, c: number): Pt[] {
  if (!poly.length) return []
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const s = poly[i]
    const e = poly[(i + 1) % poly.length]
    const sIn = a * s.x + b * s.y <= c + EPS
    const eIn = a * e.x + b * e.y <= c + EPS

    if (sIn && eIn) {
      out.push(e)
    } else if (sIn && !eIn) {
      const den = a * (e.x - s.x) + b * (e.y - s.y)
      if (Math.abs(den) > EPS) {
        const t = (c - a * s.x - b * s.y) / den
        out.push({ x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) })
      }
    } else if (!sIn && eIn) {
      const den = a * (e.x - s.x) + b * (e.y - s.y)
      if (Math.abs(den) > EPS) {
        const t = (c - a * s.x - b * s.y) / den
        out.push({ x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) })
      }
      out.push(e)
    }
  }
  return out
}

function voronoiCellInRect(site: Pt, others: Pt[], rect: { x0: number; y0: number; x1: number; y1: number }): Pt[] {
  let poly: Pt[] = [
    { x: rect.x0, y: rect.y0 },
    { x: rect.x1, y: rect.y0 },
    { x: rect.x1, y: rect.y1 },
    { x: rect.x0, y: rect.y1 },
  ]

  for (const q of others) {
    const a = 2 * (q.x - site.x)
    const b = 2 * (q.y - site.y)
    const c = q.x * q.x + q.y * q.y - site.x * site.x - site.y * site.y
    poly = clipHalfPlane(poly, a, b, c)
    if (poly.length < 3) return []
  }

  return poly
}

export function FloorPlan2D() {
  const containerRef = useRef<HTMLDivElement>(null)
  const panning = useRef(false)
  const panMoved = useRef(false)
  const panStart = useRef<{ x: number; y: number } | null>(null)
  const [dims, setDims] = useState({ width: 900, height: 640 })
  const [scale, setScale] = useState(BASE_SCALE)
  const [offset, setOffset] = useState({ x: 120, y: 120 })
  const [slabDraft, setSlabDraft] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null)

  const model = useLoadTakedown3DStore((s) => s.model)
  const tool = useLoadTakedown3DStore((s) => s.activeTool)
  const selectedId = useLoadTakedown3DStore((s) => s.selectedId)
  const selectedIds = useLoadTakedown3DStore((s) => s.selectedIds)
  const setSelectedId = useLoadTakedown3DStore((s) => s.setSelectedId)
  const selectElement = useLoadTakedown3DStore((s) => s.selectElement)
  const addColumnAt = useLoadTakedown3DStore((s) => s.addColumnAt)
  const addSlabRect = useLoadTakedown3DStore((s) => s.addSlabRect)
  const updateElement = useLoadTakedown3DStore((s) => s.updateElement)
  const activeStoreyId = useLoadTakedown3DStore((s) => s.activeStoreyId)
  const snapToGrid = useLoadTakedown3DStore((s) => s.snapToGrid)

  const activeStorey = useMemo(
    () => model.storeys.find((s) => s.id === activeStoreyId) ?? model.storeys[0],
    [model.storeys, activeStoreyId],
  )
  const elevation = activeStorey?.elevation ?? 0

  const visibleElements = useMemo(
    () =>
      model.elements.filter((e) => {
        if (e.type === 'column') return isColumnOnLevel(e, elevation)
        if (e.type === 'slab') return isSlabOnLevel(e, elevation)
        return false
      }),
    [model.elements, elevation],
  )

  const columnsOnLevel = useMemo(
    () => visibleElements.filter((e): e is LoadTakedownColumn => e.type === 'column'),
    [visibleElements],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDims({ width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    setOffset((prev) => (prev.x === 120 && prev.y === 120 ? { x: dims.width * 0.2, y: dims.height * 0.2 } : prev))
  }, [dims.width, dims.height])

  const toScreen = (x: number, y: number) => ({ x: x * scale + offset.x, y: y * scale + offset.y })
  const toModel = (x: number, y: number) => ({ x: (x - offset.x) / scale, y: (y - offset.y) / scale })
  const maybeSnap = (v: number) => (snapToGrid ? snap(v, model.gridSize) : v)

  const gridStepPx = model.gridSize * scale
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const setZoomAt = (nextScale: number, anchorX: number, anchorY: number) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale))
    const mx = (anchorX - offset.x) / scale
    const my = (anchorY - offset.y) / scale
    setScale(clamped)
    setOffset({ x: anchorX - mx * clamped, y: anchorY - my * clamped })
  }

  const fitToVisible = () => {
    if (!visibleElements.length || dims.width <= 2 || dims.height <= 2) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const e of visibleElements) {
      if (e.type === 'slab') {
        minX = Math.min(minX, e.origin.x)
        minY = Math.min(minY, e.origin.y)
        maxX = Math.max(maxX, e.origin.x + e.width)
        maxY = Math.max(maxY, e.origin.y + e.depth)
      } else if (e.type === 'column') {
        minX = Math.min(minX, e.base.x - e.sizeX / 2)
        minY = Math.min(minY, e.base.y - e.sizeY / 2)
        maxX = Math.max(maxX, e.base.x + e.sizeX / 2)
        maxY = Math.max(maxY, e.base.y + e.sizeY / 2)
      }
    }

    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const pad = 48
    const availableW = Math.max(1, dims.width - pad * 2)
    const availableH = Math.max(1, dims.height - pad * 2)
    const nextScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.min(availableW / spanX, availableH / spanY)),
    )

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setScale(nextScale)
    setOffset({
      x: dims.width / 2 - cx * nextScale,
      y: dims.height / 2 - cy * nextScale,
    })
  }

  const onBackgroundPointer = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.currentTarget) return

    if (e.evt.button === 1) {
      e.evt.preventDefault()
      panning.current = true
      panMoved.current = false
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY }
      return
    }

    if (
      e.evt.button === 0 &&
      (tool === 'select' || tool === 'move')
    ) {
      e.evt.preventDefault()
      panning.current = true
      panMoved.current = false
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY }
      return
    }

    if (panning.current) return
    const stage = e.currentTarget.getStage()
    const p = stage.getPointerPosition()
    if (!p) return

    if (tool === 'select' || tool === 'move') {
      setSelectedId(null)
      return
    }

    const m = toModel(p.x, p.y)
    const x = maybeSnap(m.x)
    const y = maybeSnap(m.y)
    if (tool === 'column') {
      addColumnAt(x, y)
      return
    }
    if (tool === 'slab') {
      setSlabDraft({ x0: x, y0: y, x1: x, y1: y })
    }
  }

  return (
    <div className="relative h-full w-full bg-neutral-400" ref={containerRef}>
      <Stage
        width={dims.width}
        height={dims.height}
        onMouseDown={onBackgroundPointer}
        onMouseMove={(e) => {
          if (slabDraft) {
            const stage = e.currentTarget.getStage()
            const p = stage.getPointerPosition()
            if (!p) return
            const m = toModel(p.x, p.y)
            setSlabDraft((d) => (d ? { ...d, x1: maybeSnap(m.x), y1: maybeSnap(m.y) } : d))
            return
          }

          if (!panning.current || !panStart.current) return
          const dx = e.evt.clientX - panStart.current.x
          const dy = e.evt.clientY - panStart.current.y
          if (dx !== 0 || dy !== 0) {
            panMoved.current = true
            setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
            panStart.current = { x: e.evt.clientX, y: e.evt.clientY }
          }
        }}
        onMouseUp={() => {
          if (slabDraft) {
            const x = Math.min(slabDraft.x0, slabDraft.x1)
            const y = Math.min(slabDraft.y0, slabDraft.y1)
            const width = Math.abs(slabDraft.x1 - slabDraft.x0)
            const depth = Math.abs(slabDraft.y1 - slabDraft.y0)
            setSlabDraft(null)
            if (width >= 0.1 && depth >= 0.1) {
              addSlabRect(x, y, width, depth)
            }
          }
          if (panning.current && !panMoved.current && (tool === 'select' || tool === 'move')) {
            setSelectedId(null)
          }
          panning.current = false
          panMoved.current = false
          panStart.current = null
        }}
        onMouseLeave={() => {
          if (slabDraft) setSlabDraft(null)
          panning.current = false
          panMoved.current = false
          panStart.current = null
        }}
        onWheel={(e) => {
          e.evt.preventDefault()
          const stage = e.currentTarget.getStage()
          const pointer = stage.getPointerPosition()
          if (!pointer) return
          const factor = 1.1
          const next = e.evt.deltaY < 0 ? scale * factor : scale / factor
          setZoomAt(next, pointer.x, pointer.y)
        }}
      >
        <Layer>
          {tool !== 'move' && (
            <>
              {Array.from({ length: Math.ceil(dims.width / Math.max(1, gridStepPx)) + 2 }).map((_, i) => {
                const x = (offset.x % gridStepPx) + i * gridStepPx
                return <Line key={`gx-${x}`} points={[x, 0, x, dims.height]} stroke="rgba(38,38,38,0.2)" strokeWidth={1} listening={false} />
              })}
              {Array.from({ length: Math.ceil(dims.height / Math.max(1, gridStepPx)) + 2 }).map((_, i) => {
                const y = (offset.y % gridStepPx) + i * gridStepPx
                return <Line key={`gy-${y}`} points={[0, y, dims.width, y]} stroke="rgba(38,38,38,0.2)" strokeWidth={1} listening={false} />
              })}
            </>
          )}

          <Text
            x={12}
            y={12}
            text={`${activeStorey?.name ?? 'Level'} @ ${elevation.toFixed(2)} m`}
            fill="#262626"
            fontSize={12}
            listening={false}
          />
          {tool === 'slab' && (
            <Text
              x={12}
              y={30}
              text={`Drag to draw slab (${snapToGrid ? 'snap on' : 'free draw'})`}
              fill="#404040"
              fontSize={11}
              listening={false}
            />
          )}
          <Text
            x={12}
            y={48}
            text={`Zoom ${(scale / BASE_SCALE).toFixed(2)}x · Wheel to zoom · Drag canvas to pan`}
            fill="#525252"
            fontSize={10}
            listening={false}
          />

          {visibleElements.map((e) => {
            if (e.type === 'slab') {
              const p = toScreen(e.origin.x, e.origin.y)
              const connectedColumns = connectedColumnsForSlab(e, columnsOnLevel)
              const voronoi = connectedColumns.length
                ? connectedColumns.map((col) => {
                    const site = { x: col.base.x, y: col.base.y }
                    const others = connectedColumns
                      .filter((c) => c.id !== col.id)
                      .map((c) => ({ x: c.base.x, y: c.base.y }))
                    const poly = voronoiCellInRect(site, others, {
                      x0: e.origin.x,
                      y0: e.origin.y,
                      x1: e.origin.x + e.width,
                      y1: e.origin.y + e.depth,
                    })
                    return { colId: col.id, poly }
                  })
                : []

              return (
                <Group key={e.id}>
                  <Rect
                    x={p.x}
                    y={p.y}
                    width={e.width * scale}
                    height={e.depth * scale}
                    fill={selectedSet.has(e.id) ? 'rgba(14,165,233,0.45)' : 'rgba(56,189,248,0.35)'}
                    stroke={selectedSet.has(e.id) ? '#0ea5e9' : '#38bdf8'}
                    strokeWidth={selectedSet.has(e.id) ? 2 : 1}
                    draggable={tool === 'move'}
                    onClick={(evt) => {
                      evt.cancelBubble = true
                      selectElement(e.id, evt.evt.shiftKey)
                    }}
                    onDragEnd={(evt) => {
                      const m = toModel(evt.target.x(), evt.target.y())
                      updateElement(e.id, (curr) => {
                        if (curr.type !== 'slab') return curr
                        return {
                          ...curr,
                          origin: {
                            ...curr.origin,
                            x: maybeSnap(m.x),
                            y: maybeSnap(m.y),
                          },
                        }
                      })
                    }}
                  />

                  {voronoi.map(({ colId, poly }) => {
                    if (poly.length < 3) return null
                    const pts = poly
                      .map((pt) => {
                        const sp = toScreen(pt.x, pt.y)
                        return [sp.x, sp.y]
                      })
                      .flat()
                    return (
                      <Line
                        key={`${e.id}-trib-${colId}`}
                        points={pts}
                        closed
                        stroke="rgba(248,113,113,0.95)"
                        strokeWidth={1.5}
                        fill="rgba(248,113,113,0.08)"
                        listening={false}
                      />
                    )
                  })}
                </Group>
              )
            }

            if (e.type === 'column') {
              const p = toScreen(e.base.x - e.sizeX / 2, e.base.y - e.sizeY / 2)
              return (
                <Rect
                  key={e.id}
                  x={p.x}
                  y={p.y}
                  width={e.sizeX * scale}
                  height={e.sizeY * scale}
                  fill={selectedSet.has(e.id) ? 'rgba(251,146,60,0.55)' : 'rgba(251,146,60,0.35)'}
                  stroke={selectedSet.has(e.id) ? '#f97316' : '#fb923c'}
                  strokeWidth={selectedSet.has(e.id) ? 2 : 1}
                  draggable={tool === 'move'}
                  onClick={(evt) => {
                    evt.cancelBubble = true
                    selectElement(e.id, evt.evt.shiftKey)
                  }}
                  onDragEnd={(evt) => {
                    const m = toModel(evt.target.x() + (e.sizeX * scale) / 2, evt.target.y() + (e.sizeY * scale) / 2)
                    updateElement(e.id, (curr) => {
                      if (curr.type !== 'column') return curr
                      return {
                        ...curr,
                        base: {
                          ...curr.base,
                          x: maybeSnap(m.x),
                          y: maybeSnap(m.y),
                        },
                      }
                    })
                  }}
                />
              )
            }
            return null
          })}

          {slabDraft && (
            <Rect
              x={toScreen(Math.min(slabDraft.x0, slabDraft.x1), Math.min(slabDraft.y0, slabDraft.y1)).x}
              y={toScreen(Math.min(slabDraft.x0, slabDraft.x1), Math.min(slabDraft.y0, slabDraft.y1)).y}
              width={Math.abs(slabDraft.x1 - slabDraft.x0) * scale}
              height={Math.abs(slabDraft.y1 - slabDraft.y0) * scale}
              fill="rgba(34,197,94,0.2)"
              stroke="#22c55e"
              strokeWidth={2}
              dash={[6, 4]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      <div className="absolute top-3 right-3 z-10 rounded-lg border border-border bg-card/85 backdrop-blur px-2 py-2 text-xs">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2"
            onClick={() => setZoomAt(scale / 1.15, dims.width / 2, dims.height / 2)}
            title="Zoom out"
          >
            -
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2"
            onClick={() => setZoomAt(scale * 1.15, dims.width / 2, dims.height / 2)}
            title="Zoom in"
          >
            +
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2"
            onClick={fitToVisible}
            disabled={!visibleElements.length}
            title="Fit visible elements"
          >
            Fit
          </Button>
        </div>
      </div>
    </div>
  )
}
