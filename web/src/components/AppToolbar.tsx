import { useMutation } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Box,
  Calculator,
  Clock3,
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
import type { AnalysisOutput, StructureInput } from '@/lib/types'
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
  analysisInput: StructureInput | null
  setAnalysisInput: (input: StructureInput | null) => void
}>({
  results: null,
  setResults: () => {},
  analysisInput: null,
  setAnalysisInput: () => {},
})

export function useAnalysisResults() {
  return useContext(AnalysisResultsContext)
}

export function AnalysisResultsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [results, setResults] = useState<AnalysisOutput | null>(null)
  const [analysisInput, setAnalysisInput] = useState<StructureInput | null>(null)
  return (
    <AnalysisResultsContext.Provider
      value={{ results, setResults, analysisInput, setAnalysisInput }}
    >
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
  const { setResults, setAnalysisInput, analysisInput } = useAnalysisResults()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [persistError, setPersistError] = useState<string | null>(null)
  const [autosaveReady, setAutosaveReady] = useState(false)

  const mutation = useMutation({
    mutationFn: analyzeStructure,
    onSuccess: (data, variables) => {
      setResults(data)
      setAnalysisInput(variables)
    },
    onError: () => {
      setResults(null)
      setAnalysisInput(null)
    },
  })

  const currentInput = toStructureInput(state)
  const currentInputKey = JSON.stringify(currentInput)
  const analyzedInputKey = analysisInput ? JSON.stringify(analysisInput) : null

  useEffect(() => {
    if (!analysisInput || analyzedInputKey === currentInputKey) return
    setResults(null)
    setAnalysisInput(null)
  }, [analysisInput, analyzedInputKey, currentInputKey, setAnalysisInput, setResults])

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
      setAnalysisInput(null)
    }
    setAutosaveReady(true)
  }, [dispatch, module, setAnalysisInput, setResults])

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
      setAnalysisInput(null)
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
      title={module === 'truss' ? '2D Truss Analysis' : '2D Frame Analysis'}
      badges={module === 'truss' ? ['Axial + Deflection'] : []}
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
            onClick={() => mutation.mutate(currentInput)}
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
              setAnalysisInput(null)
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

  const toolTiles = [
    {
      id: 'frame',
      title: '2D Frame Analysis',
      description: 'Build frame models, apply loads and run EC3 checks.',
      to: '/frame',
      icon: Wrench,
      shortcut: 'F',
      enabled: true,
    },
    {
      id: 'truss',
      title: 'Truss Analysis',
      description: 'Build pin-jointed trusses and review axial and deflection behavior.',
      to: '/truss',
      icon: GitFork,
      shortcut: 'T',
      enabled: true,
    },
    {
      id: 'section-properties',
      title: 'Section Properties',
      description: 'Compose section geometry and compute area/inertia.',
      to: '/section-properties-calculator',
      icon: Calculator,
      shortcut: 'S',
      enabled: true,
    },
    {
      id: 'load-takedown-3d',
      title: '3D Load Takedown',
      description: 'Build storey slabs/columns and run load-down reactions.',
      to: '/3d-load-takedown',
      icon: Box,
      shortcut: '3',
      enabled: true,
    },
    {
      id: 'coming-soon-1',
      title: 'Coming Soon',
      description: 'A new structural tool is in development.',
      to: '#',
      icon: Clock3,
      shortcut: '',
      enabled: false,
    },
    {
      id: 'coming-soon-2',
      title: 'Coming Soon',
      description: 'A new structural tool is in development.',
      to: '#',
      icon: Clock3,
      shortcut: '',
      enabled: false,
    },
    {
      id: 'coming-soon-3',
      title: 'Coming Soon',
      description: 'A new structural tool is in development.',
      to: '#',
      icon: Clock3,
      shortcut: '',
      enabled: false,
    },
    {
      id: 'coming-soon-4',
      title: 'Coming Soon',
      description: 'A new structural tool is in development.',
      to: '#',
      icon: Clock3,
      shortcut: '',
      enabled: false,
    },
    {
      id: 'coming-soon-5',
      title: 'Coming Soon',
      description: 'A new structural tool is in development.',
      to: '#',
      icon: Clock3,
      shortcut: '',
      enabled: false,
    },
  ] as const

  const availableTools = toolTiles.filter((tool) => tool.enabled)
  const upcomingTools = toolTiles.filter((tool) => !tool.enabled)

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
        className="w-[96vw] max-w-[960px]"
      >
        <div className="px-4 pt-4">
          <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            Tools
          </span>
        </div>
        <CommandInput placeholder="Type a command or search..." className="h-14 text-lg" />
        <CommandList className="max-h-[560px]">
          <CommandEmpty>No tools found.</CommandEmpty>
          <CommandGroup heading="Available" className="p-3">
            {availableTools.map(({ id, title, description, to, icon: Icon, shortcut }) => (
              <CommandItem
                key={id}
                value={`${title} ${description}`}
                onSelect={() => openTool(to)}
                className="mb-2 h-14 rounded-md border border-border/70 bg-card/50 px-3"
              >
                <div className="flex w-full items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-none">{title}</div>
                  </div>
                  <CommandShortcut className="ml-0 rounded bg-muted px-2 py-0.5 text-[11px] tracking-normal">
                    {location === to ? 'Current' : shortcut}
                  </CommandShortcut>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Coming Soon" className="p-3 pt-1">
            {upcomingTools.map(({ id, title, icon: Icon }) => (
              <CommandItem
                key={id}
                value={title}
                disabled
                className="mb-2 h-14 rounded-md border border-border/60 bg-muted/40 px-3 text-muted-foreground data-[disabled=true]:opacity-100"
              >
                <div className="flex w-full items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-none">{title}</div>
                  </div>
                  <CommandShortcut className="ml-0 rounded bg-muted px-2 py-0.5 text-[11px] tracking-normal">
                    Soon
                  </CommandShortcut>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
