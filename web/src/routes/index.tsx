import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { StructureProvider } from '@/lib/structure-store'
import { AppToolbar, AnalysisResultsProvider } from '@/components/AppToolbar'
import { PropertiesPanel } from '@/components/properties/PropertiesPanel'
import { StructureCanvas } from '@/components/canvas/StructureCanvas'
import { ResultsPanel } from '@/components/results/ResultsPanel'
import { useIsMobile } from '@/hooks/use-mobile'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const isMobile = useIsMobile()
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
          <AppToolbar />

          {isMobile ? (
            <>
              <div className="relative flex-1 min-h-0 pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
                <StructureCanvas />
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
            <ResizablePanelGroup direction="horizontal" className="flex-1">
              <ResizablePanel defaultSize={20} minSize={15}>
                <PropertiesPanel />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={30}>
                <StructureCanvas />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={30} minSize={20}>
                <ResultsPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </AnalysisResultsProvider>
    </StructureProvider>
  )
}
