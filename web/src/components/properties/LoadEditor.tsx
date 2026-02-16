import { useStructure, useStructureDispatch } from '@/lib/structure-store'

interface LoadEditorProps {
  selectedId: string
}

export function LoadEditor({ selectedId }: LoadEditorProps) {
  const state = useStructure()
  const dispatch = useStructureDispatch()

  // Find all point loads on this node
  const pointLoads = state.pointLoads.filter((p) => p.nodeId === selectedId)
  // Find all UDLs on this element
  const udls = state.udls.filter((u) => u.elementId === selectedId)

  if (pointLoads.length === 0 && udls.length === 0) return null

  const getLoadCaseBadge = (loadCaseId: string) => {
    const lc = state.loadCases.find((l) => l.id === loadCaseId)
    if (!lc) return null
    return (
      <span
        className="text-[9px] font-semibold px-1 py-0.5 rounded"
        style={{
          backgroundColor: `${lc.color}25`,
          color: lc.color,
        }}
      >
        {lc.category}
      </span>
    )
  }

  return (
    <div className="space-y-3">
      {pointLoads.map((pointLoad) => (
        <div key={pointLoad.id} className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">
              Point Load
            </h4>
            {getLoadCaseBadge(pointLoad.loadCaseId)}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <div>
              <label className="text-[10px] text-muted-foreground">Fx (kN)</label>
              <input
                type="number"
                value={pointLoad.fx / 1e3}
                onChange={(e) =>
                  dispatch({
                    type: 'UPDATE_POINT_LOAD',
                    id: pointLoad.id,
                    fx: Number(e.target.value) * 1e3,
                    fy: pointLoad.fy,
                    mz: pointLoad.mz,
                  })
                }
                className="w-full bg-secondary text-secondary-foreground rounded px-1 py-1 text-xs border border-border"
                step="1"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Fy (kN)</label>
              <input
                type="number"
                value={pointLoad.fy / 1e3}
                onChange={(e) =>
                  dispatch({
                    type: 'UPDATE_POINT_LOAD',
                    id: pointLoad.id,
                    fx: pointLoad.fx,
                    fy: Number(e.target.value) * 1e3,
                    mz: pointLoad.mz,
                  })
                }
                className="w-full bg-secondary text-secondary-foreground rounded px-1 py-1 text-xs border border-border"
                step="1"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Mz (kNm)</label>
              <input
                type="number"
                value={pointLoad.mz / 1e3}
                onChange={(e) =>
                  dispatch({
                    type: 'UPDATE_POINT_LOAD',
                    id: pointLoad.id,
                    fx: pointLoad.fx,
                    fy: pointLoad.fy,
                    mz: Number(e.target.value) * 1e3,
                  })
                }
                className="w-full bg-secondary text-secondary-foreground rounded px-1 py-1 text-xs border border-border"
                step="1"
              />
            </div>
          </div>
          <button
            className="text-xs text-destructive hover:underline"
            onClick={() =>
              dispatch({ type: 'DELETE_POINT_LOAD', id: pointLoad.id })
            }
          >
            Remove load
          </button>
        </div>
      ))}

      {udls.map((udl) => (
        <div key={udl.id} className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">
              UDL
            </h4>
            {getLoadCaseBadge(udl.loadCaseId)}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="text-[10px] text-muted-foreground">
                wx (kN/m)
              </label>
              <input
                type="number"
                value={udl.wx / 1e3}
                onChange={(e) =>
                  dispatch({
                    type: 'UPDATE_UDL',
                    id: udl.id,
                    wx: Number(e.target.value) * 1e3,
                    wy: udl.wy,
                  })
                }
                className="w-full bg-secondary text-secondary-foreground rounded px-1 py-1 text-xs border border-border"
                step="1"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">
                wy (kN/m)
              </label>
              <input
                type="number"
                value={udl.wy / 1e3}
                onChange={(e) =>
                  dispatch({
                    type: 'UPDATE_UDL',
                    id: udl.id,
                    wx: udl.wx,
                    wy: Number(e.target.value) * 1e3,
                  })
                }
                className="w-full bg-secondary text-secondary-foreground rounded px-1 py-1 text-xs border border-border"
                step="1"
              />
            </div>
          </div>
          <button
            className="text-xs text-destructive hover:underline"
            onClick={() => dispatch({ type: 'DELETE_UDL', id: udl.id })}
          >
            Remove UDL
          </button>
        </div>
      ))}
    </div>
  )
}
