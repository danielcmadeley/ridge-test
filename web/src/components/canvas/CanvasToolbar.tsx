import {
  MousePointer2,
  Hand,
  Eraser,
  Circle,
  Minus,
  Columns3,
  Triangle,
  ArrowDown,
  GitFork,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SectionSelector } from '@/components/properties/SectionSelector'
import { useStructure, useStructureDispatch } from '@/lib/structure-store'
import type { SupportType, ToolType } from '@/lib/types'

const frameTools: { type: ToolType; icon: React.ReactNode; label: string }[] = [
  { type: 'drag', icon: <Hand className="w-4 h-4" />, label: 'Pan canvas' },
  { type: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select / box select' },
  { type: 'erase', icon: <Eraser className="w-4 h-4" />, label: 'Erase' },
  { type: 'node', icon: <Circle className="w-4 h-4" />, label: 'Node' },
  { type: 'beam', icon: <Minus className="w-4 h-4" />, label: 'Beam' },
  { type: 'column', icon: <Columns3 className="w-4 h-4" />, label: 'Column' },
  { type: 'truss', icon: <GitFork className="w-4 h-4" />, label: 'Truss' },
  { type: 'support', icon: <Triangle className="w-4 h-4" />, label: 'Support' },
  { type: 'load', icon: <ArrowDown className="w-4 h-4" />, label: 'Load' },
]

const trussTools: { type: ToolType; icon: React.ReactNode; label: string }[] = [
  { type: 'drag', icon: <Hand className="w-4 h-4" />, label: 'Pan canvas' },
  { type: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select / box select' },
  { type: 'erase', icon: <Eraser className="w-4 h-4" />, label: 'Erase' },
  { type: 'node', icon: <Circle className="w-4 h-4" />, label: 'Node' },
  { type: 'truss', icon: <GitFork className="w-4 h-4" />, label: 'Truss member' },
  { type: 'support', icon: <Triangle className="w-4 h-4" />, label: 'Support' },
  { type: 'load', icon: <ArrowDown className="w-4 h-4" />, label: 'Load' },
]

interface CanvasToolbarProps {
  module?: 'frame' | 'truss'
  canDeleteSelected: boolean
  onDeleteSelected: () => void
  beamDraftDesignation: string
  beamDraftYoungsModulus: number
  beamDraftReleaseStart: boolean
  beamDraftReleaseEnd: boolean
  columnDraftDesignation: string
  columnDraftYoungsModulus: number
  columnDraftReleaseStart: boolean
  columnDraftReleaseEnd: boolean
  supportDraftType: SupportType
  onBeamDraftDesignationChange: (designation: string) => void
  onBeamDraftYoungsModulusChange: (value: number) => void
  onBeamDraftReleaseStartChange: (value: boolean) => void
  onBeamDraftReleaseEndChange: (value: boolean) => void
  onColumnDraftDesignationChange: (designation: string) => void
  onColumnDraftYoungsModulusChange: (value: number) => void
  onColumnDraftReleaseStartChange: (value: boolean) => void
  onColumnDraftReleaseEndChange: (value: boolean) => void
  onSupportDraftTypeChange: (value: SupportType) => void
}

const DEFAULT_YOUNGS_MODULUS_N_PER_MM2 = 210000

export function CanvasToolbar({
  module = 'frame',
  canDeleteSelected,
  onDeleteSelected,
  beamDraftDesignation,
  beamDraftYoungsModulus,
  beamDraftReleaseStart,
  beamDraftReleaseEnd,
  columnDraftDesignation,
  columnDraftYoungsModulus,
  columnDraftReleaseStart,
  columnDraftReleaseEnd,
  supportDraftType,
  onBeamDraftDesignationChange,
  onBeamDraftYoungsModulusChange,
  onBeamDraftReleaseStartChange,
  onBeamDraftReleaseEndChange,
  onColumnDraftDesignationChange,
  onColumnDraftYoungsModulusChange,
  onColumnDraftReleaseStartChange,
  onColumnDraftReleaseEndChange,
  onSupportDraftTypeChange,
}: CanvasToolbarProps) {
  const state = useStructure()
  const dispatch = useStructureDispatch()
  const tools = module === 'truss' ? trussTools : frameTools
  const beamElements = state.elements.filter((elem) => elem.role === 'beam')
  const selectedBeam = beamElements.find((elem) => elem.id === state.selectedId) ?? null
  const showBeamPanel = module === 'frame' && (state.selectedTool === 'beam' || !!selectedBeam)
  const selectedBeamE = selectedBeam?.youngsModulus ?? beamDraftYoungsModulus
  const selectedBeamDesignation = selectedBeam?.designation ?? beamDraftDesignation
  const selectedBeamReleaseStart = selectedBeam?.releaseStart ?? beamDraftReleaseStart
  const selectedBeamReleaseEnd = selectedBeam?.releaseEnd ?? beamDraftReleaseEnd
  const columnElements = state.elements.filter((elem) => elem.role === 'column')
  const selectedColumn =
    columnElements.find((elem) => elem.id === state.selectedId) ?? null
  const showColumnPanel =
    module === 'frame' && (state.selectedTool === 'column' || !!selectedColumn)
  const selectedColumnE =
    selectedColumn?.youngsModulus ?? columnDraftYoungsModulus
  const selectedColumnDesignation =
    selectedColumn?.designation ?? columnDraftDesignation
  const selectedColumnReleaseStart =
    selectedColumn?.releaseStart ?? columnDraftReleaseStart
  const selectedColumnReleaseEnd =
    selectedColumn?.releaseEnd ?? columnDraftReleaseEnd
  const selectedSupport =
    state.supports.find((sup) => sup.nodeId === state.selectedId) ?? null
  const showSupportPanel = state.selectedTool === 'support' || !!selectedSupport
  const selectedSupportType = selectedSupport?.type ?? supportDraftType

  return (
    <TooltipProvider>
      <div className="absolute z-10 md:top-2 md:left-2 max-md:bottom-2 max-md:left-1/2 max-md:w-[calc(100%-1rem)] max-md:-translate-x-1/2">
        <div className="flex items-start gap-2">
          <div className="flex gap-1 rounded-lg border border-border bg-card/90 p-1 backdrop-blur md:flex-col max-md:w-full max-md:flex-row max-md:overflow-x-auto">
            {tools.map((tool) => (
              <Tooltip key={tool.type}>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={state.selectedTool === tool.type ? 'default' : 'ghost'}
                    className="h-9 w-9 p-0 md:h-8 md:w-8"
                    onClick={() => dispatch({ type: 'SET_TOOL', tool: tool.type })}
                    aria-label={tool.label}
                  >
                    {tool.icon}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={6}>
                  {tool.label}
                </TooltipContent>
              </Tooltip>
            ))}
            <div className="my-1 border-border md:border-t max-md:mx-1 max-md:border-l" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 md:h-8 md:w-8"
                  onClick={onDeleteSelected}
                  disabled={!canDeleteSelected}
                  aria-label="Delete selected"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={6}>
                Delete selected (Delete/Backspace)
              </TooltipContent>
            </Tooltip>
          </div>

          {showBeamPanel && (
            <div className="hidden min-w-64 rounded-lg border border-border bg-card/95 p-2 text-xs backdrop-blur md:block">
              <div className="mb-2 border-b border-border pb-1.5 text-[11px] font-medium text-muted-foreground">
                Beam Settings
              </div>
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="text-muted-foreground">Element selector</span>
                  <select
                    value={selectedBeam?.id ?? '__new__'}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        dispatch({ type: 'SELECT', id: null })
                        dispatch({ type: 'SET_TOOL', tool: 'beam' })
                        return
                      }
                      dispatch({ type: 'SELECT', id: e.target.value })
                    }}
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="__new__">New beam defaults</option>
                    {beamElements.map((elem) => (
                      <option key={elem.id} value={elem.id}>
                        {elem.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Steel grade</span>
                  <select
                    value={state.steelGrade}
                    onChange={(e) =>
                      dispatch({ type: 'SET_STEEL_GRADE', grade: e.target.value })
                    }
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="S235">S235</option>
                    <option value="S275">S275</option>
                    <option value="S355">S355</option>
                    <option value="S460">S460</option>
                  </select>
                </label>

                <SectionSelector
                  value={selectedBeamDesignation}
                  onChange={(designation) => {
                    if (selectedBeam) {
                      dispatch({
                        type: 'UPDATE_ELEMENT',
                        id: selectedBeam.id,
                        changes: { designation },
                      })
                      return
                    }
                    onBeamDraftDesignationChange(designation)
                  }}
                  elementRole="beam"
                />

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Young's Modulus (E)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      step={1000}
                      value={selectedBeamE}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        if (!Number.isFinite(next) || next <= 0) return
                        if (!selectedBeam) {
                          onBeamDraftYoungsModulusChange(next)
                          return
                        }
                        dispatch({
                          type: 'UPDATE_ELEMENT',
                          id: selectedBeam.id,
                          changes: { youngsModulus: next },
                        })
                      }}
                      className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                    />
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      N/mm2
                    </span>
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Start end release</span>
                  <select
                    value={selectedBeamReleaseStart ? 'pinned' : 'fixed'}
                    onChange={(e) => {
                      const isPinned = e.target.value === 'pinned'
                      if (!selectedBeam) {
                        onBeamDraftReleaseStartChange(isPinned)
                        return
                      }
                      dispatch({
                        type: 'UPDATE_ELEMENT',
                        id: selectedBeam.id,
                        changes: { releaseStart: isPinned },
                      })
                    }}
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="pinned">Pinned</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">End end release</span>
                  <select
                    value={selectedBeamReleaseEnd ? 'pinned' : 'fixed'}
                    onChange={(e) => {
                      const isPinned = e.target.value === 'pinned'
                      if (!selectedBeam) {
                        onBeamDraftReleaseEndChange(isPinned)
                        return
                      }
                      dispatch({
                        type: 'UPDATE_ELEMENT',
                        id: selectedBeam.id,
                        changes: { releaseEnd: isPinned },
                      })
                    }}
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="pinned">Pinned</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {showColumnPanel && (
            <div className="hidden min-w-64 rounded-lg border border-border bg-card/95 p-2 text-xs backdrop-blur md:block">
              <div className="mb-2 border-b border-border pb-1.5 text-[11px] font-medium text-muted-foreground">
                Column Settings
              </div>
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="text-muted-foreground">Element selector</span>
                  <select
                    value={selectedColumn?.id ?? '__new__'}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        dispatch({ type: 'SELECT', id: null })
                        dispatch({ type: 'SET_TOOL', tool: 'column' })
                        return
                      }
                      dispatch({ type: 'SELECT', id: e.target.value })
                    }}
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="__new__">New column defaults</option>
                    {columnElements.map((elem) => (
                      <option key={elem.id} value={elem.id}>
                        {elem.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Steel grade</span>
                  <select
                    value={state.steelGrade}
                    onChange={(e) =>
                      dispatch({ type: 'SET_STEEL_GRADE', grade: e.target.value })
                    }
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="S235">S235</option>
                    <option value="S275">S275</option>
                    <option value="S355">S355</option>
                    <option value="S460">S460</option>
                  </select>
                </label>

                <SectionSelector
                  value={selectedColumnDesignation}
                  onChange={(designation) => {
                    if (selectedColumn) {
                      dispatch({
                        type: 'UPDATE_ELEMENT',
                        id: selectedColumn.id,
                        changes: { designation },
                      })
                      return
                    }
                    onColumnDraftDesignationChange(designation)
                  }}
                  elementRole="column"
                />

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Young's Modulus (E)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      step={1000}
                      value={selectedColumnE}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        if (!Number.isFinite(next) || next <= 0) return
                        if (!selectedColumn) {
                          onColumnDraftYoungsModulusChange(next)
                          return
                        }
                        dispatch({
                          type: 'UPDATE_ELEMENT',
                          id: selectedColumn.id,
                          changes: { youngsModulus: next },
                        })
                      }}
                      className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                    />
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      N/mm2
                    </span>
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Start end release</span>
                  <select
                    value={selectedColumnReleaseStart ? 'pinned' : 'fixed'}
                    onChange={(e) => {
                      const isPinned = e.target.value === 'pinned'
                      if (!selectedColumn) {
                        onColumnDraftReleaseStartChange(isPinned)
                        return
                      }
                      dispatch({
                        type: 'UPDATE_ELEMENT',
                        id: selectedColumn.id,
                        changes: { releaseStart: isPinned },
                      })
                    }}
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="pinned">Pinned</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">End end release</span>
                  <select
                    value={selectedColumnReleaseEnd ? 'pinned' : 'fixed'}
                    onChange={(e) => {
                      const isPinned = e.target.value === 'pinned'
                      if (!selectedColumn) {
                        onColumnDraftReleaseEndChange(isPinned)
                        return
                      }
                      dispatch({
                        type: 'UPDATE_ELEMENT',
                        id: selectedColumn.id,
                        changes: { releaseEnd: isPinned },
                      })
                    }}
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="pinned">Pinned</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {showSupportPanel && (
            <div className="hidden min-w-64 rounded-lg border border-border bg-card/95 p-2 text-xs backdrop-blur md:block">
              <div className="mb-2 border-b border-border pb-1.5 text-[11px] font-medium text-muted-foreground">
                Support Settings
              </div>
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="text-muted-foreground">Support selector</span>
                  <select
                    value={selectedSupport?.id ?? '__new__'}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        dispatch({ type: 'SELECT', id: null })
                        dispatch({ type: 'SET_TOOL', tool: 'support' })
                        return
                      }
                      const support = state.supports.find((s) => s.id === e.target.value)
                      if (support) dispatch({ type: 'SELECT', id: support.nodeId })
                    }}
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="__new__">New support defaults</option>
                    {state.supports.map((sup) => {
                      const nodeName =
                        state.nodes.find((n) => n.id === sup.nodeId)?.name ?? sup.nodeId
                      return (
                        <option key={sup.id} value={sup.id}>
                          {nodeName}
                        </option>
                      )
                    })}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Support type</span>
                  <select
                    value={selectedSupportType}
                    onChange={(e) => {
                      const next = e.target.value as SupportType
                      if (selectedSupport) {
                        dispatch({ type: 'UPDATE_SUPPORT', id: selectedSupport.id, supportType: next })
                        return
                      }
                      onSupportDraftTypeChange(next)
                    }}
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="pinned">Pinned</option>
                    <option value="fixed">Fixed</option>
                    <option value="roller">Roller</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
