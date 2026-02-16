import { useStructure, useStructureDispatch } from '@/lib/structure-store'

export function LoadCasePanel() {
  const state = useStructure()
  const dispatch = useStructureDispatch()

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">
        Active Load Case
      </h4>
      <div className="flex gap-1">
        {state.loadCases.map((lc) => {
          const isActive = state.activeLoadCaseId === lc.id
          const loadCount =
            state.udls.filter((u) => u.loadCaseId === lc.id).length +
            state.pointLoads.filter((p) => p.loadCaseId === lc.id).length

          return (
            <button
              key={lc.id}
              onClick={() =>
                dispatch({
                  type: 'SET_ACTIVE_LOAD_CASE',
                  loadCaseId: lc.id,
                })
              }
              className="flex-1 flex flex-col items-center gap-0.5 rounded px-1.5 py-1.5 text-xs font-medium transition-all border"
              style={{
                borderColor: isActive ? lc.color : 'transparent',
                backgroundColor: isActive ? `${lc.color}15` : undefined,
                color: isActive ? lc.color : undefined,
              }}
            >
              <span className="text-[11px] font-semibold">
                {lc.category}
              </span>
              {loadCount > 0 && (
                <span
                  className="text-[9px] rounded-full px-1"
                  style={{ backgroundColor: `${lc.color}30` }}
                >
                  {loadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
