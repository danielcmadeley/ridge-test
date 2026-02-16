import { create } from 'zustand'
import type {
  LoadTakedownAnalysisResult,
  LoadTakedownColumn,
  LoadTakedownElement,
  LoadTakedownModel,
  LoadTakedownSlab,
  LoadTakedownStorey,
  LoadTakedownWall,
} from '@/lib/types'
import { createEmptyModel, createExampleModel, DEFAULT_MATERIAL } from './defaults'

export type LoadTakedownTool = 'select' | 'move' | 'slab' | 'column' | 'wall'
export type LoadTakedownViewMode = '2d' | '3d'

interface LoadTakedown3DState {
  model: LoadTakedownModel
  activeTool: LoadTakedownTool
  viewMode: LoadTakedownViewMode
  snapToGrid: boolean
  selectedId: string | null
  selectedIds: string[]
  activeStoreyId: string | null
  analysis: LoadTakedownAnalysisResult | null
  isRunning: boolean
  runError: string | null
  setTool: (tool: LoadTakedownTool) => void
  setViewMode: (mode: LoadTakedownViewMode) => void
  setSnapToGrid: (enabled: boolean) => void
  setSelectedId: (id: string | null) => void
  selectElement: (id: string, additive?: boolean) => void
  setActiveStoreyId: (id: string | null) => void
  setModel: (model: LoadTakedownModel) => void
  resetModel: () => void
  loadExample: () => void
  addSlabAt: (x: number, y: number) => void
  addSlabRect: (x: number, y: number, width: number, depth: number) => void
  addColumnAt: (x: number, y: number) => void
  deleteSelected: () => void
  updateElement: (id: string, updater: (element: LoadTakedownElement) => LoadTakedownElement) => void
  updateElements: (
    ids: string[],
    updater: (element: LoadTakedownElement) => LoadTakedownElement,
  ) => void
  setGridSize: (gridSize: number) => void
  setSlabDeadLoad: (slabDead_kN_m2: number) => void
  setSlabLiveLoad: (slabLive_kN_m2: number) => void
  setSlabThicknessForLoad: (slabThickness_m: number) => void
  setConcreteDensity: (concreteDensity_kN_m3: number) => void
  addStorey: () => void
  updateStorey: (id: string, patch: Partial<LoadTakedownStorey>) => void
  deleteStorey: (id: string) => void
  setAnalysis: (result: LoadTakedownAnalysisResult | null) => void
  setRunState: (isRunning: boolean, runError?: string | null) => void
}

function nextId(elements: LoadTakedownElement[], prefix: 'S' | 'C' | 'W'): string {
  let max = 0
  for (const e of elements) {
    if (!e.id.startsWith(prefix)) continue
    const n = Number(e.id.slice(1))
    if (!Number.isNaN(n)) max = Math.max(max, n)
  }
  return `${prefix}${max + 1}`
}

function levelElevation(model: LoadTakedownModel, activeStoreyId: string | null): number {
  if (activeStoreyId) {
    const st = model.storeys.find((s) => s.id === activeStoreyId)
    if (st) return st.elevation
  }
  return model.storeys[0]?.elevation ?? 0
}

function nextStoreyId(storeys: LoadTakedownStorey[]): string {
  let max = 0
  for (const s of storeys) {
    const n = Number(s.id.replace(/^ST/, ''))
    if (!Number.isNaN(n)) max = Math.max(max, n)
  }
  return `ST${max + 1}`
}

function withDerivedSlabUDL(loads: LoadTakedownModel['loads']): LoadTakedownModel['loads'] {
  const slabDead_kN_m2 = Math.max(0, loads.slabDead_kN_m2)
  const slabLive_kN_m2 = Math.max(0, loads.slabLive_kN_m2)
  const slabThickness_m = Math.max(0, loads.slabThickness_m)
  const concreteDensity_kN_m3 = Math.max(0, loads.concreteDensity_kN_m3)
  return {
    ...loads,
    slabDead_kN_m2,
    slabLive_kN_m2,
    slabThickness_m,
    concreteDensity_kN_m3,
    slabUDL:
      (slabDead_kN_m2 + slabLive_kN_m2 + slabThickness_m * concreteDensity_kN_m3) *
      1e3,
  }
}

