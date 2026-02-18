import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import { createElement } from 'react'
import type {
  CanvasElement,
  CanvasNode,
  CanvasPointLoad,
  CanvasSupport,
  CanvasUDL,
  LoadCase,
  LoadCaseCategory,
  LoadCombination,
  StructureInput,
  StructureState,
  SupportType,
  ToolType,
} from './types'

const TOOL_TYPES: ToolType[] = [
  'drag',
  'select',
  'erase',
  'node',
  'beam',
  'column',
  'truss',
  'support',
  'load',
]

// ── Load case defaults ──────────────────────────────────────

const LOAD_CASE_COLORS: Record<LoadCaseCategory, string> = {
  G: '#3b82f6', // blue
  Q: '#ef4444', // red
  W: '#22c55e', // green
  S: '#a855f7', // purple
}

const DEFAULT_LOAD_CASES: LoadCase[] = [
  { id: 'LC-G', name: 'Permanent (G)', category: 'G', color: LOAD_CASE_COLORS.G },
  { id: 'LC-Q', name: 'Imposed (Q)', category: 'Q', color: LOAD_CASE_COLORS.Q },
  { id: 'LC-W', name: 'Wind (W)', category: 'W', color: LOAD_CASE_COLORS.W },
  { id: 'LC-S', name: 'Snow (S)', category: 'S', color: LOAD_CASE_COLORS.S },
]

const DEFAULT_COMBINATIONS: LoadCombination[] = [
  {
    id: 'C1',
    name: 'ULS 6.10a',
    combinationType: 'ULS',
    factors: { 'LC-G': 1.35, 'LC-Q': 1.05, 'LC-W': 0.75, 'LC-S': 0.75 },
  },
  {
    id: 'C2',
    name: 'ULS 6.10b (Q leading)',
    combinationType: 'ULS',
    factors: { 'LC-G': 1.25, 'LC-Q': 1.5, 'LC-W': 0.75, 'LC-S': 0.75 },
  },
  {
    id: 'C3',
    name: 'ULS 6.10b (W leading)',
    combinationType: 'ULS',
    factors: { 'LC-G': 1.25, 'LC-Q': 1.05, 'LC-W': 1.5, 'LC-S': 0.75 },
  },
  {
    id: 'C4',
    name: 'ULS 6.10b (S leading)',
    combinationType: 'ULS',
    factors: { 'LC-G': 1.25, 'LC-Q': 1.05, 'LC-W': 0.75, 'LC-S': 1.5 },
  },
  {
    id: 'C5',
    name: 'SLS Characteristic',
    combinationType: 'SLS',
    factors: { 'LC-G': 1.0, 'LC-Q': 1.0, 'LC-W': 1.0, 'LC-S': 1.0 },
  },
  {
    id: 'C6',
    name: 'SLS Frequent',
    combinationType: 'SLS',
    factors: { 'LC-G': 1.0, 'LC-Q': 0.5, 'LC-W': 0.2, 'LC-S': 0.2 },
  },
  {
    id: 'C7',
    name: 'SLS Quasi-permanent',
    combinationType: 'SLS',
    factors: { 'LC-G': 1.0, 'LC-Q': 0.3, 'LC-W': 0.0, 'LC-S': 0.0 },
  },
]

// ── Initial state ────────────────────────────────────────────

export const initialStructureState: StructureState = {
  nodes: [],
  elements: [],
  supports: [],
  udls: [],
  pointLoads: [],
  steelGrade: 'S355',
  selectedTool: 'select',
  selectedId: null,
  pendingNodeId: null,
  nextNodeId: 1,
  nextElementId: 1,
  loadCases: DEFAULT_LOAD_CASES,
  activeLoadCaseId: 'LC-G',
  combinations: DEFAULT_COMBINATIONS,
}

function nextIdFromPrefix(ids: string[], prefix: 'N' | 'E', fallback: number) {
  let maxId = fallback - 1
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue
    const n = Number.parseInt(id.slice(1), 10)
    if (!Number.isNaN(n)) maxId = Math.max(maxId, n)
  }
  return Math.max(fallback, maxId + 1)
}

