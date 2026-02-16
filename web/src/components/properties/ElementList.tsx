import { useStructure, useStructureDispatch } from '@/lib/structure-store'

const ROLE_BADGES: Record<string, string> = {
  beam: 'bg-teal-500/20 text-teal-400',
  column: 'bg-green-500/20 text-green-400',
  truss_member: 'bg-orange-500/20 text-orange-400',
}

export function ElementList() {
  const state = useStructure()
  const dispatch = useStructureDispatch()

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">
        Elements ({state.elements.length})
      </h4>
      {state.elements.length === 0 && (
        <p className="text-xs text-muted-foreground/60 italic">
          No elements yet
        </p>
      )}
      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {state.elements.map((elem) => (
          <button
            key={elem.id}
            className={`w-full flex items-center gap-2 text-left text-xs px-2 py-1 rounded ${
              state.selectedId === elem.id
                ? 'bg-primary/20 text-primary'
                : 'hover:bg-accent text-foreground'
            }`}
            onClick={() => dispatch({ type: 'SELECT', id: elem.id })}
          >
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_BADGES[elem.role]}`}
            >
              {elem.role === 'truss_member' ? 'TR' : elem.role.slice(0, 2).toUpperCase()}
            </span>
            <span className="font-medium">{elem.name}</span>
            <span className="text-muted-foreground truncate flex-1 text-right">
              {elem.designation}
            </span>
          </button>
        ))}
      </div>

      <h4 className="text-xs font-medium text-muted-foreground mt-3">
        Nodes ({state.nodes.length})
      </h4>
      <div className="space-y-0.5 max-h-32 overflow-y-auto">
        {state.nodes.map((node) => (
          <button
            key={node.id}
            className={`w-full flex items-center gap-2 text-left text-xs px-2 py-1 rounded ${
              state.selectedId === node.id
                ? 'bg-primary/20 text-primary'
                : 'hover:bg-accent text-foreground'
            }`}
            onClick={() => dispatch({ type: 'SELECT', id: node.id })}
          >
            <span className="font-medium">{node.name}</span>
            <span className="text-muted-foreground text-right flex-1">
              ({node.x}, {node.y})
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