export const useLoadTakedown3DStore = create<LoadTakedown3DState>((set) => ({
  model: createExampleModel(),
  activeTool: 'select',
  viewMode: '2d',
  snapToGrid: true,
  selectedId: null,
  selectedIds: [],
  activeStoreyId: 'ST1',
  analysis: null,
  isRunning: false,
  runError: null,

  setTool: (tool) => set({ activeTool: tool }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSnapToGrid: (enabled) => set({ snapToGrid: enabled }),
  setSelectedId: (id) => set({ selectedId: id, selectedIds: id ? [id] : [] }),
  selectElement: (id, additive = false) =>
    set((state) => {
      const target = state.model.elements.find((e) => e.id === id)
      if (!target) return state

      if (!additive) {
        return { selectedId: id, selectedIds: [id] }
      }

      const selectedElements = state.model.elements.filter((e) =>
        state.selectedIds.includes(e.id),
      )
      const selectedType = selectedElements[0]?.type
      if (selectedType && selectedType !== target.type) {
        return state
      }

      const already = state.selectedIds.includes(id)
      const nextIds = already
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id]
      return {
        selectedIds: nextIds,
        selectedId: nextIds.length ? nextIds[nextIds.length - 1] : null,
      }
    }),
  setActiveStoreyId: (id) => set({ activeStoreyId: id }),
  setModel: (model) =>
    set({
      model: { ...model, loads: withDerivedSlabUDL(model.loads) },
      selectedId: null,
      selectedIds: [],
      analysis: null,
      runError: null,
      activeStoreyId: model.storeys[0]?.id ?? null,
    }),
  resetModel: () => {
    const model = createEmptyModel()
    set({
      model,
      selectedId: null,
      selectedIds: [],
      analysis: null,
      runError: null,
      activeStoreyId: model.storeys[0]?.id ?? null,
      viewMode: '2d',
    })
  },
  loadExample: () => {
    const model = createExampleModel()
    set({
      model,
      selectedId: null,
      selectedIds: [],
      analysis: null,
      runError: null,
      activeStoreyId: model.storeys[1]?.id ?? model.storeys[0]?.id ?? null,
      viewMode: '2d',
    })
  },

  addSlabAt: (x, y) =>
    set((state) => {
      const id = nextId(state.model.elements, 'S')
      const elevation = levelElevation(state.model, state.activeStoreyId)
      const slab: LoadTakedownSlab = {
        id,
        type: 'slab',
        name: id,
        origin: { x, y, z: 0 },
        width: 6,
        depth: 6,
        thickness: 0.2,
        elevation,
        material: DEFAULT_MATERIAL,
      }
      return {
        model: { ...state.model, elements: [...state.model.elements, slab] },
        selectedId: id,
        selectedIds: [id],
        analysis: null,
      }
    }),

  addSlabRect: (x, y, width, depth) =>
    set((state) => {
      const id = nextId(state.model.elements, 'S')
      const elevation = levelElevation(state.model, state.activeStoreyId)
      const slab: LoadTakedownSlab = {
        id,
        type: 'slab',
        name: id,
        origin: { x, y, z: 0 },
        width: Math.max(0.1, width),
        depth: Math.max(0.1, depth),
        thickness: 0.2,
        elevation,
        material: DEFAULT_MATERIAL,
      }
      return {
        model: { ...state.model, elements: [...state.model.elements, slab] },
        selectedId: id,
        selectedIds: [id],
        analysis: null,
      }
    }),

  addColumnAt: (x, y) =>
    set((state) => {
      const id = nextId(state.model.elements, 'C')
      const elevation = levelElevation(state.model, state.activeStoreyId)
      const sorted = [...state.model.storeys].sort((a, b) => a.elevation - b.elevation)
      const idx = sorted.findIndex((s) => s.id === state.activeStoreyId)
      const nextElevation = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1].elevation : elevation + 3
      const height = Math.max(0.1, nextElevation - elevation)
      const column: LoadTakedownColumn = {
        id,
        type: 'column',
        name: id,
        base: { x, y, z: elevation },
        height,
        sizeX: 0.4,
        sizeY: 0.4,
        material: DEFAULT_MATERIAL,
      }
      return {
        model: { ...state.model, elements: [...state.model.elements, column] },
        selectedId: id,
        selectedIds: [id],
        analysis: null,
      }
    }),

  deleteSelected: () =>
    set((state) => {
      if (!state.selectedIds.length) return state
      const selected = new Set(state.selectedIds)
      return {
        model: {
          ...state.model,
          elements: state.model.elements.filter((e) => !selected.has(e.id)),
        },
        selectedId: null,
        selectedIds: [],
        analysis: null,
      }
    }),

  updateElement: (id, updater) =>
    set((state) => ({
      model: {
        ...state.model,
        elements: state.model.elements.map((e) => (e.id === id ? updater(e) : e)),
      },
      analysis: null,
    })),

  updateElements: (ids, updater) =>
    set((state) => {
      if (!ids.length) return state
      const selected = new Set(ids)
      return {
        model: {
          ...state.model,
          elements: state.model.elements.map((e) =>
            selected.has(e.id) ? updater(e) : e,
          ),
        },
        analysis: null,
      }
    }),

  setGridSize: (gridSize) =>
    set((state) => ({ model: { ...state.model, gridSize: Math.max(0.05, gridSize) } })),

  setSlabDeadLoad: (slabDead_kN_m2) =>
    set((state) => ({
      model: {
        ...state.model,
        loads: withDerivedSlabUDL({ ...state.model.loads, slabDead_kN_m2 }),
      },
      analysis: null,
    })),

  setSlabLiveLoad: (slabLive_kN_m2) =>
    set((state) => ({
      model: {
        ...state.model,
        loads: withDerivedSlabUDL({ ...state.model.loads, slabLive_kN_m2 }),
      },
      analysis: null,
    })),

  setSlabThicknessForLoad: (slabThickness_m) =>
    set((state) => ({
      model: {
        ...state.model,
        loads: withDerivedSlabUDL({ ...state.model.loads, slabThickness_m }),
      },
      analysis: null,
    })),

  setConcreteDensity: (concreteDensity_kN_m3) =>
    set((state) => ({
      model: {
        ...state.model,
        loads: withDerivedSlabUDL({ ...state.model.loads, concreteDensity_kN_m3 }),
      },
      analysis: null,
    })),

  addStorey: () =>
    set((state) => {
      const id = nextStoreyId(state.model.storeys)
      const sorted = [...state.model.storeys].sort((a, b) => a.elevation - b.elevation)
      const top = sorted[sorted.length - 1]
      const elevation = (top?.elevation ?? 0) + 3
      const storey: LoadTakedownStorey = { id, name: `Level ${state.model.storeys.length}`, elevation }
      return {
        model: { ...state.model, storeys: [...state.model.storeys, storey] },
        activeStoreyId: id,
      }
    }),

  updateStorey: (id, patch) =>
    set((state) => ({
      model: {
        ...state.model,
        storeys: state.model.storeys.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      },
      analysis: null,
    })),

  deleteStorey: (id) =>
    set((state) => {
      if (state.model.storeys.length <= 1) return state
      const storeys = state.model.storeys.filter((s) => s.id !== id)
      const activeStoreyId = state.activeStoreyId === id ? storeys[0]?.id ?? null : state.activeStoreyId
      return {
        model: { ...state.model, storeys },
        activeStoreyId,
      }
    }),

  setAnalysis: (result) => set({ analysis: result }),
  setRunState: (isRunning, runError = null) => set({ isRunning, runError }),
}))

export function useSelectedElement(): LoadTakedownElement | null {
  return useLoadTakedown3DStore((state) =>
    state.model.elements.find((e) => e.id === state.selectedId) ?? null,
  )
}

export function isWall(element: LoadTakedownElement): element is LoadTakedownWall {
  return element.type === 'wall'
}
