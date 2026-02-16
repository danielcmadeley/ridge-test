import type { ElementDesignOutput } from '@/lib/types'

interface DesignSummaryProps {
  elements: ElementDesignOutput[]
  allPass: boolean
  selectedElement: string | null
  onSelectElement: (name: string) => void
}

export function DesignSummary({
  elements,
  allPass,
  selectedElement,
  onSelectElement,
}: DesignSummaryProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">
          Design Summary
        </h4>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            allPass
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {allPass ? 'ALL PASS' : 'SOME FAIL'}
        </span>
      </div>

      <div className="border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-2 py-1 font-medium">Element</th>
              <th className="text-left px-2 py-1 font-medium">Section</th>
              <th className="text-right px-2 py-1 font-medium">Util.</th>
              <th className="text-center px-2 py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {elements.map((elem) => (
              <tr
                key={elem.name}
                className={`cursor-pointer border-t border-border ${
                  selectedElement === elem.name
                    ? 'bg-primary/10'
                    : 'hover:bg-muted/30'
                }`}
                onClick={() => onSelectElement(elem.name)}
              >
                <td className="px-2 py-1">
                  <span className="font-medium">{elem.name}</span>
                  <span className="text-muted-foreground ml-1">
                    ({elem.role})
                  </span>
                </td>
                <td className="px-2 py-1 text-muted-foreground truncate max-w-[100px]">
                  {elem.designation}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {(elem.max_utilisation * 100).toFixed(1)}%
                </td>
                <td className="px-2 py-1 text-center">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      elem.overall_ok ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
