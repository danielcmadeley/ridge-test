import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useLoadTakedown3DStore } from '@/features/load-takedown3d/store'
import { InspectorPanel } from '@/features/load-takedown3d/InspectorPanel'
import { LeftToolbar } from '@/features/load-takedown3d/LeftToolbar'
import { ResultsPanel } from '@/features/load-takedown3d/ResultsPanel'
import { TopActions } from '@/features/load-takedown3d/TopActions'
import { UnifiedHeader } from '@/components/AppToolbar'

export const Route = createFileRoute('/3d-load-takedown')({
  component: ThreeDLoadTakedownPage,
})

function ThreeDLoadTakedownPage() {
  const [mounted, setMounted] = useState(false)
  const [Viewport, setViewport] = useState<null | (() => JSX.Element)>(null)
  const [FloorPlan, setFloorPlan] = useState<null | (() => JSX.Element)>(null)
  const viewMode = useLoadTakedown3DStore((s) => s.viewMode)

  useEffect(() => {
    setMounted(true)
    import('@/features/load-takedown3d/Viewport3D').then((m) => {
      setViewport(() => m.Viewport3D)
    })
    import('@/features/load-takedown3d/FloorPlan2D').then((m) => {
      setFloorPlan(() => m.FloorPlan2D)
    })
  }, [])

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground">
      <UnifiedHeader
        title="3D Load Takedown"
        badges={['Columns-first MVP', 'Shift+Click = multi-select same type']}
        rightControls={<TopActions inline />}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <LeftToolbar />

        <div className="flex-1 min-w-0 min-h-0 bg-neutral-400">
          {viewMode === '2d' && mounted && FloorPlan ? (
            <FloorPlan />
          ) : viewMode === '3d' && mounted && Viewport ? (
            <Viewport />
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Initialising {viewMode === '2d' ? '2D floor plan' : '3D viewport'}...
            </div>
          )}
        </div>

        <div className="w-[390px] min-w-[390px] max-w-[390px] flex flex-col bg-card/30">
          <InspectorPanel />
          <div className="px-3 pb-3">
            <ResultsPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
