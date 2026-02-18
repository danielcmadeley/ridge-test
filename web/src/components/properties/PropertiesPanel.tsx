import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStructure, useStructureDispatch } from '@/lib/structure-store'
import { ElementList } from './ElementList'
import { SectionSelector } from './SectionSelector'
import { LoadEditor } from './LoadEditor'
import { SupportSelector } from './SupportSelector'
import { LoadCasePanel } from './LoadCasePanel'
import { CombinationEditor } from './CombinationEditor'
import { ScrollArea } from '@/components/ui/scroll-area'

interface PropertiesPanelProps {
  module?: 'frame' | 'truss'
}

export function PropertiesPanel({ module = 'frame' }: PropertiesPanelProps) {
  const state = useStructure()
  const dispatch = useStructureDispatch()

  const selectedNode = state.nodes.find((n) => n.id === state.selectedId)
  const selectedElement = state.elements.find(
    (e) => e.id === state.selectedId,
  )
  const hasSelection = Boolean(selectedNode || selectedElement)

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        <div className="rounded-lg border border-border bg-card/80 px-3 py-2.5">
          <h3 className="text-sm font-semibold">Properties</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {hasSelection
              ? 'Editing selected item'
              : 'Select a node or element in the canvas'}
          </p>
        </div>

        {selectedNode && (
          <div className="rounded-lg border border-border bg-card px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium text-muted-foreground">Node</div>
                <h4 className="text-sm font-semibold">{selectedNode.name}</h4>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive"
                onClick={() =>
                  dispatch({ type: 'DELETE_NODE', id: selectedNode.id })
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            <LoadCasePanel />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground">X (m)</div>
                <input
                  type="number"
                  value={selectedNode.x}
                  onChange={(e) =>
                    dispatch({
                      type: 'MOVE_NODE',
                      id: selectedNode.id,
                      x: Number(e.target.value),
                      y: selectedNode.y,
                    })
                  }
                  className="mt-1 w-full bg-secondary text-secondary-foreground rounded px-2 py-1 text-xs border border-border"
                  step="1"
                />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Y (m)</div>
                <input
                  type="number"
                  value={selectedNode.y}
                  onChange={(e) =>
                    dispatch({
                      type: 'MOVE_NODE',
                      id: selectedNode.id,
                      x: selectedNode.x,
                      y: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full bg-secondary text-secondary-foreground rounded px-2 py-1 text-xs border border-border"
                  step="1"
                />
              </div>
            </div>

            <div className="border-t border-border pt-2">
              <SupportSelector nodeId={selectedNode.id} />
            </div>

            <div className="border-t border-border pt-2">
              <LoadEditor selectedId={selectedNode.id} />
            </div>
          </div>
        )}

        {selectedElement && (
          <div className="rounded-lg border border-border bg-card px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium text-muted-foreground">Element</div>
                <h4 className="text-sm font-semibold">
                  {selectedElement.role === 'truss_member'
                    ? 'Truss'
                    : selectedElement.role.charAt(0).toUpperCase() +
                      selectedElement.role.slice(1)}
                  : {selectedElement.name}
                </h4>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive"
                onClick={() =>
                  dispatch({
                    type: 'DELETE_ELEMENT',
                    id: selectedElement.id,
                  })
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            <LoadCasePanel />

            <SectionSelector
              value={selectedElement.designation}
              onChange={(designation) =>
                dispatch({
                  type: 'UPDATE_ELEMENT',
                  id: selectedElement.id,
                  changes: { designation },
                })
              }
              elementRole={selectedElement.role}
            />

            {module !== 'truss' && selectedElement.role !== 'truss_member' && (
              <div className="rounded-md border border-border bg-secondary/60 p-2 grid grid-cols-1 gap-2">
                <label className="block text-xs">
                  <div className="mb-1 text-muted-foreground">Start end release</div>
                  <select
                    value={selectedElement.releaseStart ? 'pinned' : 'fixed'}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_ELEMENT',
                        id: selectedElement.id,
                        changes: { releaseStart: e.target.value === 'pinned' },
                      })
                    }
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="pinned">Pinned</option>
                  </select>
                </label>
                <label className="block text-xs">
                  <div className="mb-1 text-muted-foreground">End end release</div>
                  <select
                    value={selectedElement.releaseEnd ? 'pinned' : 'fixed'}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_ELEMENT',
                        id: selectedElement.id,
                        changes: { releaseEnd: e.target.value === 'pinned' },
                      })
                    }
                    className="w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="pinned">Pinned</option>
                  </select>
                </label>
              </div>
            )}

            <div className="border-t border-border pt-2">
              <LoadEditor selectedId={selectedElement.id} />
            </div>
          </div>
        )}

        {!hasSelection && (
          <div className="rounded-lg border border-border bg-card px-3 py-3 space-y-3">
            <div className="text-xs text-muted-foreground">
              Select an element or node to edit only its properties.
            </div>

            <div className="border-t border-border pt-3">
              <ElementList />
            </div>

            {module !== 'truss' && (
              <div className="border-t border-border pt-3">
                <CombinationEditor />
              </div>
            )}
          </div>
        )}

        {hasSelection && (
          <div className="rounded-md border border-border bg-card/70 px-2.5 py-2 text-[11px] text-muted-foreground">
            Tip: click blank canvas with Select tool to clear selection.
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
