import { Box, Move, MousePointer2, Square, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useLoadTakedown3DStore } from './store'

export function LeftToolbar() {
  const tool = useLoadTakedown3DStore((s) => s.activeTool)
  const setTool = useLoadTakedown3DStore((s) => s.setTool)
  const deleteSelected = useLoadTakedown3DStore((s) => s.deleteSelected)
  const selectedIds = useLoadTakedown3DStore((s) => s.selectedIds)

  return (
    <div className="w-44 border-r border-border bg-card/60 p-3 flex flex-col gap-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tools</p>
        <div className="mt-2 grid gap-1.5">
          <ToolBtn active={tool === 'select'} onClick={() => setTool('select')} title="Select">
            <MousePointer2 className="w-4 h-4" />
            <span>Select</span>
          </ToolBtn>
          <ToolBtn active={tool === 'move'} onClick={() => setTool('move')} title="Move">
            <Move className="w-4 h-4" />
            <span>Pan / Move</span>
          </ToolBtn>
          <ToolBtn active={tool === 'slab'} onClick={() => setTool('slab')} title="Add Slab">
            <Square className="w-4 h-4" />
            <span>Draw Slab</span>
          </ToolBtn>
          <ToolBtn active={tool === 'column'} onClick={() => setTool('column')} title="Add Column">
            <Box className="w-4 h-4" />
            <span>Place Column</span>
          </ToolBtn>
          <ToolBtn active={false} disabled title="Walls (phase 2)">
            <div className="w-4 h-4 border border-current" />
            <span>Walls (Soon)</span>
          </ToolBtn>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actions</p>
        <div className="mt-2 grid gap-1.5">
          <ToolBtn
            active={false}
            onClick={deleteSelected}
            disabled={selectedIds.length === 0}
            title="Delete selected"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Selected</span>
          </ToolBtn>
        </div>
      </div>

      <div className="mt-auto rounded border border-border/60 bg-secondary/40 px-2 py-2 text-[11px] text-muted-foreground leading-4">
        Tip: In 2D mode, draw slabs by click-drag. Columns place at snapped points.
      </div>
    </div>
  )
}

function ToolBtn({
  active,
  children,
  onClick,
  title,
  disabled,
}: {
  active: boolean
  children: ReactNode
  onClick?: () => void
  title: string
  disabled?: boolean
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'ghost'}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="h-8 w-full justify-start gap-2 px-2"
    >
      {children}
    </Button>
  )
}
