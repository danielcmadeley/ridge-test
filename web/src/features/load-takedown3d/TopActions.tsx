import { useRef } from 'react'
import { Download, FileUp, FlaskConical, Play, RefreshCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { analyzeLoadTakedown3D } from '@/lib/api'
import { downloadModelJson, loadModelFromFile } from './model-io'
import { useLoadTakedown3DStore } from './store'

export function TopActions({ inline = false }: { inline?: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const model = useLoadTakedown3DStore((s) => s.model)
  const resetModel = useLoadTakedown3DStore((s) => s.resetModel)
  const loadExample = useLoadTakedown3DStore((s) => s.loadExample)
  const setModel = useLoadTakedown3DStore((s) => s.setModel)
  const setAnalysis = useLoadTakedown3DStore((s) => s.setAnalysis)
  const setRunState = useLoadTakedown3DStore((s) => s.setRunState)
  const isRunning = useLoadTakedown3DStore((s) => s.isRunning)
  const viewMode = useLoadTakedown3DStore((s) => s.viewMode)
  const setViewMode = useLoadTakedown3DStore((s) => s.setViewMode)
  const activeStoreyId = useLoadTakedown3DStore((s) => s.activeStoreyId)
  const storeyCount = useLoadTakedown3DStore((s) => s.model.storeys.length)
  const elementCount = useLoadTakedown3DStore((s) => s.model.elements.length)

  const run = async () => {
    try {
      setRunState(true, null)
      const result = await analyzeLoadTakedown3D(model)
      setAnalysis(result)
      setRunState(false, null)
    } catch (err) {
      setAnalysis(null)
      setRunState(false, (err as Error).message)
    }
  }

  return (
    <div className={inline ? 'flex items-center gap-2' : 'flex items-center gap-2 p-2 border-b border-border bg-card/70'}>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={resetModel}>
        <RefreshCcw className="w-4 h-4 mr-1" />
        New
        </Button>
        <Button size="sm" variant="ghost" onClick={loadExample}>
        <FlaskConical className="w-4 h-4 mr-1" />
        Example
        </Button>
      </div>

      <div className="h-5 w-px bg-border mx-1" />

      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => downloadModelJson(model, 'load-takedown-model.json')}>
        <Save className="w-4 h-4 mr-1" />
        Save JSON
        </Button>
        <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
        <FileUp className="w-4 h-4 mr-1" />
        Load JSON
        </Button>
        <Button size="sm" variant="ghost" onClick={() => downloadModelJson(model, 'load-takedown-export.json')}>
        <Download className="w-4 h-4 mr-1" />
        Export
        </Button>
      </div>

      <div className="mx-1 h-5 w-px bg-border" />
      <Button
        size="sm"
        variant={viewMode === '2d' ? 'default' : 'ghost'}
        onClick={() => setViewMode('2d')}
      >
        2D Levels
      </Button>
      <Button
        size="sm"
        variant={viewMode === '3d' ? 'default' : 'ghost'}
        onClick={() => setViewMode('3d')}
      >
        3D View
      </Button>

      <div className="mx-1 h-5 w-px bg-border" />
      <div className="hidden lg:flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded border border-border px-2 py-0.5">{storeyCount} Levels</span>
        <span className="rounded border border-border px-2 py-0.5">{elementCount} Elements</span>
        {activeStoreyId && <span className="rounded border border-border px-2 py-0.5">Active: {activeStoreyId}</span>}
      </div>

      <div className="flex-1" />

      <Button size="sm" onClick={run} disabled={isRunning}>
        <Play className="w-4 h-4 mr-1" />
        {isRunning ? 'Running...' : 'Run Load-Down'}
      </Button>

      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="application/json"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          try {
            const loaded = await loadModelFromFile(file)
            setModel(loaded)
          } catch (err) {
            setRunState(false, (err as Error).message)
          } finally {
            e.target.value = ''
          }
        }}
      />
    </div>
  )
}
