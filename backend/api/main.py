"""FastAPI application — Form & Function structural analysis API."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from calculation import (
    list_hollow_sections,
    list_sections,
    load_hollow_section_data,
    load_section_data,
)
from calculation.load_takedown3d import run_load_takedown
from calculation.load_takedown3d.types import (
    Column,
    LoadTakedownModel,
    MaterialProps,
    Slab,
    Storey,
    Vec3,
    Wall,
)
from calculation.section_properties import (
    SectionRectangle,
    calculate_custom_section_properties,
)
from calculation.designer import ElementRole
from calculation.ec3 import BeamDesignEC3, ColumnDesignEC3, TrussMemberDesignEC3

from .builder import build_and_analyze
from .diagrams import compute_diagrams
from .schemas import (
    AnalysisOutput,
    CombinationResultOutput,
    DesignStepOutput,
    DiagramOutput,
    DiagramRequest,
    ElementDesignOutput,
    LoadTakedownAnalysisOutput,
    LoadTakedownColumnResultOutput,
    LoadTakedownModelInput,
    LoadTakedownSummaryOutput,
    LoadTakedownWallResultOutput,
    ReactionOutput,
    SectionInfo,
    SectionPropertiesOutput,
    SectionPropertiesRequest,
    StructureInput,
)

app = FastAPI(title="Form & Function API", version="0.1.0")


def _cors_origins() -> list[str]:
    raw_origins = os.getenv("CORS_ORIGINS", "")
    parsed = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    if parsed == ["*"]:
        return ["*"]

    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    return [*defaults, *parsed]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Section catalog ───────────────────────────────────────────


@app.get("/api/sections", response_model=list[SectionInfo])
def get_sections(type: str = "all") -> list[SectionInfo]:
    """List available steel sections."""
    results: list[SectionInfo] = []

    if type in ("ub", "uc", "all"):
        series_filter = None if type == "all" else type.upper()
        for designation in list_sections(series_filter):
            try:
                sd = load_section_data(designation)
                s = designation.split()[0] if " " in designation else "UB"
                results.append(
                    SectionInfo(
                        designation=designation,
                        series=s,
                        h_mm=sd.h,
                        b_mm=sd.b,
                        tw_mm=sd.tw,
                        tf_mm=sd.tf,
                        mass_per_metre=sd.mass_per_metre,
                        A_cm2=sd.A,
                        Iy_cm4=sd.Iy,
                        Iz_cm4=sd.Iz,
                    )
                )
            except Exception:
                continue

    if type in ("shs", "rhs", "all"):
        h_series = None if type == "all" else type.upper()
        for designation in list_hollow_sections(h_series):
            try:
                hd = load_hollow_section_data(designation)
                s = hd.section_type if hasattr(hd, "section_type") else "SHS"
                results.append(
                    SectionInfo(
                        designation=designation,
                        series=s,
                        h_mm=hd.h,
                        b_mm=hd.b,
                        t_mm=hd.t,
                        mass_per_metre=hd.mass_per_metre,
                        A_cm2=hd.A,
                        Iy_cm4=hd.Iy,
                        Iz_cm4=hd.Iz,
                    )
                )
            except Exception:
                continue

    return results


# ── Analysis + design ─────────────────────────────────────────


@app.post("/api/analyze", response_model=AnalysisOutput)
def analyze(data: StructureInput) -> AnalysisOutput:
    """Run structural analysis and EC3 design checks."""
    try:
        sd, results, design_results = build_and_analyze(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Build reactions
    reactions = []
    for node_name, (fx, fy, mz) in results.reactions.items():
        reactions.append(
            ReactionOutput(
                node=node_name,
                fx_kN=round(fx / 1e3, 4),
                fy_kN=round(fy / 1e3, 4),
                mz_kNm=round(mz / 1e3, 4),
            )
        )

    # Build displacements (convert m → mm for dx/dy)
    displacements = {}
    for node_name, (dx, dy, rz) in results.displacements.items():
        displacements[node_name] = [
            round(dx * 1e3, 6),
            round(dy * 1e3, 6),
            round(rz, 8),
        ]

    # Build element design outputs
    elements = []
    for name, er in design_results.element_results.items():
        steps = _extract_design_steps(er.design_obj, er.role)
        elements.append(
            ElementDesignOutput(
                name=er.name,
                role=er.role.name.lower(),
                designation=er.designation,
                length_m=round(er.length_m, 4),
                overall_ok=er.overall_ok,
                max_utilisation=round(er.max_utilisation, 4),
                governing_check=er.governing_check,
                steps=steps,
            )
        )

    # Build combination results if present
    combination_results_out = None
    governing_combinations_out = None

    if hasattr(design_results, "_combination_results"):
        combo_results: dict = design_results._combination_results  # type: ignore[attr-defined]
        combo_types: dict = design_results._combo_types  # type: ignore[attr-defined]
        envelope: dict = design_results._envelope  # type: ignore[attr-defined]

        combination_results_out = []
        for combo_name, cr in combo_results.items():
            combo_reactions = []
            for node_name, (fx, fy, mz) in cr.reactions.items():
                combo_reactions.append(
                    ReactionOutput(
                        node=node_name,
                        fx_kN=round(fx / 1e3, 4),
                        fy_kN=round(fy / 1e3, 4),
                        mz_kNm=round(mz / 1e3, 4),
                    )
                )
            combo_displacements = {}
            for node_name, (dx, dy, rz) in cr.displacements.items():
                combo_displacements[node_name] = [
                    round(dx * 1e3, 6),
                    round(dy * 1e3, 6),
                    round(rz, 8),
                ]
            combination_results_out.append(
                CombinationResultOutput(
                    combination_name=combo_name,
                    combination_type=combo_types.get(combo_name, "ULS"),
                    reactions=combo_reactions,
                    displacements=combo_displacements,
                )
            )

        governing_combinations_out = envelope

    return AnalysisOutput(
        reactions=reactions,
        elements=elements,
        all_pass=design_results.all_pass,
        displacements=displacements,
        combination_results=combination_results_out,
        governing_combinations=governing_combinations_out,
    )


# ── Force diagrams ────────────────────────────────────────────


@app.post("/api/diagrams", response_model=DiagramOutput)
def diagrams(data: DiagramRequest) -> DiagramOutput:
    """Compute force diagram data for a specific element."""
    try:
        _, results, _ = build_and_analyze(data.structure)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    if data.element_name not in results.elements:
        raise HTTPException(
            status_code=404, detail=f"Element {data.element_name!r} not found"
        )

    return compute_diagrams(results, data.element_name, data.num_points)


@app.post("/api/section-properties", response_model=SectionPropertiesOutput)
def section_properties(data: SectionPropertiesRequest) -> SectionPropertiesOutput:
    """Compute geometric properties for a custom rectangle-based section."""
    if data.units != "mm":
        raise HTTPException(
            status_code=422, detail="Only 'mm' units are currently supported"
        )

    try:
        props = calculate_custom_section_properties(
            [
                SectionRectangle(
                    id=r.id,
                    x_mm=r.x_mm,
                    y_mm=r.y_mm,
                    width_mm=r.width_mm,
                    height_mm=r.height_mm,
                )
                for r in data.rectangles
            ]
        )
        return SectionPropertiesOutput(**props)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Section property calculation failed: {e}"
        )


@app.post("/api/load-takedown/analyze", response_model=LoadTakedownAnalysisOutput)
def load_takedown_analyze(data: LoadTakedownModelInput) -> LoadTakedownAnalysisOutput:
    """Run columns-first 3D gravity load takedown."""
    try:
        model = _to_load_takedown_model(data)
        result = run_load_takedown(model)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"3D load takedown analysis failed: {e}",
        )

    return LoadTakedownAnalysisOutput(
        summary=LoadTakedownSummaryOutput(
            totalVerticalReaction=round(result.total_vertical_reaction, 6),
            totalAppliedLoad=round(result.total_applied_load, 6),
        ),
        columns=[
            LoadTakedownColumnResultOutput(
                id=c.id,
                N_base=round(c.n_base, 6),
                Vx_base=round(c.vx_base, 6),
                Vy_base=round(c.vy_base, 6),
                level_forces=[
                    LoadTakedownColumnResultOutput.LevelForceOutput(
                        elevation=round(lf.elevation, 6),
                        N_down=round(lf.n_down, 6),
                    )
                    for lf in c.level_forces
                ],
            )
            for c in result.columns
        ],
        walls=[
            LoadTakedownWallResultOutput(
                id=w.id,
                N_base=round(w.n_base, 6),
                Vx_base=round(w.vx_base, 6),
                Vy_base=round(w.vy_base, 6),
            )
            for w in result.walls
        ],
        warnings=result.warnings,
    )


@app.get("/health")
def health() -> dict[str, str]:
    """Lightweight healthcheck for deployment platforms."""
    return {"status": "ok"}


def _to_load_takedown_model(data: LoadTakedownModelInput) -> LoadTakedownModel:
    slabs: list[Slab] = []
    columns: list[Column] = []
    walls: list[Wall] = []

    for elem in data.elements:
        if elem.type == "slab":
            slabs.append(
                Slab(
                    id=elem.id,
                    name=elem.name,
                    origin=Vec3(**elem.origin.model_dump()),
                    width=elem.width,
                    depth=elem.depth,
                    thickness=elem.thickness,
                    elevation=elem.elevation,
                    material=MaterialProps(**elem.material.model_dump()),
                )
            )
        elif elem.type == "column":
            columns.append(
                Column(
                    id=elem.id,
                    name=elem.name,
                    base=Vec3(**elem.base.model_dump()),
                    height=elem.height,
                    size_x=elem.sizeX,
                    size_y=elem.sizeY,
                    material=MaterialProps(**elem.material.model_dump()),
                )
            )
        elif elem.type == "wall":
            walls.append(
                Wall(
                    id=elem.id,
                    name=elem.name,
                    origin=Vec3(**elem.origin.model_dump()),
                    length=elem.length,
                    thickness=elem.thickness,
                    height=elem.height,
                    rotation_z=elem.rotationZ,
                    material=MaterialProps(**elem.material.model_dump()),
                )
            )

    return LoadTakedownModel(
        version=data.version,
        units=data.units,
        grid_size=data.gridSize,
        storeys=[
            Storey(id=s.id, name=s.name, elevation=s.elevation) for s in data.storeys
        ],
        slabs=slabs,
        columns=columns,
        walls=walls,
        slab_udl=data.loads.slabUDL,
    )


# ── PDF report ────────────────────────────────────────────────


@app.post("/api/report")
def report(data: StructureInput):
    """Generate combined PDF report and return as file download."""
    try:
        sd, results, design_results = build_and_analyze(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = Path(tmp_dir) / "report.pdf"
        try:
            sd.generate_report(output_path)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Report generation failed: {e}",
            )

        if not output_path.exists():
            raise HTTPException(
                status_code=500,
                detail="Report generation failed: output file was not created",
            )

        named_tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        final_path = Path(named_tmp.name)
        named_tmp.close()
        final_path.write_bytes(output_path.read_bytes())

    return FileResponse(
        path=str(final_path),
        media_type="application/pdf",
        filename=f"{data.name}_report.pdf",
        background=BackgroundTask(lambda: final_path.unlink(missing_ok=True)),
    )


# ── Design step extraction ────────────────────────────────────


def _safe_round(val: Any, digits: int = 4) -> Any:
    """Round numeric values, pass through others."""
    if isinstance(val, float):
        return round(val, digits)
    return val


def _extract_design_steps(
    design_obj: BeamDesignEC3 | ColumnDesignEC3 | TrussMemberDesignEC3 | None,
    role: ElementRole,
) -> list[DesignStepOutput]:
    """Extract design check steps from a design object."""
    if design_obj is None:
        return []

    if role == ElementRole.BEAM:
        return _beam_steps(design_obj)
    elif role == ElementRole.COLUMN:
        return _column_steps(design_obj)
    elif role == ElementRole.TRUSS_MEMBER:
        return _truss_steps(design_obj)
    return []


def _beam_steps(d: BeamDesignEC3) -> list[DesignStepOutput]:
    return [
        DesignStepOutput(
            step_number=1,
            title="Yield Strength (Table 3.1)",
            ok=True,
            details={"fy_MPa": _safe_round(d.fy), "epsilon": _safe_round(d.epsilon)},
        ),
        DesignStepOutput(
            step_number=2,
            title="Cross-Section Classification (Table 5.2)",
            ok=d.section_class <= 3,
            details={
                "section_class": d.section_class,
                "web_class": d.web_class,
                "flange_class": d.flange_class,
                "c_web": _safe_round(d.c_web),
                "ct_web": _safe_round(d.ct_web),
                "c_flange": _safe_round(d.c_flange),
                "ct_flange": _safe_round(d.ct_flange),
            },
        ),
        DesignStepOutput(
            step_number=3,
            title="Bending Resistance (\u00a76.2.5)",
            ok=d.bending_ok,
            utilisation=_safe_round(d.bending_util),
            details={
                "Wy_cm3": _safe_round(d.Wy / 1e3),
                "Mc_Rd_kNm": _safe_round(d.Mc_Rd),
            },
        ),
        DesignStepOutput(
            step_number=4,
            title="Shear Resistance (\u00a76.2.6)",
            ok=d.shear_ok,
            utilisation=_safe_round(d.shear_util),
            details={
                "Av_cm2": _safe_round(d.Av),
                "Vpl_Rd_kN": _safe_round(d.Vpl_Rd),
            },
        ),
        DesignStepOutput(
            step_number=5,
            title="Shear Buckling (\u00a76.2.7)",
            ok=d.shear_buckling_ok,
            details={
                "hw_tw": _safe_round(d.hw_tw),
                "hw_tw_limit": _safe_round(d.hw_tw_limit),
            },
        ),
        DesignStepOutput(
            step_number=6,
            title="Combined Bending + Shear (\u00a76.2.8)",
            ok=d.combined_ok,
            utilisation=_safe_round(d.combined_util),
            details={
                "low_shear": d.low_shear,
                "rho": _safe_round(d.rho),
                "Mv_Rd_kNm": _safe_round(d.Mv_Rd),
            },
        ),
        DesignStepOutput(
            step_number=7,
            title="Lateral-Torsional Buckling (\u00a76.3.2.3)",
            ok=d.ltb_ok,
            utilisation=_safe_round(d.ltb_util),
            details={
                "Mcr_kNm": _safe_round(d.Mcr) if d.Mcr else None,
                "lambda_LT": _safe_round(d.lambda_LT) if d.lambda_LT else None,
                "chi_LT": _safe_round(d.chi_LT) if d.chi_LT else None,
                "Mb_Rd_kNm": _safe_round(d.Mb_Rd) if d.Mb_Rd else None,
            },
        ),
        DesignStepOutput(
            step_number=8,
            title="Serviceability (Deflection)",
            ok=d.deflection_ok,
            utilisation=_safe_round(d.deflection_util),
            details={
                "delta_limit_mm": _safe_round(d.delta_limit),
                "defl_ratio": d.defl_ratio,
            },
        ),
    ]


def _column_steps(d: ColumnDesignEC3) -> list[DesignStepOutput]:
    return [
        DesignStepOutput(
            step_number=1,
            title="Yield Strength (Table 3.1)",
            ok=True,
            details={"fy_MPa": _safe_round(d.fy), "epsilon": _safe_round(d.epsilon)},
        ),
        DesignStepOutput(
            step_number=2,
            title="Cross-Section Classification (Table 5.2)",
            ok=d.section_class <= 3,
            details={
                "section_class": d.section_class,
                "web_class": d.web_class,
                "flange_class": d.flange_class,
            },
        ),
        DesignStepOutput(
            step_number=3,
            title="Axial Compression Resistance (\u00a76.2.4)",
            ok=True,
            details={"NRd_kN": _safe_round(d.NRd)},
        ),
        DesignStepOutput(
            step_number=4,
            title="Bending Resistance (\u00a76.2.5)",
            ok=True,
            details={
                "My_Rd_kNm": _safe_round(d.My_Rd),
                "Mz_Rd_kNm": _safe_round(d.Mz_Rd),
            },
        ),
        DesignStepOutput(
            step_number=5,
            title="Shear Resistance (\u00a76.2.6)",
            ok=d.shear_ok,
            utilisation=_safe_round(d.shear_util),
            details={
                "Av_cm2": _safe_round(d.Av),
                "Vpl_Rd_kN": _safe_round(d.Vpl_Rd),
            },
        ),
        DesignStepOutput(
            step_number=6,
            title="Conservative Combined (\u00a76.2.1)",
            ok=d.conservative_ok,
            utilisation=_safe_round(d.conservative_util),
        ),
        DesignStepOutput(
            step_number=7,
            title="Alternative Combined (\u00a76.2.9.1)",
            ok=d.alternative_ok,
            utilisation=_safe_round(d.alternative_util),
            details={
                "MN_y_Rd_kNm": _safe_round(d.MN_y_Rd),
                "MN_z_Rd_kNm": _safe_round(d.MN_z_Rd),
            },
        ),
        DesignStepOutput(
            step_number=8,
            title="Flexural Buckling (\u00a76.3.1)",
            ok=d.Nb_Rd > 0,
            details={
                "chi_y": _safe_round(d.chi_y),
                "chi_z": _safe_round(d.chi_z),
                "Nb_Rd_kN": _safe_round(d.Nb_Rd),
                "curve_y": d.curve_y,
                "curve_z": d.curve_z,
            },
        ),
        DesignStepOutput(
            step_number=9,
            title="Lateral-Torsional Buckling (\u00a76.3.2)",
            ok=True,
            details={
                "Mcr_kNm": _safe_round(d.Mcr) if d.Mcr else None,
                "chi_LT": _safe_round(d.chi_LT),
                "Mb_Rd_kNm": _safe_round(d.Mb_Rd),
            },
        ),
        DesignStepOutput(
            step_number=10,
            title="Combined Buckling — Annex A (\u00a76.3.3)",
            ok=d.combined_buckling_ok,
            utilisation=max(_safe_round(d.eq6_61), _safe_round(d.eq6_62)),
            details={
                "eq6_61": _safe_round(d.eq6_61),
                "eq6_62": _safe_round(d.eq6_62),
                "Cmy": _safe_round(d.Cmy),
                "Cmz": _safe_round(d.Cmz),
                "CmLT": _safe_round(d.CmLT),
                "kyy": _safe_round(d.kyy),
                "kyz": _safe_round(d.kyz),
                "kzy": _safe_round(d.kzy),
                "kzz": _safe_round(d.kzz),
            },
        ),
    ]


def _truss_steps(d: TrussMemberDesignEC3) -> list[DesignStepOutput]:
    return [
        DesignStepOutput(
            step_number=1,
            title="Yield Strength (Table 3.1)",
            ok=True,
            details={"fy_MPa": _safe_round(d.fy), "epsilon": _safe_round(d.epsilon)},
        ),
        DesignStepOutput(
            step_number=2,
            title="Cross-Section Classification",
            ok=d.section_class <= 3,
            details={"section_class": d.section_class},
        ),
        DesignStepOutput(
            step_number=3,
            title="Cross-Section Resistance (\u00a76.2.4)",
            ok=True,
            details={"NRd_kN": _safe_round(d.NRd)},
        ),
        DesignStepOutput(
            step_number=4,
            title="Flexural Buckling (\u00a76.3.1)",
            ok=True,
            details={
                "chi": _safe_round(d.chi),
                "Nb_Rd_kN": _safe_round(d.Nb_Rd),
                "lambda_bar": _safe_round(d.lambda_bar),
            },
        ),
        DesignStepOutput(
            step_number=5,
            title="Compression Check",
            ok=d.compression_ok,
            utilisation=_safe_round(d.compression_util),
        ),
        DesignStepOutput(
            step_number=6,
            title="Tension Resistance (\u00a76.2.3)",
            ok=True,
            details={"Nt_Rd_kN": _safe_round(d.Nt_Rd)},
        ),
        DesignStepOutput(
            step_number=7,
            title="Tension Check",
            ok=d.tension_ok,
            utilisation=_safe_round(d.tension_util),
        ),
    ]
