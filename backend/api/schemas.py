"""Pydantic request/response models for the API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


# ── Request Models ────────────────────────────────────────────


class NodeInput(BaseModel):
    name: str
    x: float  # metres
    y: float  # metres


class SupportInput(BaseModel):
    node_name: str
    type: Literal["fixed", "pinned", "roller"]


class ElementInput(BaseModel):
    name: str
    role: Literal["beam", "column", "truss_member"]
    node_i: str  # node name
    node_j: str  # node name
    designation: str  # e.g. "UB 457x191x67"
    release: Literal["none", "start", "end", "both"] = "none"


class UDLInput(BaseModel):
    element_name: str
    wx: float = 0.0  # N/m
    wy: float = 0.0  # N/m


class PointLoadInput(BaseModel):
    node_name: str
    fx: float = 0.0  # N
    fy: float = 0.0  # N
    mz: float = 0.0  # N·m


class LoadCaseInput(BaseModel):
    name: str  # e.g. "Permanent (G)"
    category: Literal["G", "Q", "W", "S"]
    udls: list[UDLInput] = []
    point_loads: list[PointLoadInput] = []


class CombinationInput(BaseModel):
    name: str  # e.g. "ULS 6.10b (Q leading)"
    combination_type: Literal["ULS", "SLS"]
    factors: dict[str, float]  # {case_name: factor}


class StructureInput(BaseModel):
    name: str = "Structure"
    steel_grade: str = "S355"
    nodes: list[NodeInput]
    supports: list[SupportInput]
    elements: list[ElementInput]
    udls: list[UDLInput] = []
    point_loads: list[PointLoadInput] = []
    # Load combinations (optional — when absent, legacy flat-load path is used)
    load_cases: list[LoadCaseInput] | None = None
    combinations: list[CombinationInput] | None = None


class DiagramRequest(BaseModel):
    structure: StructureInput
    element_name: str
    num_points: int = 101


class SectionRectangleInput(BaseModel):
    id: str
    x_mm: float
    y_mm: float
    width_mm: float
    height_mm: float


class SectionPropertiesRequest(BaseModel):
    units: Literal["mm"] = "mm"
    rectangles: list[SectionRectangleInput]


class Vec3Input(BaseModel):
    x: float
    y: float
    z: float


class MaterialPropsInput(BaseModel):
    name: str
    E: float
    nu: float
    rho: float


class LoadTakedownSlabInput(BaseModel):
    id: str
    type: Literal["slab"]
    name: str
    origin: Vec3Input
    width: float
    depth: float
    thickness: float
    elevation: float
    material: MaterialPropsInput


class LoadTakedownColumnInput(BaseModel):
    id: str
    type: Literal["column"]
    name: str
    base: Vec3Input
    height: float
    sizeX: float
    sizeY: float
    material: MaterialPropsInput


class LoadTakedownWallInput(BaseModel):
    id: str
    type: Literal["wall"]
    name: str
    origin: Vec3Input
    length: float
    thickness: float
    height: float
    rotationZ: float
    material: MaterialPropsInput


class StoreyInput(BaseModel):
    id: str
    name: str
    elevation: float


class LoadTakedownLoadsInput(BaseModel):
    slabUDL: float


class LoadTakedownModelInput(BaseModel):
    version: Literal["0.1"]
    units: Literal["SI"]
    gridSize: float
    storeys: list[StoreyInput] = []
    elements: list[
        LoadTakedownSlabInput | LoadTakedownColumnInput | LoadTakedownWallInput
    ]
    loads: LoadTakedownLoadsInput


# ── Response Models ───────────────────────────────────────────


class ReactionOutput(BaseModel):
    node: str
    fx_kN: float
    fy_kN: float
    mz_kNm: float


class DesignStepOutput(BaseModel):
    step_number: int
    title: str
    ok: bool
    utilisation: float | None = None
    details: dict[str, Any] = {}


class ElementDesignOutput(BaseModel):
    name: str
    role: str
    designation: str
    length_m: float
    overall_ok: bool
    max_utilisation: float
    governing_check: str
    steps: list[DesignStepOutput] = []


class CombinationResultOutput(BaseModel):
    combination_name: str
    combination_type: str
    reactions: list[ReactionOutput]
    displacements: dict[str, list[float]]


class AnalysisOutput(BaseModel):
    reactions: list[ReactionOutput]
    elements: list[ElementDesignOutput]
    all_pass: bool
    displacements: dict[str, list[float]]  # node_name → [dx_mm, dy_mm, rz_rad]
    combination_results: list[CombinationResultOutput] | None = None
    governing_combinations: dict[str, str] | None = None


class DiagramOutput(BaseModel):
    element_name: str
    x: list[float]  # positions along element (m)
    shear: list[float]  # V(x) in kN
    moment: list[float]  # M(x) in kNm
    deflection: list[float]  # δ(x) in mm
    axial: list[float]  # N(x) in kN


class SectionInfo(BaseModel):
    designation: str
    series: str  # "UB", "UC", "SHS", "RHS"
    h_mm: float
    b_mm: float
    tw_mm: float | None = None
    tf_mm: float | None = None
    t_mm: float | None = None
    mass_per_metre: float
    A_cm2: float
    Iy_cm4: float
    Iz_cm4: float


class SectionPropertiesOutput(BaseModel):
    area_mm2: float
    perimeter_mm: float
    centroid_x_mm: float
    centroid_y_mm: float
    ixx_mm4: float
    iyy_mm4: float
    ixy_mm4: float
    i11_mm4: float
    i22_mm4: float
    phi_deg: float
    rx_mm: float
    ry_mm: float
    j_mm4: float | None = None
    rectangle_count: int
    warnings: list[str] = []


class LoadTakedownSummaryOutput(BaseModel):
    totalVerticalReaction: float
    totalAppliedLoad: float


class LoadTakedownColumnResultOutput(BaseModel):
    class LevelForceOutput(BaseModel):
        elevation: float
        N_down: float

    id: str
    N_base: float
    Vx_base: float
    Vy_base: float
    level_forces: list[LevelForceOutput] = []


class LoadTakedownWallResultOutput(BaseModel):
    id: str
    N_base: float
    Vx_base: float
    Vy_base: float


class LoadTakedownAnalysisOutput(BaseModel):
    summary: LoadTakedownSummaryOutput
    columns: list[LoadTakedownColumnResultOutput]
    walls: list[LoadTakedownWallResultOutput]
    warnings: list[str] = []
