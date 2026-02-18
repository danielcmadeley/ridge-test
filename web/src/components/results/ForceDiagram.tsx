import { useEffect, useState } from 'react'
import { fetchDiagrams } from '@/lib/api'
import { toStructureInput, useStructure } from '@/lib/structure-store'
import type { DiagramOutput } from '@/lib/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Lazy-load Plotly to avoid SSR issues
let Plot: React.ComponentType<any> | null = null

interface ForceDiagramProps {
  elementName?: string
  elementNames?: string[]
  mode?: 'all' | 'axial-deflection'
}

const AXIAL_COLOR_THRESHOLD_KN = 0.5

function axialSignColor(values: number[]) {
  if (values.length === 0) return '#a855f7'
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length
  if (avg > AXIAL_COLOR_THRESHOLD_KN) return '#dc2626'
  if (avg < -AXIAL_COLOR_THRESHOLD_KN) return '#2563eb'
  return '#6b7280'
}

export function ForceDiagram({
  elementName,
  elementNames,
  mode = 'all',
}: ForceDiagramProps) {
  const state = useStructure()
  const [plotLoaded, setPlotLoaded] = useState(!!Plot)
  const [diagrams, setDiagrams] = useState<DiagramOutput[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!Plot) {
      import('react-plotly.js').then((mod) => {
        Plot = mod.default
        setPlotLoaded(true)
      })
    }
  }, [])

  useEffect(() => {
    const targets =
      elementNames && elementNames.length > 0
        ? elementNames
        : elementName
          ? [elementName]
          : []

    if (targets.length === 0) {
      setDiagrams([])
      setError(null)
      setIsLoading(false)
      return
    }

    let mounted = true
    setIsLoading(true)
    setError(null)

    Promise.all(
      targets.map((name) =>
        fetchDiagrams({
          structure: toStructureInput(state),
          element_name: name,
        }),
      ),
    )
      .then((data) => {
        if (!mounted) return
        setDiagrams(data)
      })
      .catch((err: Error) => {
        if (!mounted) return
        setDiagrams([])
        setError(err.message)
      })
      .finally(() => {
        if (!mounted) return
        setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [state, elementName, elementNames])

  if (isLoading || !plotLoaded) {
    return (
      <div className="text-xs text-muted-foreground p-2">
        Loading diagrams...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-xs text-destructive p-2">
        Error: {error.slice(0, 100)}
      </div>
    )
  }

  if (diagrams.length === 0 || !Plot) return null

  const isCombinedFrameView = diagrams.length > 1

  const buildTraces = (
    key: 'shear' | 'moment' | 'deflection' | 'axial',
    color: string,
    fillColor: string,
  ) => {
    return diagrams.map((data) => ({
      x: data.x,
      y: data[key],
      name: data.element_name,
      type: 'scatter',
      mode: 'lines',
      fill: isCombinedFrameView ? undefined : 'tozeroy',
      fillcolor:
        isCombinedFrameView
          ? undefined
          : key === 'axial'
            ? `${axialSignColor(data.axial)}33`
            : fillColor,
      line: {
        color: key === 'axial' ? axialSignColor(data.axial) : color,
        width: isCombinedFrameView ? 1.5 : 2,
      },
    }))
  }

  const layout = {
    margin: { t: 10, r: 10, b: 40, l: 50 },
    height: isCombinedFrameView ? 240 : 200,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#94a3b8', size: 10 },
    showlegend: isCombinedFrameView,
    legend: {
      orientation: 'h',
      y: -0.25,
      yanchor: 'top',
      x: 0,
      xanchor: 'left',
    },
    xaxis: {
      title: 'Position (m)',
      gridcolor: 'rgba(255,255,255,0.08)',
      zerolinecolor: 'rgba(255,255,255,0.15)',
    },
    yaxis: {
      gridcolor: 'rgba(255,255,255,0.08)',
      zerolinecolor: 'rgba(255,255,255,0.15)',
    },
  }

  const config = { displayModeBar: false, responsive: true }

  const defaultTab = mode === 'axial-deflection' ? 'axial' : 'shear'

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="w-full justify-start h-7">
        {mode === 'all' && (
          <TabsTrigger value="shear" className="text-xs h-6">
            Shear
          </TabsTrigger>
        )}
        {mode === 'all' && (
          <TabsTrigger value="moment" className="text-xs h-6">
            Moment
          </TabsTrigger>
        )}
        <TabsTrigger value="deflection" className="text-xs h-6">
          Deflection
        </TabsTrigger>
        <TabsTrigger value="axial" className="text-xs h-6">
          Axial
        </TabsTrigger>
      </TabsList>

      {mode === 'all' && (
        <TabsContent value="shear">
          <Plot
            data={buildTraces('shear', '#3b82f6', 'rgba(59,130,246,0.15)')}
            layout={{ ...layout, yaxis: { ...layout.yaxis, title: 'V (kN)' } }}
            config={config}
            useResizeHandler
            className="w-full"
          />
        </TabsContent>
      )}

      {mode === 'all' && (
        <TabsContent value="moment">
          <Plot
            data={buildTraces('moment', '#ef4444', 'rgba(239,68,68,0.15)')}
            layout={{ ...layout, yaxis: { ...layout.yaxis, title: 'M (kNm)' } }}
            config={config}
            useResizeHandler
            className="w-full"
          />
        </TabsContent>
      )}

      <TabsContent value="deflection">
        <Plot
          data={buildTraces('deflection', '#22c55e', 'rgba(34,197,94,0.15)')}
          layout={{
            ...layout,
            yaxis: { ...layout.yaxis, title: '\u03b4 (mm)' },
          }}
          config={config}
          useResizeHandler
          className="w-full"
        />
      </TabsContent>

      <TabsContent value="axial">
        <Plot
          data={buildTraces('axial', '#a855f7', 'rgba(168,85,247,0.15)')}
          layout={{
            ...layout,
            yaxis: { ...layout.yaxis, title: 'N (kN)' },
          }}
          config={config}
          useResizeHandler
          className="w-full"
        />
      </TabsContent>
    </Tabs>
  )
}
