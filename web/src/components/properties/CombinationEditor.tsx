import { useStructure, useStructureDispatch } from '@/lib/structure-store'

export function CombinationEditor() {
  const state = useStructure()
  const dispatch = useStructureDispatch()

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">
        Load Combinations (BS EN 1990)
      </h4>
      <div className="border border-border rounded overflow-hidden">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-1.5 py-1 font-medium">Combination</th>
              {state.loadCases.map((lc) => (
                <th
                  key={lc.id}
                  className="text-center px-1 py-1 font-medium"
                  style={{ color: lc.color }}
                >
                  {lc.category}
                </th>
              ))}
              <th className="text-center px-1 py-1 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {state.combinations.map((combo) => (
              <tr key={combo.id} className="border-t border-border">
                <td className="px-1.5 py-0.5 font-medium truncate max-w-[100px]">
                  {combo.name}
                </td>
                {state.loadCases.map((lc) => (
                  <td key={lc.id} className="px-0.5 py-0.5 text-center">
                    <input
                      type="number"
                      step="0.05"
                      value={combo.factors[lc.id] ?? 0}
                      onChange={(e) => {
                        const newFactors = {
                          ...combo.factors,
                          [lc.id]: Number(e.target.value),
                        }
                        dispatch({
                          type: 'UPDATE_COMBINATION',
                          id: combo.id,
                          factors: newFactors,
                        })
                      }}
                      className="w-12 bg-secondary text-secondary-foreground text-center rounded px-0.5 py-0.5 text-[10px] border border-border"
                    />
                  </td>
                ))}
                <td className="px-1 py-0.5 text-center">
                  <span
                    className={`text-[9px] font-medium px-1 py-0.5 rounded ${
                      combo.combinationType === 'ULS'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}
                  >
                    {combo.combinationType}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
