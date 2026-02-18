// TypeScript types matching backend Pydantic schemas

// ── Request types ────────────────────────────────────────────

export interface NodeInput {
  name: string
  x: number // metres
  y: number // metres
}

export interface SupportInput {
  node_name: string
  type: 'fixed' | 'pinned' | 'roller'
}

export interface ElementInput {
  name: string
  role: 'beam' | 'column' | 'truss_member'
  node_i: string
  node_j: string
  designation: string
  release?: 'none' | 'start' | 'end' | 'both'
}

export interface UDLInput {
  element_name: string
  wx: number // N/m
  wy: number // N/m
}

export interface PointLoadInput {
  node_name: string
  fx: number // N
  fy: number // N
  mz: number // N·m
}

export type LoadCaseCategory = 'G' | 'Q' | 'W' | 'S'

export interface LoadCaseInput {
  name: string
  category: LoadCaseCategory
  udls: UDLInput[]
  point_loads: PointLoadInput[]
}

export interface CombinationInput {
  name: string
  combination_type: 'ULS' | 'SLS'
  factors: Record<string, number>
}

export interface StructureInput {
  name: string
  steel_grade: string
  nodes: NodeInput[]
  supports: SupportInput[]
  elements: ElementInput[]
  udls: UDLInput[]
  point_loads: PointLoadInput[]
  load_cases?: LoadCaseInput[]
  combinations?: CombinationInput[]
}

export interface DiagramRequest {
  structure: StructureInput
  element_name: string
  num_points?: number
}

export interface SectionRectangleInput {
  id: string
  x_mm: number
  y_mm: number
  width_mm: number
  height_mm: number
}

export interface SectionPropertiesRequest {
  units: 'mm'
  rectangles: SectionRectangleInput[]
}

// ── Response types ───────────────────────────────────────────

export interface ReactionOutput {
  node: string
  fx_kN: number
  fy_kN: number
  mz_kNm: number
}

export interface DesignStepOutput {
  step_number: number
  title: string
  ok: boolean
  utilisation: number | null
  details: Record<string, unknown>
}

export interface ElementDesignOutput {
  name: string
  role: string
  designation: string
  length_m: number
  overall_ok: boolean
  max_utilisation: number
  governing_check: string
  steps: DesignStepOutput[]
}

export interface CombinationResultOutput {
  combination_name: string
  combination_type: string
  reactions: ReactionOutput[]
  displacements: Record<string, number[]>
}

export interface AnalysisOutput {
  reactions: ReactionOutput[]
  elements: ElementDesignOutput[]
  all_pass: boolean
  displacements: Record<string, number[]>
  combination_results?: CombinationResultOutput[]
  governing_combinations?: Record<string, string>
}

export interface DiagramOutput {
  element_name: string
  x: number[]
  shear: number[]
  moment: number[]
  deflection: number[]
  axial: number[]
}

export interface SectionInfo {
  designation: string
  series: string
  h_mm: number
  b_mm: number
  tw_mm?: number | null
  tf_mm?: number | null
  t_mm?: number | null
  mass_per_metre: number
  A_cm2: number
  Iy_cm4: number
  Iz_cm4: number
}

export interface SectionPropertiesOutput {
  area_mm2: number
  perimeter_mm: number
  centroid_x_mm: number
  centroid_y_mm: number
  ixx_mm4: number
  iyy_mm4: number
  ixy_mm4: number
  i11_mm4: number
  i22_mm4: number
  phi_deg: number
  rx_mm: number
  ry_mm: number
  j_mm4: number | null
  rectangle_count: number
  warnings: string[]
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface MaterialProps {
  name: string
  E: number
  nu: number
  rho: number
}

export interface LoadTakedownSlab {
  id: string
  type: 'slab'
  name: string
  origin: Vec3
  width: number
  depth: number
  thickness: number
  elevation: number
  material: MaterialProps
}

export interface LoadTakedownColumn {
  id: string
  type: 'column'
  name: string
  base: Vec3
  height: number
  sizeX: number
  sizeY: number
  material: MaterialProps
}

export interface LoadTakedownWall {
  id: string
  type: 'wall'
  name: string
  origin: Vec3
  length: number
  thickness: number
  height: number
  rotationZ: number
  material: MaterialProps
}

export type LoadTakedownElement =
  | LoadTakedownSlab
  | LoadTakedownColumn
  | LoadTakedownWall

export interface LoadTakedownStorey {
  id: string
  name: string
  elevation: number
}

export interface LoadTakedownModel {
  version: '0.1'
  units: 'SI'
  gridSize: number
  storeys: LoadTakedownStorey[]
  elements: LoadTakedownElement[]
  loads: {
    slabDead_kN_m2: number
    slabLive_kN_m2: number
    slabThickness_m: number
    concreteDensity_kN_m3: number
    slabUDL: number // N/m^2, derived for backend compatibility
  }
}

export interface LoadTakedownSummary {
  totalVerticalReaction: number
  totalAppliedLoad: number
}

export interface LoadTakedownColumnResult {
  level_forces: Array<{ elevation: number; N_down: number }>
  id: string
  N_base: number
  Vx_base: number
  Vy_base: number
}

export interface LoadTakedownWallResult {
  id: string
  N_base: number
  Vx_base: number
  Vy_base: number
}

export interface LoadTakedownAnalysisResult {
  summary: LoadTakedownSummary
  columns: LoadTakedownColumnResult[]
  walls: LoadTakedownWallResult[]
  warnings: string[]
}

// ── Client-side state types ──────────────────────────────────

export type ToolType =
  | 'drag'
  | 'select'
  | 'erase'
  | 'node'
  | 'beam'
  | 'column'
  | 'truss'
  | 'support'
  | 'load'

export type SupportType = 'fixed' | 'pinned' | 'roller'

export interface CanvasNode {
  id: string
  name: string
  x: number // metres
  y: number // metres
}

export interface CanvasElement {
  id: string
  name: string
  role: 'beam' | 'column' | 'truss_member'
  nodeI: string // node id
  nodeJ: string // node id
  designation: string
  youngsModulus?: number // N/mm^2
  releaseStart?: boolean
  releaseEnd?: boolean
}

export interface CanvasSupport {
  id: string
  nodeId: string
  type: SupportType
}

export interface CanvasUDL {
  id: string
  elementId: string
  wx: number // N/m
  wy: number // N/m
  loadCaseId: string
}

export interface CanvasPointLoad {
  id: string
  nodeId: string
  fx: number // N
  fy: number // N
  mz: number // N·m
  loadCaseId: string
}

export interface LoadCase {
  id: string
  name: string
  category: LoadCaseCategory
  color: string
}

export interface LoadCombination {
  id: string
  name: string
  combinationType: 'ULS' | 'SLS'
  factors: Record<string, number> // {loadCaseId: factor}
}

export interface StructureState {
  nodes: CanvasNode[]
  elements: CanvasElement[]
  supports: CanvasSupport[]
  udls: CanvasUDL[]
  pointLoads: CanvasPointLoad[]
  steelGrade: string
  selectedTool: ToolType
  selectedId: string | null
  // For two-click element creation
  pendingNodeId: string | null
  nextNodeId: number
  nextElementId: number
  // Load cases and combinations
  loadCases: LoadCase[]
  activeLoadCaseId: string
  combinations: LoadCombination[]
}
