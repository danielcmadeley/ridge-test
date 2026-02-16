import { Card } from '@/components/ui/card'
import type { LoadTakedownElement } from '@/lib/types'
import { useLoadTakedown3DStore, useSelectedElement } from './store'

export function InspectorPanel() {
  const selected = useSelectedElement()
  const selectedIds = useLoadTakedown3DStore((s) => s.selectedIds)
  const updateElements = useLoadTakedown3DStore((s) => s.updateElements)
  const deleteSelected = useLoadTakedown3DStore((s) => s.deleteSelected)
  const model = useLoadTakedown3DStore((s) => s.model)
  const setGridSize = useLoadTakedown3DStore((s) => s.setGridSize)
  const snapToGrid = useLoadTakedown3DStore((s) => s.snapToGrid)
  const setSnapToGrid = useLoadTakedown3DStore((s) => s.setSnapToGrid)
  const setSlabDeadLoad = useLoadTakedown3DStore((s) => s.setSlabDeadLoad)
  const setSlabLiveLoad = useLoadTakedown3DStore((s) => s.setSlabLiveLoad)
  const setSlabThicknessForLoad = useLoadTakedown3DStore((s) => s.setSlabThicknessForLoad)
  const setConcreteDensity = useLoadTakedown3DStore((s) => s.setConcreteDensity)
  const activeStoreyId = useLoadTakedown3DStore((s) => s.activeStoreyId)
  const setActiveStoreyId = useLoadTakedown3DStore((s) => s.setActiveStoreyId)
  const addStorey = useLoadTakedown3DStore((s) => s.addStorey)
  const updateStorey = useLoadTakedown3DStore((s) => s.updateStorey)
  const deleteStorey = useLoadTakedown3DStore((s) => s.deleteStorey)
  const viewMode = useLoadTakedown3DStore((s) => s.viewMode)
  const slabSelfWeight_kN_m2 =
    model.loads.slabThickness_m * model.loads.concreteDensity_kN_m3
  const slabTotal_kN_m2 = model.loads.slabUDL / 1e3

  const applySelected = (updater: (element: LoadTakedownElement) => LoadTakedownElement) => {
    if (!selected) return
    const selectedSet = new Set(selectedIds)
    const sameTypeIds = model.elements
      .filter((e) => selectedSet.has(e.id) && e.type === selected.type)
      .map((e) => e.id)
    const ids = sameTypeIds.length > 1 ? sameTypeIds : [selected.id]
    updateElements(ids, (e) => {
      if (e.type !== selected.type) return e
      return updater(e)
    })
  }

  return (
    <div className="p-3 space-y-3 border-l border-border bg-card/50 overflow-y-auto">
      <Card className="p-3 space-y-2">
        <h3 className="text-sm font-semibold">Floor Levels</h3>
        <p className="text-[11px] text-muted-foreground">Manage level names/elevations and choose your active authoring floor.</p>
        <div className="space-y-2">
          {model.storeys
            .slice()
            .sort((a, b) => a.elevation - b.elevation)
            .map((storey) => (
              <div
                key={storey.id}
                className={`rounded border px-2 py-2 text-xs ${
                  activeStoreyId === storey.id ? 'border-primary bg-primary/10' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-left font-medium flex-1 hover:text-primary"
                    onClick={() => setActiveStoreyId(storey.id)}
                  >
                    {storey.name}
                  </button>
                  <button
                    type="button"
                    className="text-red-300 disabled:text-muted-foreground"
                    disabled={model.storeys.length <= 1}
                    onClick={() => deleteStorey(storey.id)}
                  >
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input
                    className="rounded border border-border bg-secondary px-2 py-1"
                    value={storey.name}
                    onChange={(e) => updateStorey(storey.id, { name: e.target.value })}
                  />
                  <input
                    type="number"
                    className="rounded border border-border bg-secondary px-2 py-1"
                    value={storey.elevation}
                    onChange={(e) =>
                      updateStorey(storey.id, { elevation: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            ))}
        </div>
        <button
          type="button"
          onClick={addStorey}
          className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs hover:bg-secondary/80"
        >
          Add Level
        </button>
        <p className="text-[11px] text-muted-foreground">
          Authoring in {viewMode === '2d' ? '2D' : '3D'} mode. Columns/slabs are created on
          the active level.
        </p>
      </Card>

      <Card className="p-3 space-y-2">
        <h3 className="text-sm font-semibold">Model</h3>
        <p className="text-[11px] text-muted-foreground">Global controls for grid precision and slab loading.</p>
        <Field
          label="Grid Size (m)"
          value={model.gridSize}
          onChange={(v) => setGridSize(v)}
        />
        <label className="flex items-center justify-between text-xs rounded border border-border bg-secondary px-2 py-1">
          <span className="text-muted-foreground">Snap to Grid</span>
          <input
            type="checkbox"
            checked={snapToGrid}
            onChange={(e) => setSnapToGrid(e.target.checked)}
          />
        </label>
        <Field
          label="Slab Dead Load (kN/m²)"
          value={model.loads.slabDead_kN_m2}
          onChange={(v) => setSlabDeadLoad(v as number)}
        />
        <Field
          label="Slab Live Load (kN/m²)"
          value={model.loads.slabLive_kN_m2}
          onChange={(v) => setSlabLiveLoad(v as number)}
        />
        <Field
          label="Slab Thickness for Self-weight (m)"
          value={model.loads.slabThickness_m}
          onChange={(v) => setSlabThicknessForLoad(v as number)}
        />
        <Field
          label="Concrete Density (kN/m³)"
          value={model.loads.concreteDensity_kN_m3}
          onChange={(v) => setConcreteDensity(v as number)}
        />
        <div className="rounded border border-border bg-secondary/40 px-2 py-1.5 text-xs space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Self-weight</span>
            <span>{slabSelfWeight_kN_m2.toFixed(2)} kN/m²</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total slab load to solver</span>
            <span>{slabTotal_kN_m2.toFixed(2)} kN/m²</span>
          </div>
        </div>
      </Card>

      <Card className="p-3 space-y-2">
        <h3 className="text-sm font-semibold">Inspector</h3>
        {selectedIds.length > 1 && (
          <p className="text-xs text-muted-foreground">
            {selectedIds.length} selected (same type). Editing applies to active item only.
          </p>
        )}
        {!selected && <p className="text-xs text-muted-foreground">Select an element to edit.</p>}

        {selected?.type === 'slab' && (
          <>
            <Field label="Name" value={selected.name} onChange={(v) => applySelected((s) => ({ ...s, name: String(v) }))} text />
            <Field label="Origin X" value={selected.origin.x} onChange={(v) => applySelected((s) => ({ ...s, origin: { ...s.origin, x: v as number } }))} />
            <Field label="Origin Y" value={selected.origin.y} onChange={(v) => applySelected((s) => ({ ...s, origin: { ...s.origin, y: v as number } }))} />
            <Field label="Elevation" value={selected.elevation} onChange={(v) => applySelected((s) => ({ ...s, elevation: v as number }))} />
            <Field label="Width" value={selected.width} onChange={(v) => applySelected((s) => ({ ...s, width: Math.max(0.1, v as number) }))} />
            <Field label="Depth" value={selected.depth} onChange={(v) => applySelected((s) => ({ ...s, depth: Math.max(0.1, v as number) }))} />
            <Field label="Thickness" value={selected.thickness} onChange={(v) => applySelected((s) => ({ ...s, thickness: Math.max(0.05, v as number) }))} />
          </>
        )}

        {selected?.type === 'column' && (
          <>
            <Field label="Name" value={selected.name} onChange={(v) => applySelected((s) => ({ ...s, name: String(v) }))} text />
            <Field label="Base X" value={selected.base.x} onChange={(v) => applySelected((s) => ({ ...s, base: { ...s.base, x: v as number } }))} />
            <Field label="Base Y" value={selected.base.y} onChange={(v) => applySelected((s) => ({ ...s, base: { ...s.base, y: v as number } }))} />
            <Field label="Base Z" value={selected.base.z} onChange={(v) => applySelected((s) => ({ ...s, base: { ...s.base, z: v as number } }))} />
            <Field label="Height" value={selected.height} onChange={(v) => applySelected((s) => ({ ...s, height: Math.max(0.1, v as number) }))} />
            <Field label="Size X" value={selected.sizeX} onChange={(v) => applySelected((s) => ({ ...s, sizeX: Math.max(0.1, v as number) }))} />
            <Field label="Size Y" value={selected.sizeY} onChange={(v) => applySelected((s) => ({ ...s, sizeY: Math.max(0.1, v as number) }))} />
          </>
        )}

        {selected && (
          <button
            type="button"
            onClick={deleteSelected}
            className="w-full mt-2 rounded bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-1 text-xs hover:bg-red-500/25"
          >
            Delete Element
          </button>
        )}
      </Card>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  text = false,
}: {
  label: string
  value: number | string
  onChange: (v: number | string) => void
  text?: boolean
}) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        type={text ? 'text' : 'number'}
        value={value}
        onChange={(e) => onChange(text ? e.target.value : Number(e.target.value))}
        className="w-full rounded border border-border bg-secondary px-2 py-1"
      />
    </label>
  )
}
