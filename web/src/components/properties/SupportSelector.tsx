import { useStructure, useStructureDispatch } from '@/lib/structure-store'
import type { SupportType } from '@/lib/types'

interface SupportSelectorProps {
  nodeId: string
}

const SUPPORT_TYPES: { value: SupportType; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'roller', label: 'Roller' },
]

export function SupportSelector({ nodeId }: SupportSelectorProps) {
  const state = useStructure()
  const dispatch = useStructureDispatch()
  const support = state.supports.find((s) => s.nodeId === nodeId)

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">Support</h4>
      <div className="flex gap-1">
        {SUPPORT_TYPES.map((st) => (
          <button
            key={st.value}
            className={`flex-1 text-xs px-2 py-1 rounded border ${
              support?.type === st.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary text-secondary-foreground border-border hover:bg-accent'
            }`}
            onClick={() =>
              dispatch({
                type: 'ADD_SUPPORT',
                nodeId,
                supportType: st.value,
              })
            }
          >
            {st.label}
          </button>
        ))}
      </div>
      {support && (
        <button
          className="text-xs text-destructive hover:underline"
          onClick={() =>
            dispatch({ type: 'DELETE_SUPPORT', id: support.id })
          }
        >
          Remove support
        </button>
      )}
    </div>
  )
}
