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
import {
  AnalysisResultsProvider,
  ModuleToolbar,
} from '@/components/AppToolbar'
import { StructureCanvas } from '@/components/canvas/StructureCanvas'
import { PropertiesPanel } from '@/components/properties/PropertiesPanel'
import { ResultsPanel } from '@/components/results/ResultsPanel'
import { useIsMobile } from '@/hooks/use-mobile'
import { StructureProvider } from '@/lib/structure-store'

export const Route = createFileRoute('/truss')({ component: TrussApp })

function TrussApp() {
  const isMobile = useIsMobile()
  const [propertiesDialogOpen, setPropertiesDialogOpen] = useState(false)
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'canvas' | 'properties' | 'results'>(
    'canvas',
  )
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  const openMobilePanel = (panel: 'canvas' | 'properties' | 'results') => {
    if (panel === 'canvas') {
      setMobileSheetOpen(false)
      setMobilePanel('canvas')
      return
    }
    setMobilePanel(panel)
    setMobileSheetOpen(true)
  }

  return (
    <StructureProvider>
      <AnalysisResultsProvider>
        <div className="h-[100dvh] flex flex-col bg-background text-foreground">
          <ModuleToolbar module="truss" />

          {isMobile ? (
            <>
              <div className="relative flex-1 min-h-0 pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
                <StructureCanvas module="truss" />
              </div>

              <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant={!mobileSheetOpen ? 'default' : 'secondary'}
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
                      {mobilePanel === 'properties' ? 'Truss Properties' : 'Truss Results'}
                    </SheetTitle>
                    <SheetDescription>
                      {mobilePanel === 'properties'
                        ? 'Edit nodes, truss members, supports, and loads.'
                        : 'Review reactions plus axial and deflection behavior.'}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1">
                    {mobilePanel === 'properties' ? (
                      <PropertiesPanel module="truss" />
                    ) : (
                      <ResultsPanel module="truss" />
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <>
              <div className="relative flex-1 min-h-0">
                <StructureCanvas module="truss" />
                <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-2">
                  <Button
                    variant={propertiesDialogOpen ? 'default' : 'secondary'}
                    onClick={() => {
                      setResultsDialogOpen(false)
                      setPropertiesDialogOpen(true)
                    }}
                  >
                    Truss Properties
                  </Button>
                  <Button
                    variant={resultsDialogOpen ? 'default' : 'secondary'}
                    onClick={() => {
                      setPropertiesDialogOpen(false)
                      setResultsDialogOpen(true)
                    }}
                  >
                    Truss Results
                  </Button>
                </div>
              </div>

              <Dialog
                open={propertiesDialogOpen}
                onOpenChange={setPropertiesDialogOpen}
              >
                <DialogContent className="!w-[96vw] !max-w-[1300px] h-[90vh] max-h-[1000px] min-h-[700px] p-0 gap-0 overflow-hidden">
                  <DialogHeader className="px-5 py-4 border-b border-border">
                    <DialogTitle className="text-lg">Truss Properties</DialogTitle>
                    <DialogDescription>
                      Edit pin-jointed truss geometry, sections, supports, and loads.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 flex-1">
                    <PropertiesPanel module="truss" />
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={resultsDialogOpen} onOpenChange={setResultsDialogOpen}>
                <DialogContent className="!w-[96vw] !max-w-[1300px] h-[90vh] max-h-[1000px] min-h-[700px] p-0 gap-0 overflow-hidden">
                  <DialogHeader className="px-5 py-4 border-b border-border">
                    <DialogTitle className="text-lg">Truss Results</DialogTitle>
                    <DialogDescription>
                      Review support reactions and member axial/deflection diagrams.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 flex-1">
                    <ResultsPanel module="truss" />
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
