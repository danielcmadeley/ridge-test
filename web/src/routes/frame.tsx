import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { AppToolbar, AnalysisResultsProvider } from '@/components/AppToolbar'
import { PropertiesPanel } from '@/components/properties/PropertiesPanel'
import { StructureCanvas } from '@/components/canvas/StructureCanvas'
import { ResultsPanel } from '@/components/results/ResultsPanel'
import { useIsMobile } from '@/hooks/use-mobile'
import { StructureProvider } from '@/lib/structure-store'

export const Route = createFileRoute('/frame')({ component: FrameApp })

function FrameApp() {
  const isMobile = useIsMobile()
  const [propertiesDialogOpen, setPropertiesDialogOpen] = useState(false)
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'canvas' | 'properties' | 'results'>(
    'canvas',
  )
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [mobileCanvasControlsOpen, setMobileCanvasControlsOpen] = useState(false)

  const openMobilePanel = (panel: 'canvas' | 'properties' | 'results') => {
    if (panel === 'canvas') {
      setMobileSheetOpen(false)
      setMobilePanel('canvas')
      setMobileCanvasControlsOpen((prev) => !prev)
      return
    }
    setMobilePanel(panel)
    setMobileCanvasControlsOpen(false)
    setMobileSheetOpen(true)
  }

  return (
    <StructureProvider>
      <AnalysisResultsProvider>
        <div className="h-[100dvh] flex flex-col bg-background text-foreground">
          <AppToolbar />

          {isMobile ? (
            <>
              <div className="relative flex-1 min-h-0">
                <StructureCanvas mobileControlsOpen={mobileCanvasControlsOpen} />
              </div>

              <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant={mobileCanvasControlsOpen ? 'default' : 'secondary'}
                    onClick={() => openMobilePanel('canvas')}
                  >
                    Canvas
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      mobilePanel === 'properties' && mobileSheetOpen
                        ? 'default'
                        : 'secondary'
                    }
                    onClick={() => openMobilePanel('properties')}
                  >
                    Properties
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      mobilePanel === 'results' && mobileSheetOpen
                        ? 'default'
                        : 'secondary'
                    }
                    onClick={() => openMobilePanel('results')}
                  >
                    Results
                  </Button>
                </div>
              </div>

              <Sheet
                open={mobileSheetOpen}
                onOpenChange={(open) => {
                  setMobileSheetOpen(open)
                  if (!open) {
                    setMobilePanel('canvas')
                  }
                }}
              >
                <SheetContent
                  side="bottom"
                  className="h-[78dvh] gap-0 rounded-t-xl p-0"
                >
                  <SheetHeader className="border-b border-border pb-3">
                    <SheetTitle>
                      {mobilePanel === 'properties' ? 'Properties' : 'Results'}
                    </SheetTitle>
                    <SheetDescription>
                      {mobilePanel === 'properties'
                        ? 'Edit selected nodes, members, supports, and load cases.'
                        : 'Review reactions, combinations, and design checks.'}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1">
                    {mobilePanel === 'properties' ? (
                      <PropertiesPanel />
                    ) : (
                      <ResultsPanel />
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <>
              <div className="relative flex-1 min-h-0">
                <StructureCanvas />
                <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-2">
                  <Button
                    variant={propertiesDialogOpen ? 'default' : 'secondary'}
                    onClick={() => {
                      setResultsDialogOpen(false)
                      setPropertiesDialogOpen(true)
                    }}
                  >
                    Properties
                  </Button>
                  <Button
                    variant={resultsDialogOpen ? 'default' : 'secondary'}
                    onClick={() => {
                      setPropertiesDialogOpen(false)
                      setResultsDialogOpen(true)
                    }}
                  >
                    Results
                  </Button>
                </div>
              </div>

              <Dialog
                open={propertiesDialogOpen}
                onOpenChange={setPropertiesDialogOpen}
              >
                <DialogContent className="!w-[96vw] !max-w-[1500px] h-[92vh] max-h-[1100px] min-h-[760px] p-0 gap-0 overflow-hidden">
                  <DialogHeader className="px-5 py-4 border-b border-border">
                    <DialogTitle className="text-lg">Properties</DialogTitle>
                    <DialogDescription>
                      Edit selected nodes, members, supports, and load cases.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 flex-1">
                    <PropertiesPanel />
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={resultsDialogOpen} onOpenChange={setResultsDialogOpen}>
                <DialogContent className="!w-[96vw] !max-w-[1500px] h-[92vh] max-h-[1100px] min-h-[760px] p-0 gap-0 overflow-hidden">
                  <DialogHeader className="px-5 py-4 border-b border-border">
                    <DialogTitle className="text-lg">Results</DialogTitle>
                    <DialogDescription>
                      Review reactions, combinations, and design checks.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 flex-1">
                    <ResultsPanel />
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </AnalysisResultsProvider>
    </StructureProvider>
  )
}
