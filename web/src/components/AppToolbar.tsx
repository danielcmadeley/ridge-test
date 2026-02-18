import { useMutation } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Box,
  Calculator,
  Download,
  FolderOpen,
  GitFork,
  Menu,
  Play,
  Save,
  Trash2,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import {
  useStructure,
  useStructureDispatch,
  toStructureInput,
  normalizeStructureState,
} from '@/lib/structure-store'
import { analyzeStructure } from '@/lib/api'
import type { AnalysisOutput } from '@/lib/types'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ThemeModeToggle } from '@/components/ThemeModeToggle'
import {
  clearAutosave,
  downloadStructureFile,
  loadFromAutosave,
  readStructureFile,
  saveToAutosave,
} from '@/lib/structure-persistence'

interface UnifiedHeaderProps {
  title: string
  badges?: string[]
  moduleControls?: React.ReactNode
  rightControls?: React.ReactNode
}

// Share analysis results across the app
export const AnalysisResultsContext = createContext<{
  results: AnalysisOutput | null
  setResults: (r: AnalysisOutput | null) => void
}>({ results: null, setResults: () => {} })

export function useAnalysisResults() {
  return useContext(AnalysisResultsContext)
}

export function AnalysisResultsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [results, setResults] = useState<AnalysisOutput | null>(null)
  return (
    <AnalysisResultsContext.Provider value={{ results, setResults }}>
      {children}
    </AnalysisResultsContext.Provider>
  )
}

export function AppToolbar() {
  return <ModuleToolbar module="frame" />
}

type ModuleType = 'frame' | 'truss'

interface ModuleToolbarProps {
  module?: ModuleType
}

