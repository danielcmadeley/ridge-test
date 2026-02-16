import {
  MousePointer2,
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
import { useStructure, useStructureDispatch } from '@/lib/structure-store'
import type { ToolType } from '@/lib/types'

const tools: { type: ToolType; icon: React.ReactNode; label: string }[] = [
  { type: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select' },
  { type: 'erase', icon: <Eraser className="w-4 h-4" />, label: 'Erase' },
  { type: 'node', icon: <Circle className="w-4 h-4" />, label: 'Node' },
  { type: 'beam', icon: <Minus className="w-4 h-4" />, label: 'Beam' },
  { type: 'column', icon: <Columns3 className="w-4 h-4" />, label: 'Column' },
  { type: 'truss', icon: <GitFork className="w-4 h-4" />, label: 'Truss' },
  { type: 'support', icon: <Triangle className="w-4 h-4" />, label: 'Support' },
  { type: 'load', icon: <ArrowDown className="w-4 h-4" />, label: 'Load' },
]

interface CanvasToolbarProps {
  canDeleteSelected: boolean
  onDeleteSelected: () => void
}

export function CanvasToolbar({
  canDeleteSelected,
  onDeleteSelected,
}: CanvasToolbarProps) {
  const state = useStructure()
  const dispatch = useStructureDispatch()

  return (
    <div className="absolute z-10 flex gap-1 rounded-lg border border-border bg-card/90 p-1 backdrop-blur md:top-2 md:left-2 md:flex-col max-md:bottom-2 max-md:left-1/2 max-md:w-[calc(100%-1rem)] max-md:-translate-x-1/2 max-md:flex-row max-md:overflow-x-auto">
      {tools.map((tool) => (
        <Button
          key={tool.type}
          size="sm"
          variant={state.selectedTool === tool.type ? 'default' : 'ghost'}
          className="h-9 justify-center gap-2 px-2 text-xs md:h-8 md:justify-start"
          onClick={() => dispatch({ type: 'SET_TOOL', tool: tool.type })}
          title={tool.label}
        >
          {tool.icon}
          <span className="hidden xl:inline">{tool.label}</span>
        </Button>
      ))}
      <div className="my-1 border-border md:border-t max-md:mx-1 max-md:border-l" />
      <Button
        size="sm"
        variant="ghost"
        className="h-9 justify-center gap-2 px-2 text-xs md:h-8 md:justify-start"
        title="Delete selected (Delete/Backspace)"
        onClick={onDeleteSelected}
        disabled={!canDeleteSelected}
      >
        <Trash2 className="w-4 h-4" />
        <span className="hidden xl:inline">Delete</span>
      </Button>
    </div>
  )
}