export function normalizeStructureState(candidate: Partial<StructureState>): StructureState {
  const nodes = Array.isArray(candidate.nodes) ? candidate.nodes : []
  const elements = Array.isArray(candidate.elements) ? candidate.elements : []
  const supports = Array.isArray(candidate.supports) ? candidate.supports : []
  const udls = Array.isArray(candidate.udls) ? candidate.udls : []
  const pointLoads = Array.isArray(candidate.pointLoads) ? candidate.pointLoads : []
  const loadCases =
    Array.isArray(candidate.loadCases) && candidate.loadCases.length > 0
      ? candidate.loadCases
      : DEFAULT_LOAD_CASES
  const combinations =
    Array.isArray(candidate.combinations) && candidate.combinations.length > 0
      ? candidate.combinations
      : DEFAULT_COMBINATIONS

  const nodeIds = nodes.map((n) => n.id)
  const elementIds = elements.map((e) => e.id)
  const selectableIds = [
    ...nodeIds,
    ...elementIds,
    ...supports.map((s) => s.id),
    ...udls.map((u) => u.id),
    ...pointLoads.map((p) => p.id),
  ]

  const activeLoadCaseId =
    typeof candidate.activeLoadCaseId === 'string' &&
    loadCases.some((lc) => lc.id === candidate.activeLoadCaseId)
      ? candidate.activeLoadCaseId
      : loadCases[0].id

  return {
    ...initialStructureState,
    nodes,
    elements,
    supports,
    udls,
    pointLoads,
    steelGrade: candidate.steelGrade ?? initialStructureState.steelGrade,
    selectedTool:
      candidate.selectedTool && TOOL_TYPES.includes(candidate.selectedTool)
        ? candidate.selectedTool
        : initialStructureState.selectedTool,
    selectedId:
      typeof candidate.selectedId === 'string' && selectableIds.includes(candidate.selectedId)
        ? candidate.selectedId
        : null,
    pendingNodeId:
      typeof candidate.pendingNodeId === 'string' && nodeIds.includes(candidate.pendingNodeId)
        ? candidate.pendingNodeId
        : null,
    nextNodeId: nextIdFromPrefix(nodeIds, 'N', candidate.nextNodeId ?? 1),
    nextElementId: nextIdFromPrefix(elementIds, 'E', candidate.nextElementId ?? 1),
    loadCases,
    activeLoadCaseId,
    combinations,
  }
}

const initialState: StructureState = { ...initialStructureState }

// ── Actions ──────────────────────────────────────────────────

export type StructureAction =
  | { type: 'ADD_NODE'; x: number; y: number }
  | { type: 'MOVE_NODE'; id: string; x: number; y: number }
  | { type: 'DELETE_NODE'; id: string }
  | {
      type: 'ADD_ELEMENT'
      nodeI: string
      nodeJ: string
      role: 'beam' | 'column' | 'truss_member'
      designation: string
    }
  | { type: 'UPDATE_ELEMENT'; id: string; changes: Partial<CanvasElement> }
  | { type: 'DELETE_ELEMENT'; id: string }
  | { type: 'ADD_SUPPORT'; nodeId: string; supportType: SupportType }
  | { type: 'UPDATE_SUPPORT'; id: string; supportType: SupportType }
  | { type: 'DELETE_SUPPORT'; id: string }
  | {
      type: 'ADD_UDL'
      elementId: string
      wx: number
      wy: number
    }
  | { type: 'UPDATE_UDL'; id: string; wx: number; wy: number }
  | { type: 'DELETE_UDL'; id: string }
  | {
      type: 'ADD_POINT_LOAD'
      nodeId: string
      fx: number
      fy: number
      mz: number
    }
  | {
      type: 'UPDATE_POINT_LOAD'
      id: string
      fx: number
      fy: number
      mz: number
    }
  | { type: 'DELETE_POINT_LOAD'; id: string }
  | { type: 'SET_TOOL'; tool: ToolType }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_PENDING_NODE'; nodeId: string | null }
  | { type: 'SET_STEEL_GRADE'; grade: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'REPLACE_STATE'; state: StructureState }
  // Load case actions
  | { type: 'SET_ACTIVE_LOAD_CASE'; loadCaseId: string }
  | {
      type: 'UPDATE_COMBINATION'
      id: string
      factors: Record<string, number>
    }

// ── Reducer ──────────────────────────────────────────────────

