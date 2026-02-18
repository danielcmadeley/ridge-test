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
import { useStructure, useStructureDispatch } from '@/lib/structure-store'
import type { ToolType } from '@/lib/types'

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
}

export function CanvasToolbar({
  module = 'frame',
  canDeleteSelected,
  onDeleteSelected,
}: CanvasToolbarProps) {
  const state = useStructure()
  const dispatch = useStructureDispatch()
  const tools = module === 'truss' ? trussTools : frameTools

  return (
    <TooltipProvider>
      <div className="absolute z-10 flex gap-1 rounded-lg border border-border bg-card/90 p-1 backdrop-blur md:top-2 md:left-2 md:flex-col max-md:bottom-2 max-md:left-1/2 max-md:w-[calc(100%-1rem)] max-md:-translate-x-1/2 max-md:flex-row max-md:overflow-x-auto">
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
    </TooltipProvider>
  )
}