export function ModuleToolbar({ module = 'frame' }: ModuleToolbarProps) {
  const state = useStructure()
  const dispatch = useStructureDispatch()
  const { setResults } = useAnalysisResults()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [persistError, setPersistError] = useState<string | null>(null)
  const [autosaveReady, setAutosaveReady] = useState(false)

  const mutation = useMutation({
    mutationFn: analyzeStructure,
    onSuccess: (data) => setResults(data),
  })

  const canAnalyze =
    state.nodes.length >= 2 &&
    state.elements.length >= 1 &&
    state.supports.length >= 1

  useEffect(() => {
    if (typeof window === 'undefined') return
    const restored = loadFromAutosave(module)
    if (restored) {
      dispatch({ type: 'REPLACE_STATE', state: normalizeStructureState(restored) })
      setResults(null)
    }
    setAutosaveReady(true)
  }, [dispatch, module, setResults])

  useEffect(() => {
    if (!autosaveReady) return
    const timeout = window.setTimeout(() => {
      try {
        saveToAutosave(module, state)
      } catch {
        // Ignore autosave failures (quota/private mode)
      }
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [autosaveReady, module, state])

  const saveNow = () => {
    try {
      saveToAutosave(module, state)
      setPersistError(null)
    } catch {
      setPersistError('Unable to save to browser storage')
    }
  }

  const downloadNow = () => {
    try {
      downloadStructureFile(module, state)
      setPersistError(null)
    } catch {
      setPersistError('Unable to download file')
    }
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const restored = await readStructureFile(file, module)
      dispatch({ type: 'REPLACE_STATE', state: restored })
      setResults(null)
      saveToAutosave(module, restored)
      setPersistError(null)
    } catch (err) {
      setPersistError((err as Error).message)
    } finally {
      e.target.value = ''
    }
  }

  return (
    <UnifiedHeader
      title={module === 'truss' ? '2D Truss Analysis' : '2D Analysis'}
      badges={module === 'truss' ? ['Axial + Deflection'] : []}
      moduleControls={
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Grade:</span>
          <select
            value={state.steelGrade}
            onChange={(e) =>
              dispatch({ type: 'SET_STEEL_GRADE', grade: e.target.value })
            }
            className="bg-secondary text-secondary-foreground rounded px-2 py-1 text-xs border border-border"
          >
            <option value="S235">S235</option>
            <option value="S275">S275</option>
            <option value="S355">S355</option>
            <option value="S460">S460</option>
          </select>
        </div>
      }
      rightControls={
        <>
          <Button size="sm" variant="secondary" onClick={saveNow}>
            <Save className="w-4 h-4 mr-1" />
            Save Local
          </Button>

          <Button size="sm" variant="secondary" onClick={downloadNow}>
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderOpen className="w-4 h-4 mr-1" />
            Open
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.ridge.json"
            onChange={onPickFile}
            className="hidden"
          />

          <Button
            size="sm"
            variant="default"
            disabled={!canAnalyze || mutation.isPending}
            onClick={() => mutation.mutate(toStructureInput(state))}
          >
            <Play className="w-4 h-4 mr-1" />
            {mutation.isPending ? 'Analysing...' : 'Run Analysis'}
          </Button>

          {mutation.isError && (
            <span className="text-xs text-destructive">
              {(mutation.error as Error).message.slice(0, 80)}
            </span>
          )}

          {persistError && (
            <span className="text-xs text-destructive">{persistError}</span>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              dispatch({ type: 'CLEAR_ALL' })
              setResults(null)
              clearAutosave(module)
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      }
    />
  )
}

export function UnifiedHeader({
  title,
  badges = [],
  moduleControls,
  rightControls,
}: UnifiedHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setMenuOpen((open) => !open)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openTool = (to: string) => {
    setMenuOpen(false)
    navigate({ to })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 sm:gap-3 sm:px-4">
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 shrink-0 p-0"
        onClick={() => setMenuOpen(true)}
        title="Open tools menu"
      >
        <Menu className="w-4 h-4" />
      </Button>

      <img src="/ridge-logo.png" alt="Ridge" className="h-6 w-auto rounded-sm sm:h-7" />

      <h1 className="text-xs font-semibold tracking-tight sm:text-sm">{title}</h1>

      {badges.map((b) => (
        <span
          key={b}
          className="hidden rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex"
        >
          {b}
        </span>
      ))}

      {moduleControls && (
        <div className="order-3 flex w-full items-center gap-2 sm:order-none sm:ml-2 sm:w-auto">
          {moduleControls}
        </div>
      )}

      <div className="hidden flex-1 sm:block" />

      {rightControls && (
        <div className="order-4 flex w-full items-center justify-end gap-2 overflow-x-auto sm:order-none sm:w-auto sm:min-w-0 sm:max-w-[65vw]">
          {rightControls}
        </div>
      )}

      <div className="ml-auto sm:ml-0">
        <ThemeModeToggle />
      </div>

      <CommandDialog
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title="Tools"
        description="Search and open tools"
      >
        <CommandInput placeholder="Search tools..." />
        <CommandList>
          <CommandEmpty>No tools found.</CommandEmpty>
          <CommandGroup heading="Tools" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CommandItem
              onSelect={() => openTool('/')}
              className="h-24 items-start rounded-md border border-border/70 bg-card/60 p-3"
            >
              <div className="flex w-full items-start gap-2">
                <Wrench className="w-4 h-4 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium leading-none">2D Analysis</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-snug">
                    Build frame models, apply loads and run EC3 checks.
                  </div>
                </div>
                <CommandShortcut className="ml-0 text-[10px] tracking-normal">
                  {location === '/' ? 'Current' : 'Open'}
                </CommandShortcut>
              </div>
            </CommandItem>
            <CommandItem
              onSelect={() => openTool('/truss')}
              className="h-24 items-start rounded-md border border-border/70 bg-card/60 p-3"
            >
              <div className="flex w-full items-start gap-2">
                <GitFork className="w-4 h-4 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium leading-none">Truss Analysis</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-snug">
                    Build pin-jointed trusses and review axial and deflection behavior.
                  </div>
                </div>
                <CommandShortcut className="ml-0 text-[10px] tracking-normal">
                  {location === '/truss' ? 'Current' : 'Open'}
                </CommandShortcut>
              </div>
            </CommandItem>
            <CommandItem
              onSelect={() => openTool('/section-properties-calculator')}
              className="h-24 items-start rounded-md border border-border/70 bg-card/60 p-3"
            >
              <div className="flex w-full items-start gap-2">
                <Calculator className="w-4 h-4 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium leading-none">Section Properties</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-snug">
                    Compose section geometry and compute area/inertia.
                  </div>
                </div>
                <CommandShortcut className="ml-0 text-[10px] tracking-normal">
                  {location === '/section-properties-calculator' ? 'Current' : 'Open'}
                </CommandShortcut>
              </div>
            </CommandItem>
            <CommandItem
              onSelect={() => openTool('/3d-load-takedown')}
              className="h-24 items-start rounded-md border border-border/70 bg-card/60 p-3 sm:col-span-2"
            >
              <div className="flex w-full items-start gap-2">
                <Box className="w-4 h-4 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium leading-none">3D Load Takedown</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-snug">
                    Build storey slabs/columns and run load-down reactions.
                  </div>
                </div>
                <CommandShortcut className="ml-0 text-[10px] tracking-normal">
                  {location === '/3d-load-takedown' ? 'Current' : 'Open'}
                </CommandShortcut>
              </div>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