function structureReducer(
  state: StructureState,
  action: StructureAction,
): StructureState {
  switch (action.type) {
    case 'ADD_NODE': {
      const id = `N${state.nextNodeId}`
      const node: CanvasNode = {
        id,
        name: id,
        x: action.x,
        y: action.y,
      }
      return {
        ...state,
        nodes: [...state.nodes, node],
        nextNodeId: state.nextNodeId + 1,
        selectedId: id,
      }
    }

    case 'MOVE_NODE':
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.id ? { ...n, x: action.x, y: action.y } : n,
        ),
      }

    case 'DELETE_NODE': {
      const nodeId = action.id
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        elements: state.elements.filter(
          (e) => e.nodeI !== nodeId && e.nodeJ !== nodeId,
        ),
        supports: state.supports.filter((s) => s.nodeId !== nodeId),
        pointLoads: state.pointLoads.filter((p) => p.nodeId !== nodeId),
        selectedId: state.selectedId === nodeId ? null : state.selectedId,
      }
    }

    case 'ADD_ELEMENT': {
      const nodeI = state.nodes.find((n) => n.id === action.nodeI)
      const nodeJ = state.nodes.find((n) => n.id === action.nodeJ)
      if (!nodeI || !nodeJ) return state

      const dx = nodeJ.x - nodeI.x
      const dy = nodeJ.y - nodeI.y
      const len2 = dx * dx + dy * dy
      if (len2 < 1e-12) return state

      const intermediate = state.nodes
        .filter((n) => n.id !== nodeI.id && n.id !== nodeJ.id)
        .filter((n) => {
          const vx = n.x - nodeI.x
          const vy = n.y - nodeI.y
          const cross = vx * dy - vy * dx
          if (Math.abs(cross) > 1e-9) return false
          const t = (vx * dx + vy * dy) / len2
          return t > 1e-9 && t < 1 - 1e-9
        })
        .sort((a, b) => {
          const ta = ((a.x - nodeI.x) * dx + (a.y - nodeI.y) * dy) / len2
          const tb = ((b.x - nodeI.x) * dx + (b.y - nodeI.y) * dy) / len2
          return ta - tb
        })

      const chain = [nodeI.id, ...intermediate.map((n) => n.id), nodeJ.id]

      const hasSameSpan = (a: string, b: string) =>
        state.elements.some(
          (e) =>
            ((e.nodeI === a && e.nodeJ === b) || (e.nodeI === b && e.nodeJ === a)) &&
            e.role === action.role,
        )

      const toAdd: CanvasElement[] = []
      let nextElementId = state.nextElementId
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i]
        const b = chain[i + 1]
        if (hasSameSpan(a, b)) continue
        const id = `E${nextElementId}`
        toAdd.push({
          id,
          name: id,
          role: action.role,
          nodeI: a,
          nodeJ: b,
          designation: action.designation,
          releaseStart: false,
          releaseEnd: false,
        })
        nextElementId += 1
      }

      if (toAdd.length === 0) {
        return { ...state, pendingNodeId: null }
      }

      return {
        ...state,
        elements: [...state.elements, ...toAdd],
        nextElementId,
        selectedId: toAdd[toAdd.length - 1].id,
        pendingNodeId: null,
      }
    }

    case 'UPDATE_ELEMENT':
      return {
        ...state,
        elements: state.elements.map((e) =>
          e.id === action.id ? { ...e, ...action.changes } : e,
        ),
      }

    case 'DELETE_ELEMENT': {
      const elemId = action.id
      return {
        ...state,
        elements: state.elements.filter((e) => e.id !== elemId),
        udls: state.udls.filter((u) => u.elementId !== elemId),
        selectedId: state.selectedId === elemId ? null : state.selectedId,
      }
    }

    case 'ADD_SUPPORT': {
      // Replace existing support on same node
      const existing = state.supports.find(
        (s) => s.nodeId === action.nodeId,
      )
      if (existing) {
        return {
          ...state,
          supports: state.supports.map((s) =>
            s.nodeId === action.nodeId
              ? { ...s, type: action.supportType }
              : s,
          ),
        }
      }
      const id = `S${action.nodeId}`
      const support: CanvasSupport = {
        id,
        nodeId: action.nodeId,
        type: action.supportType,
      }
      return { ...state, supports: [...state.supports, support] }
    }

    case 'UPDATE_SUPPORT':
      return {
        ...state,
        supports: state.supports.map((s) =>
          s.id === action.id ? { ...s, type: action.supportType } : s,
        ),
      }

    case 'DELETE_SUPPORT':
      return {
        ...state,
        supports: state.supports.filter((s) => s.id !== action.id),
      }

    case 'ADD_UDL': {
      const id = `UDL-${state.activeLoadCaseId}-${action.elementId}`
      const udl: CanvasUDL = {
        id,
        elementId: action.elementId,
        wx: action.wx,
        wy: action.wy,
        loadCaseId: state.activeLoadCaseId,
      }
      return { ...state, udls: [...state.udls, udl] }
    }

    case 'UPDATE_UDL':
      return {
        ...state,
        udls: state.udls.map((u) =>
          u.id === action.id ? { ...u, wx: action.wx, wy: action.wy } : u,
        ),
      }

    case 'DELETE_UDL':
      return {
        ...state,
        udls: state.udls.filter((u) => u.id !== action.id),
      }

    case 'ADD_POINT_LOAD': {
      const id = `PL-${state.activeLoadCaseId}-${action.nodeId}`
      const pl: CanvasPointLoad = {
        id,
        nodeId: action.nodeId,
        fx: action.fx,
        fy: action.fy,
        mz: action.mz,
        loadCaseId: state.activeLoadCaseId,
      }
      return { ...state, pointLoads: [...state.pointLoads, pl] }
    }

    case 'UPDATE_POINT_LOAD':
      return {
        ...state,
        pointLoads: state.pointLoads.map((p) =>
          p.id === action.id
            ? { ...p, fx: action.fx, fy: action.fy, mz: action.mz }
            : p,
        ),
      }

    case 'DELETE_POINT_LOAD':
      return {
        ...state,
        pointLoads: state.pointLoads.filter((p) => p.id !== action.id),
      }

    case 'SET_TOOL':
      return { ...state, selectedTool: action.tool, pendingNodeId: null }

    case 'SELECT':
      return { ...state, selectedId: action.id }

    case 'SET_PENDING_NODE':
      return { ...state, pendingNodeId: action.nodeId }

    case 'SET_STEEL_GRADE':
      return { ...state, steelGrade: action.grade }

    case 'CLEAR_ALL':
      return { ...initialState }

    case 'REPLACE_STATE':
      return normalizeStructureState(action.state)

    // Load case actions
    case 'SET_ACTIVE_LOAD_CASE':
      return { ...state, activeLoadCaseId: action.loadCaseId }

    case 'UPDATE_COMBINATION':
      return {
        ...state,
        combinations: state.combinations.map((c) =>
          c.id === action.id ? { ...c, factors: action.factors } : c,
        ),
      }

    default:
      return state
  }
}

