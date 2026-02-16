import { useState } from 'react'
import { useAnalysisResults } from '@/components/AppToolbar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DesignSummary } from './DesignSummary'
import { DesignStepDetail } from './DesignStepDetail'
import { ForceDiagram } from './ForceDiagram'
import { ReportDownload } from './ReportDownload'
import type { ReactionOutput } from '@/lib/types'

export function ResultsPanel() {
  const { results } = useAnalysisResults()
  const [selectedElement, setSelectedElement] = useState<string | null>(null)
  const [selectedCombo, setSelectedCombo] = useState<string>('governing')
  const [diagramScope, setDiagramScope] = useState<'element' | 'frame'>('element')

  if (!results) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">No results yet</p>
          <p className="text-xs text-muted-foreground/60">
            Draw a structure and click "Run Analysis" to see results here
          </p>
        </div>
      </div>
    )
  }

  const hasCombinations = !!results.combination_results?.length

  // Determine which reactions/displacements to display
  let displayReactions: ReactionOutput[] = results.reactions

  if (hasCombinations && selectedCombo !== 'governing') {
    const combo = results.combination_results!.find(
      (c) => c.combination_name === selectedCombo,
    )
    if (combo) {
      displayReactions = combo.reactions
    }
  }

  const selectedElem = selectedElement
    ? results.elements.find((e) => e.name === selectedElement)
    : null

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        <h3 className="text-sm font-semibold border-b border-border pb-2">
          Results
        </h3>

        {/* Combination selector */}
        {hasCombinations && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">
              View Combination
            </h4>
            <select
              value={selectedCombo}
              onChange={(e) => setSelectedCombo(e.target.value)}
              className="w-full bg-secondary text-secondary-foreground rounded px-2 py-1 text-xs border border-border"
            >
              <option value="governing">Governing Envelope</option>
              {results.combination_results!.map((c) => (
                <option key={c.combination_name} value={c.combination_name}>
                  {c.combination_name} ({c.combination_type})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Reactions */}
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            Reactions
          </h4>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full min-w-[22rem] text-xs sm:min-w-0">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-2 py-1 font-medium">Node</th>
                  <th className="text-right px-2 py-1 font-medium">
                    Fx (kN)
                  </th>
                  <th className="text-right px-2 py-1 font-medium">
                    Fy (kN)
                  </th>
                  <th className="text-right px-2 py-1 font-medium">
                    Mz (kNm)
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayReactions.map((r) => (
                  <tr key={r.node} className="border-t border-border">
                    <td className="px-2 py-1 font-medium">{r.node}</td>
                    <td className="px-2 py-1 text-right font-mono">
                      {r.fx_kN.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {r.fy_kN.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {r.mz_kNm.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Governing combinations per element */}
        {results.governing_combinations &&
          Object.keys(results.governing_combinations).length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">
                Governing Combinations
              </h4>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full min-w-[20rem] text-xs sm:min-w-0">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-2 py-1 font-medium">
                        Element
                      </th>
                      <th className="text-left px-2 py-1 font-medium">
                        Governing
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(results.governing_combinations).map(
                      ([elem, combo]) => (
                        <tr
                          key={elem}
                          className="border-t border-border"
                        >
                          <td className="px-2 py-1 font-medium">{elem}</td>
                          <td className="px-2 py-1 text-muted-foreground">
                            {combo}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        {/* Design summary */}
        <DesignSummary
          elements={results.elements}
          allPass={results.all_pass}
          selectedElement={selectedElement}
          onSelectElement={setSelectedElement}
        />

        {/* Force diagrams for selected element or whole frame */}
        {results.elements.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 max-sm:flex-col max-sm:items-stretch">
              <h4 className="text-xs font-medium text-muted-foreground">
                {diagramScope === 'frame'
                  ? 'Force Diagrams — Whole Frame'
                  : selectedElem
                    ? `Force Diagrams — ${selectedElem.name}`
                    : 'Force Diagrams'}
              </h4>
              <select
                value={diagramScope}
                onChange={(e) =>
                  setDiagramScope(e.target.value as 'element' | 'frame')
                }
                className="rounded border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground max-sm:w-full"
              >
                <option value="element">Selected member</option>
                <option value="frame">Whole frame</option>
              </select>
            </div>

            {diagramScope === 'frame' ? (
              <ForceDiagram elementNames={results.elements.map((e) => e.name)} />
            ) : selectedElem ? (
              <ForceDiagram elementName={selectedElem.name} />
            ) : (
              <div className="text-xs text-muted-foreground p-2 border border-border rounded">
                Select an element to view its member diagrams.
              </div>
            )}
          </div>
        )}

        {/* Design step detail for selected element */}
        {selectedElem && (
          <div className="border-t border-border pt-3">
            <DesignStepDetail element={selectedElem} />
          </div>
        )}

        {/* PDF download */}
        <div className="border-t border-border pt-3">
          <ReportDownload />
        </div>
      </div>
    </ScrollArea>
  )
}
