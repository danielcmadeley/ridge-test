import { Card } from '@/components/ui/card'
import { useLoadTakedown3DStore } from './store'

export function ResultsPanel() {
  const analysis = useLoadTakedown3DStore((s) => s.analysis)
  const runError = useLoadTakedown3DStore((s) => s.runError)
  const isRunning = useLoadTakedown3DStore((s) => s.isRunning)

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Load-Down Results</h3>
        {analysis && (
          <span className="text-[11px] rounded border border-border px-2 py-0.5 text-muted-foreground">
            {analysis.columns.length} Columns
          </span>
        )}
      </div>
      {isRunning && <p className="text-xs text-muted-foreground">Running analysis...</p>}
      {runError && <p className="text-xs text-destructive">{runError}</p>}
      {!analysis && !isRunning && !runError && (
        <p className="text-xs text-muted-foreground">Run load-down to see results.</p>
      )}

      {analysis && (
        <>
          <div className="text-xs space-y-1">
            <div className="flex justify-between rounded bg-secondary/40 px-2 py-1">
              <span className="text-muted-foreground">Total Applied</span>
              <span>{(analysis.summary.totalAppliedLoad / 1e3).toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between rounded bg-secondary/40 px-2 py-1">
              <span className="text-muted-foreground">Total Vertical Reaction</span>
              <span>{(analysis.summary.totalVerticalReaction / 1e3).toFixed(2)} kN</span>
            </div>
          </div>

          <div className="max-h-48 overflow-auto border border-border rounded">
            <table className="w-full text-xs">
              <thead className="bg-secondary sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Column</th>
                  <th className="text-right px-2 py-1">N (kN)</th>
                  <th className="text-right px-2 py-1">Vx (kN)</th>
                  <th className="text-right px-2 py-1">Vy (kN)</th>
                </tr>
              </thead>
              <tbody>
                {analysis.columns.map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="px-2 py-1">{c.id}</td>
                    <td className="px-2 py-1 text-right">{(c.N_base / 1e3).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{(c.Vx_base / 1e3).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{(c.Vy_base / 1e3).toFixed(2)}</td>
                  </tr>
                ))}
                {analysis.columns.flatMap((c) => {
                  return (c.level_forces ?? [])
                    .filter((lf) => Math.abs(lf.elevation) > 1e-9)
                    .map((lf, idx) => (
                      <tr
                        key={`${c.id}-lf-${idx}`}
                        className="border-t border-border/30 text-[10px] text-muted-foreground"
                      >
                        <td className="px-2 py-1">
                          {c.id} @ {lf.elevation.toFixed(2)}m
                        </td>
                        <td className="px-2 py-1 text-right">
                          {(lf.N_down / 1e3).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right">-</td>
                        <td className="px-2 py-1 text-right">-</td>
                      </tr>
                    ))
                })}
              </tbody>
            </table>
          </div>

          {analysis.warnings.length > 0 && (
            <div className="text-[11px] text-amber-500 space-y-1">
              {analysis.warnings.map((w) => (
                <p key={w}>- {w}</p>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