// ── Context ──────────────────────────────────────────────────

const StructureStateContext = createContext<StructureState>(initialState)
const StructureDispatchContext = createContext<Dispatch<StructureAction>>(
  () => {},
)

export function StructureProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(structureReducer, initialState)
  return createElement(
    StructureStateContext.Provider,
    { value: state },
    createElement(
      StructureDispatchContext.Provider,
      { value: dispatch },
      children,
    ),
  )
}

export function useStructure() {
  return useContext(StructureStateContext)
}

export function useStructureDispatch() {
  return useContext(StructureDispatchContext)
}

// ── Helpers ──────────────────────────────────────────────────

export function toStructureInput(state: StructureState): StructureInput {
  const base = {
    name: 'Structure',
    steel_grade: state.steelGrade,
    nodes: state.nodes.map((n) => ({
      name: n.name,
      x: n.x,
      y: n.y,
    })),
    supports: state.supports.map((s) => {
      const node = state.nodes.find((n) => n.id === s.nodeId)
      return {
        node_name: node?.name ?? s.nodeId,
        type: s.type,
      }
    }),
    elements: state.elements.map((e) => {
      const ni = state.nodes.find((n) => n.id === e.nodeI)
      const nj = state.nodes.find((n) => n.id === e.nodeJ)
      const release: 'none' | 'start' | 'end' | 'both' | undefined =
        e.role === 'truss_member'
          ? undefined
          : e.releaseStart && e.releaseEnd
            ? 'both'
            : e.releaseStart
              ? 'start'
              : e.releaseEnd
                ? 'end'
                : 'none'
      return {
        name: e.name,
        role: e.role,
        node_i: ni?.name ?? e.nodeI,
        node_j: nj?.name ?? e.nodeJ,
        designation: e.designation,
        release,
      }
    }),
    // Legacy flat loads (kept empty when using combinations)
    udls: [] as { element_name: string; wx: number; wy: number }[],
    point_loads: [] as {
      node_name: string
      fx: number
      fy: number
      mz: number
    }[],
  }

  // Group loads by load case for the combinations path
  const loadCases = state.loadCases.map((lc) => {
    const caseUdls = state.udls
      .filter((u) => u.loadCaseId === lc.id)
      .map((u) => {
        const elem = state.elements.find((e) => e.id === u.elementId)
        return {
          element_name: elem?.name ?? u.elementId,
          wx: u.wx,
          wy: u.wy,
        }
      })

    const casePointLoads = state.pointLoads
      .filter((p) => p.loadCaseId === lc.id)
      .map((p) => {
        const node = state.nodes.find((n) => n.id === p.nodeId)
        return {
          node_name: node?.name ?? p.nodeId,
          fx: p.fx,
          fy: p.fy,
          mz: p.mz,
        }
      })

    return {
      name: lc.name,
      category: lc.category,
      udls: caseUdls,
      point_loads: casePointLoads,
    }
  })

  const combinations = state.combinations.map((c) => {
    // Convert loadCaseId-keyed factors to loadCaseName-keyed factors
    const factors: Record<string, number> = {}
    for (const [lcId, factor] of Object.entries(c.factors)) {
      const lc = state.loadCases.find((l) => l.id === lcId)
      if (lc) {
        factors[lc.name] = factor
      }
    }
    return {
      name: c.name,
      combination_type: c.combinationType,
      factors,
    }
  })

  return {
    ...base,
    load_cases: loadCases,
    combinations,
  }
}
