import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Rect, Stage } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { UnifiedHeader } from '@/components/AppToolbar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { computeSectionProperties, fetchSections } from '@/lib/api'
import type { SectionInfo, SectionPropertiesOutput } from '@/lib/types'

export const Route = createFileRoute('/section-properties-calculator')({
  component: SectionPropertiesCalculatorPage,
})

type Tool = 'select' | 'draw' | 'erase'
type SectionSeries = 'all' | 'ub' | 'uc' | 'shs' | 'rhs'
type InsertMode = 'right' | 'origin' | 'centroid'

interface RectShape {
  id: string
  x_mm: number
  y_mm: number
  width_mm: number
  height_mm: number
}

interface DraftRect {
  startX: number
  startY: number
  endX: number
  endY: number
}

const PIXELS_PER_MM = 1.25
const GRID_STEP_MM = 20
const ZOOM_MIN = 0.3
const ZOOM_MAX = 8

function snapMm(v: number) {
  return Math.round(v / 5) * 5
}

function SectionPropertiesCalculatorPage() {
  return <SectionPropertiesCalculatorContent />
}

function SectionPropertiesCalculatorContent() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isMiddlePanning = useRef(false)
  const didPan = useRef(false)
  const lastPanPos = useRef<{ x: number; y: number } | null>(null)
  const offsetInitialized = useRef(false)
  const [dims, setDims] = useState({ width: 900, height: 640 })
  const [pixelsPerMm, setPixelsPerMm] = useState(PIXELS_PER_MM)
  const [offset, setOffset] = useState({ x: 120, y: 520 })
  const [tool, setTool] = useState<Tool>('select')
  const [rectangles, setRectangles] = useState<RectShape[]>([
    { id: 'R1', x_mm: 0, y_mm: 0, width_mm: 200, height_mm: 20 },
  ])
  const [selectedId, setSelectedId] = useState<string | null>('R1')
  const [nextId, setNextId] = useState(2)
  const [draft, setDraft] = useState<DraftRect | null>(null)
  const [props, setProps] = useState<SectionPropertiesOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedRect, setCopiedRect] = useState<RectShape | null>(null)
  const [sectionSeries, setSectionSeries] = useState<SectionSeries>('all')
  const [sections, setSections] = useState<SectionInfo[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [sectionsError, setSectionsError] = useState<string | null>(null)
  const [selectedDesignation, setSelectedDesignation] = useState<string>('')
  const [designationQuery, setDesignationQuery] = useState('')
  const [insertMode, setInsertMode] = useState<InsertMode>('right')

  const selected = useMemo(
    () => rectangles.find((r) => r.id === selectedId) ?? null,
    [rectangles, selectedId],
  )

  const filteredSections = useMemo(() => {
    const q = designationQuery.trim().toLowerCase()
    if (!q) return sections
    return sections.filter((s) => s.designation.toLowerCase().includes(q))
  }, [sections, designationQuery])

  const selectedSection = useMemo(
    () => filteredSections.find((s) => s.designation === selectedDesignation) ?? null,
    [filteredSections, selectedDesignation],
  )

  const duplicateRectangle = useCallback((source: RectShape) => {
    const id = `R${nextId}`
    const copy = {
      id,
      x_mm: source.x_mm + 20,
      y_mm: source.y_mm + 20,
      width_mm: source.width_mm,
      height_mm: source.height_mm,
    }
    setRectangles((prev) => [...prev, copy])
    setSelectedId(id)
    setNextId((n) => n + 1)
  }, [nextId])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      const next = {
        width: Math.max(1, Math.floor(width)),
        height: Math.max(1, Math.floor(height)),
      }
      setDims((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      )
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (offsetInitialized.current) return
    offsetInitialized.current = true
    setOffset({ x: 120, y: Math.max(140, dims.height - 120) })
  }, [dims.height])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        setRectangles((prev) => prev.filter((r) => r.id !== selectedId))
        setSelectedId(null)
        return
      }

      const isMeta = e.ctrlKey || e.metaKey
      if (!isMeta) return

      const selectedRect = rectangles.find((r) => r.id === selectedId) ?? null

      if (e.key.toLowerCase() === 'd' && selectedRect) {
        e.preventDefault()
        duplicateRectangle(selectedRect)
        return
      }

      if (e.key.toLowerCase() === 'c' && selectedRect) {
        e.preventDefault()
        setCopiedRect(selectedRect)
        return
      }

      if (e.key.toLowerCase() === 'v' && copiedRect) {
        e.preventDefault()
        duplicateRectangle(copiedRect)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, rectangles, copiedRect, duplicateRectangle])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        setSectionsLoading(true)
        setSectionsError(null)
        const data = await fetchSections(sectionSeries)
        if (cancelled) return
        setSections(data)
        setSelectedDesignation((prev) => {
          if (prev && data.some((s) => s.designation === prev)) return prev
          return data[0]?.designation ?? ''
        })
      } catch (err) {
        if (cancelled) return
        setSections([])
        setSectionsError((err as Error).message)
      } finally {
        if (!cancelled) setSectionsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [sectionSeries])

  useEffect(() => {
    if (filteredSections.length === 0) {
      setSelectedDesignation('')
      return
    }
    if (!filteredSections.some((s) => s.designation === selectedDesignation)) {
      setSelectedDesignation(filteredSections[0].designation)
    }
  }, [filteredSections, selectedDesignation])

  useEffect(() => {
    if (rectangles.length === 0) {
      setProps(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await computeSectionProperties({
          units: 'mm',
          rectangles,
        })
        if (!cancelled) setProps(data)
      } catch (err) {
        if (!cancelled) {
          setProps(null)
          setError((err as Error).message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [rectangles])

  const toMm = (px: number, py: number) => {
    const x_mm = snapMm((px - offset.x) / pixelsPerMm)
    const y_mm = snapMm(-(py - offset.y) / pixelsPerMm)
    return { x_mm, y_mm }
  }

  const toPx = (x_mm: number, y_mm: number) => ({
    x: x_mm * pixelsPerMm + offset.x,
    y: -y_mm * pixelsPerMm + offset.y,
  })

  const addRectangle = (r: Omit<RectShape, 'id'>) => {
    const id = `R${nextId}`
    setRectangles((prev) => [...prev, { id, ...r }])
    setSelectedId(id)
    setNextId((n) => n + 1)
  }

  const addRectangles = (items: Omit<RectShape, 'id'>[]) => {
    if (items.length === 0) return
    const start = nextId
    const withIds = items.map((r, idx) => ({ ...r, id: `R${start + idx}` }))
    setRectangles((prev) => [...prev, ...withIds])
    setSelectedId(withIds[withIds.length - 1].id)
    setNextId(start + items.length)
  }

  const addSectionGeometry = () => {
    if (!selectedSection) return

    const b = selectedSection.b_mm
    const h = selectedSection.h_mm
    const series = selectedSection.series.trim().toUpperCase()
    const isISection = series === 'UB' || series === 'UC'
    const isHollow = series === 'SHS' || series === 'RHS'

    let localRects: Omit<RectShape, 'id'>[] = [{ x_mm: 0, y_mm: 0, width_mm: b, height_mm: h }]

    if (isISection && selectedSection.tw_mm != null && selectedSection.tf_mm != null) {
      const tw = selectedSection.tw_mm
      const tf = selectedSection.tf_mm
      const webHeight = h - 2 * tf
      if (tw > 0 && tf > 0 && webHeight > 0 && tw <= b) {
        const webX = (b - tw) / 2
        localRects = [
          { x_mm: 0, y_mm: 0, width_mm: b, height_mm: tf },
          { x_mm: webX, y_mm: tf, width_mm: tw, height_mm: webHeight },
          { x_mm: 0, y_mm: h - tf, width_mm: b, height_mm: tf },
        ]
      }
    } else if (isHollow && selectedSection.t_mm != null) {
      const t = selectedSection.t_mm
      const innerW = b - 2 * t
      const innerH = h - 2 * t
      if (t > 0 && innerW > 0 && innerH > 0) {
        localRects = [
          { x_mm: 0, y_mm: 0, width_mm: b, height_mm: t },
          { x_mm: 0, y_mm: h - t, width_mm: b, height_mm: t },
          { x_mm: 0, y_mm: t, width_mm: t, height_mm: innerH },
          { x_mm: b - t, y_mm: t, width_mm: t, height_mm: innerH },
        ]
      }
    }

    const minLocalX = Math.min(...localRects.map((r) => r.x_mm))
    const minLocalY = Math.min(...localRects.map((r) => r.y_mm))
    const maxLocalX = Math.max(...localRects.map((r) => r.x_mm + r.width_mm))
    const maxLocalY = Math.max(...localRects.map((r) => r.y_mm + r.height_mm))
    const localCx = (minLocalX + maxLocalX) / 2
    const localCy = (minLocalY + maxLocalY) / 2

    let dx = 0
    let dy = 0
    if (insertMode === 'right') {
      if (rectangles.length > 0) {
        const maxX = Math.max(...rectangles.map((r) => r.x_mm + r.width_mm))
        const minY = Math.min(...rectangles.map((r) => r.y_mm))
        dx = maxX + 20
        dy = minY
      }
    } else if (insertMode === 'centroid') {
      dx = -localCx
      dy = -localCy
    }

    addRectangles(
      localRects.map((r) => ({
        x_mm: r.x_mm - minLocalX + dx,
        y_mm: r.y_mm - minLocalY + dy,
        width_mm: Math.max(1, r.width_mm),
        height_mm: Math.max(1, r.height_mm),
      })),
    )
  }

  const fitToShapes = useCallback(() => {
    if (rectangles.length === 0 || dims.width <= 2 || dims.height <= 2) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const r of rectangles) {
      minX = Math.min(minX, r.x_mm)
      minY = Math.min(minY, r.y_mm)
      maxX = Math.max(maxX, r.x_mm + r.width_mm)
      maxY = Math.max(maxY, r.y_mm + r.height_mm)
    }

    const widthMm = Math.max(1, maxX - minX)
    const heightMm = Math.max(1, maxY - minY)
    const padPx = 48

    const availableW = Math.max(1, dims.width - padPx * 2)
    const availableH = Math.max(1, dims.height - padPx * 2)
    const nextScale = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, Math.min(availableW / widthMm, availableH / heightMm)),
    )

    const cxMm = (minX + maxX) / 2
    const cyMm = (minY + maxY) / 2

    setPixelsPerMm(nextScale)
    setOffset({
      x: dims.width / 2 - cxMm * nextScale,
      y: dims.height / 2 + cyMm * nextScale,
    })
  }, [rectangles, dims.width, dims.height])

  const drawGrid = () => {
    const lines: React.ReactNode[] = []
    const stepPx = GRID_STEP_MM * pixelsPerMm
    for (let x = offset.x % stepPx; x < dims.width; x += stepPx) {
      lines.push(
        <Rect
          key={`gx-${x}`}
          x={x}
          y={0}
          width={1}
          height={dims.height}
          fill="rgba(148,163,184,0.15)"
          listening={false}
        />,
      )
    }
    for (let y = offset.y % stepPx; y < dims.height; y += stepPx) {
      lines.push(
        <Rect
          key={`gy-${y}`}
          x={0}
          y={y}
          width={dims.width}
          height={1}
          fill="rgba(148,163,184,0.15)"
          listening={false}
        />,
      )
    }
    return lines
  }

  const axisX = toPx(0, 0)

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.currentTarget.getStage()

    if (e.evt.button === 1) {
      e.evt.preventDefault()
      isMiddlePanning.current = true
      didPan.current = false
      const pos = stage.getPointerPosition()
      lastPanPos.current = pos ? { x: pos.x, y: pos.y } : null
      stage.container().style.cursor = 'grabbing'
      return
    }

    if (tool !== 'draw') {
      if (e.target === e.currentTarget && tool === 'select') {
        setSelectedId(null)
      }
      return
    }

    if (e.target !== e.currentTarget) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const { x_mm, y_mm } = toMm(pos.x, pos.y)
    setDraft({ startX: x_mm, startY: y_mm, endX: x_mm, endY: y_mm })
  }

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (isMiddlePanning.current) {
      const stage = e.currentTarget.getStage()
      const pos = stage.getPointerPosition()
      if (!pos || !lastPanPos.current) return
      const dx = pos.x - lastPanPos.current.x
      const dy = pos.y - lastPanPos.current.y
      if (dx !== 0 || dy !== 0) {
        didPan.current = true
        setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
        lastPanPos.current = { x: pos.x, y: pos.y }
      }
      return
    }

    if (!draft) return
    const stage = e.currentTarget.getStage()
    const pos = stage.getPointerPosition()
    if (!pos) return
    const { x_mm, y_mm } = toMm(pos.x, pos.y)
    setDraft((d) => (d ? { ...d, endX: x_mm, endY: y_mm } : d))
  }

  const handleStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.currentTarget.getStage()

    if (e.evt.button === 1) {
      isMiddlePanning.current = false
      lastPanPos.current = null
      stage.container().style.cursor = 'default'
      return
    }

    if (didPan.current) {
      didPan.current = false
      return
    }

    if (!draft) return
    const x_mm = Math.min(draft.startX, draft.endX)
    const y_mm = Math.min(draft.startY, draft.endY)
    const width_mm = Math.abs(draft.endX - draft.startX)
    const height_mm = Math.abs(draft.endY - draft.startY)
    setDraft(null)
    if (width_mm < 5 || height_mm < 5) return
    addRectangle({ x_mm, y_mm, width_mm, height_mm })
  }

  const handleStageMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
    if (!isMiddlePanning.current) return
    const stage = e.currentTarget.getStage()
    isMiddlePanning.current = false
    lastPanPos.current = null
    stage.container().style.cursor = 'default'
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <UnifiedHeader title="Section Properties Calculator" />
      <div className="flex-1 p-4 grid grid-cols-[minmax(0,1fr)_360px] gap-4 min-h-0 overflow-hidden">
        <div className="min-h-0 min-w-0" ref={containerRef}>
          <Card className="relative h-full overflow-hidden">
            <div className="absolute top-3 left-3 z-10 flex gap-2">
            <Button
              size="sm"
              variant={tool === 'select' ? 'default' : 'secondary'}
              onClick={() => setTool('select')}
            >
              Select
            </Button>
            <Button
              size="sm"
              variant={tool === 'draw' ? 'default' : 'secondary'}
              onClick={() => setTool('draw')}
            >
              Draw Rectangle
            </Button>
            <Button
              size="sm"
              variant={tool === 'erase' ? 'destructive' : 'secondary'}
              onClick={() => setTool('erase')}
            >
              Erase
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!selectedId) return
                setRectangles((prev) => prev.filter((r) => r.id !== selectedId))
                setSelectedId(null)
              }}
              disabled={!selectedId}
            >
              Delete Selected
            </Button>
            </div>

            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              <div className="rounded bg-card/90 border border-border px-2 py-1 text-[11px] text-muted-foreground">
                Zoom {Math.round((pixelsPerMm / PIXELS_PER_MM) * 100)}%
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={fitToShapes}
                disabled={rectangles.length === 0}
              >
                Fit
              </Button>
            </div>

            <Stage
              width={dims.width}
              height={dims.height}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
              onMouseLeave={handleStageMouseLeave}
              onWheel={(e) => {
                e.evt.preventDefault()
                const stage = e.currentTarget.getStage()
                const pointer = stage.getPointerPosition()
                if (!pointer) return

                const scaleBy = 1.1
                const nextScale =
                  e.evt.deltaY < 0
                    ? Math.min(pixelsPerMm * scaleBy, ZOOM_MAX)
                    : Math.max(pixelsPerMm / scaleBy, ZOOM_MIN)

                if (Math.abs(nextScale - pixelsPerMm) < 1e-9) return

                const xMm = (pointer.x - offset.x) / pixelsPerMm
                const yMm = -(pointer.y - offset.y) / pixelsPerMm

                setPixelsPerMm(nextScale)
                setOffset({
                  x: pointer.x - xMm * nextScale,
                  y: pointer.y + yMm * nextScale,
                })
              }}
            >
              <Layer>
              {drawGrid()}
              <Rect
                x={0}
                y={axisX.y}
                width={dims.width}
                height={1}
                fill="rgba(148,163,184,0.45)"
                listening={false}
              />
              <Rect
                x={axisX.x}
                y={0}
                width={1}
                height={dims.height}
                fill="rgba(148,163,184,0.45)"
                listening={false}
              />

              {rectangles.map((r) => {
                const topLeft = toPx(r.x_mm, r.y_mm + r.height_mm)
                return (
                  <Rect
                    key={r.id}
                    x={topLeft.x}
                    y={topLeft.y}
                    width={r.width_mm * pixelsPerMm}
                    height={r.height_mm * pixelsPerMm}
                    fill={selectedId === r.id ? 'rgba(14,165,233,0.45)' : 'rgba(148,163,184,0.35)'}
                    stroke={selectedId === r.id ? '#0ea5e9' : '#94a3b8'}
                    strokeWidth={selectedId === r.id ? 2 : 1}
                    draggable={tool === 'select'}
                    onClick={() => {
                      if (tool === 'erase') {
                        setRectangles((prev) => prev.filter((x) => x.id !== r.id))
                        if (selectedId === r.id) setSelectedId(null)
                        return
                      }
                      if (tool === 'select') setSelectedId(r.id)
                    }}
                    onTap={() => {
                      if (tool === 'erase') {
                        setRectangles((prev) => prev.filter((x) => x.id !== r.id))
                        if (selectedId === r.id) setSelectedId(null)
                        return
                      }
                      if (tool === 'select') setSelectedId(r.id)
                    }}
                    onDragEnd={(e) => {
                      const newX = snapMm((e.target.x() - offset.x) / pixelsPerMm)
                      const newTopY = snapMm(-(e.target.y() - offset.y) / pixelsPerMm)
                      const newY = newTopY - r.height_mm
                      setRectangles((prev) =>
                        prev.map((x) =>
                          x.id === r.id ? { ...x, x_mm: newX, y_mm: newY } : x,
                        ),
                      )
                    }}
                  />
                )
              })}

              {draft && (
                <Rect
                  x={toPx(Math.min(draft.startX, draft.endX), Math.max(draft.startY, draft.endY)).x}
                  y={toPx(Math.min(draft.startX, draft.endX), Math.max(draft.startY, draft.endY)).y}
                  width={Math.abs(draft.endX - draft.startX) * pixelsPerMm}
                  height={Math.abs(draft.endY - draft.startY) * pixelsPerMm}
                  fill="rgba(34,197,94,0.25)"
                  stroke="#22c55e"
                  dash={[6, 4]}
                  listening={false}
                />
              )}
              </Layer>
            </Stage>
          </Card>
        </div>

        <div className="w-[360px] min-w-[360px] max-w-[360px] space-y-4 overflow-y-auto">
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Library Sections</h3>
            <p className="text-[11px] text-muted-foreground">
              Add real catalog section envelopes from backend data (UB/UC/SHS/RHS),
              then build up custom geometry with additional rectangles.
            </p>

            <label className="space-y-1 block text-xs">
              <span className="text-muted-foreground">Series</span>
              <select
                className="w-full bg-secondary border border-border rounded px-2 py-1"
                value={sectionSeries}
                onChange={(e) => setSectionSeries(e.target.value as SectionSeries)}
              >
                <option value="all">All</option>
                <option value="ub">UB</option>
                <option value="uc">UC</option>
                <option value="shs">SHS</option>
                <option value="rhs">RHS</option>
              </select>
            </label>

            <label className="space-y-1 block text-xs">
              <span className="text-muted-foreground">Search</span>
              <input
                className="w-full bg-secondary border border-border rounded px-2 py-1"
                type="text"
                placeholder="Type designation..."
                value={designationQuery}
                onChange={(e) => setDesignationQuery(e.target.value)}
              />
            </label>

            <label className="space-y-1 block text-xs">
              <span className="text-muted-foreground">Designation</span>
              <select
                className="w-full bg-secondary border border-border rounded px-2 py-1"
                value={selectedDesignation}
                onChange={(e) => setSelectedDesignation(e.target.value)}
                disabled={sectionsLoading || filteredSections.length === 0}
              >
                {filteredSections.map((s) => (
                  <option key={s.designation} value={s.designation}>
                    {s.designation}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block text-xs">
              <span className="text-muted-foreground">Insert Position</span>
              <select
                className="w-full bg-secondary border border-border rounded px-2 py-1"
                value={insertMode}
                onChange={(e) => setInsertMode(e.target.value as InsertMode)}
              >
                <option value="right">Right of extents</option>
                <option value="origin">At origin</option>
                <option value="centroid">Centroid at origin</option>
              </select>
            </label>

            {sectionsLoading && (
              <p className="text-[11px] text-muted-foreground">Loading sections...</p>
            )}
            {sectionsError && (
              <p className="text-[11px] text-destructive">{sectionsError}</p>
            )}
            {!sectionsLoading && !sectionsError && filteredSections.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No sections match your search.</p>
            )}

            {selectedSection && (
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p>
                  Envelope: {selectedSection.b_mm.toFixed(1)} mm x {selectedSection.h_mm.toFixed(1)} mm
                </p>
                {(selectedSection.series.toUpperCase() === 'UB' || selectedSection.series.toUpperCase() === 'UC') && selectedSection.tw_mm != null && selectedSection.tf_mm != null && (
                  <p>
                    I-profile: tw {selectedSection.tw_mm.toFixed(1)} mm, tf {selectedSection.tf_mm.toFixed(1)} mm
                  </p>
                )}
                {(selectedSection.series.toUpperCase() === 'SHS' || selectedSection.series.toUpperCase() === 'RHS') && selectedSection.t_mm != null && (
                  <p>Hollow profile: t {selectedSection.t_mm.toFixed(1)} mm</p>
                )}
              </div>
            )}

            <Button
              size="sm"
              variant="secondary"
              onClick={addSectionGeometry}
              disabled={!selectedSection}
            >
              Insert Section Profile
            </Button>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Selected Rectangle</h3>
            {selected ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-muted-foreground">X (mm)</span>
                  <input
                    className="w-full bg-secondary border border-border rounded px-2 py-1"
                    type="number"
                    value={selected.x_mm}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setRectangles((prev) =>
                        prev.map((r) =>
                          r.id === selected.id ? { ...r, x_mm: snapMm(v) } : r,
                        ),
                      )
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Y (mm)</span>
                  <input
                    className="w-full bg-secondary border border-border rounded px-2 py-1"
                    type="number"
                    value={selected.y_mm}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setRectangles((prev) =>
                        prev.map((r) =>
                          r.id === selected.id ? { ...r, y_mm: snapMm(v) } : r,
                        ),
                      )
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Width (mm)</span>
                  <input
                    className="w-full bg-secondary border border-border rounded px-2 py-1"
                    type="number"
                    min={1}
                    value={selected.width_mm}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value))
                      setRectangles((prev) =>
                        prev.map((r) =>
                          r.id === selected.id ? { ...r, width_mm: snapMm(v) } : r,
                        ),
                      )
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Height (mm)</span>
                  <input
                    className="w-full bg-secondary border border-border rounded px-2 py-1"
                    type="number"
                    min={1}
                    value={selected.height_mm}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value))
                      setRectangles((prev) =>
                        prev.map((r) =>
                          r.id === selected.id ? { ...r, height_mm: snapMm(v) } : r,
                        ),
                      )
                    }}
                  />
                </label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No rectangle selected.</p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => addRectangle({ x_mm: 0, y_mm: 0, width_mm: 100, height_mm: 20 })}
              >
                Add Rectangle
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (!selected) return
                  duplicateRectangle(selected)
                }}
                disabled={!selected}
              >
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRectangles([])
                  setSelectedId(null)
                }}
                disabled={rectangles.length === 0}
              >
                Clear All
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Zoom: mouse wheel · Pan: middle mouse drag · Copy: Ctrl/Cmd+C then Ctrl/Cmd+V
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Section Properties</h3>
            {loading && <p className="text-xs text-muted-foreground">Calculating...</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
            {!loading && !error && !props && (
              <p className="text-xs text-muted-foreground">Draw at least one rectangle.</p>
            )}

            {props && (
              <div className="space-y-1 text-xs">
                <Row k="Rectangles" v={props.rectangle_count} />
                <Row k="Area" v={`${props.area_mm2.toFixed(2)} mm²`} />
                <Row k="Perimeter" v={`${props.perimeter_mm.toFixed(2)} mm`} />
                <Row
                  k="Centroid"
                  v={`(${props.centroid_x_mm.toFixed(2)}, ${props.centroid_y_mm.toFixed(2)}) mm`}
                />
                <Row k="Ixx" v={`${props.ixx_mm4.toExponential(4)} mm⁴`} />
                <Row k="Iyy" v={`${props.iyy_mm4.toExponential(4)} mm⁴`} />
                <Row k="Ixy" v={`${props.ixy_mm4.toExponential(4)} mm⁴`} />
                <Row k="I11" v={`${props.i11_mm4.toExponential(4)} mm⁴`} />
                <Row k="I22" v={`${props.i22_mm4.toExponential(4)} mm⁴`} />
                <Row k="Principal Angle" v={`${props.phi_deg.toFixed(3)}°`} />
                <Row k="rx" v={`${props.rx_mm.toFixed(3)} mm`} />
                <Row k="ry" v={`${props.ry_mm.toFixed(3)} mm`} />
                <Row
                  k="J"
                  v={props.j_mm4 == null ? 'Unavailable' : `${props.j_mm4.toExponential(4)} mm⁴`}
                />
                {props.warnings.length > 0 && (
                  <div className="pt-2 text-amber-500">
                    {props.warnings.map((w) => (
                      <p key={w}>- {w}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  )
}
