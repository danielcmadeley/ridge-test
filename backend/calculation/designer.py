"""StructureDesigner — unified 2D analysis + EC3 design."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum, auto
from pathlib import Path
from typing import Any

from .catalog import load_hollow_section_data, load_section, load_section_data
from .ec3 import BeamDesignEC3, ColumnDesignEC3, TrussMemberDesignEC3
from .ec3.hollow_section_data import HollowSectionData
from .ec3.section_data import SteelSectionData
from .element import FrameElement, ReleaseType, TrussElement
from .material import Material
from .model import Model
from .node import Node
from .results import AnalysisResults
from .section import Section
from .support import Support, SupportType


class ElementRole(Enum):
    BEAM = auto()
    COLUMN = auto()
    TRUSS_MEMBER = auto()


class SwayMode(Enum):
    SWAY_PREVENTED = auto()
    SWAY = auto()


@dataclass
class ElementDesignConfig:
    name: str
    role: ElementRole
    designation: str
    node_i_name: str
    node_j_name: str
    # Buckling length overrides (None = auto-compute)
    Lcr_y_override: float | None = None
    Lcr_z_override: float | None = None
    # Beam-specific
    restraint_positions: list[float] | None = None
    deflection_limit_type: str = "other"
    # Column-specific
    sway_mode: SwayMode = SwayMode.SWAY_PREVENTED
    connection_i: str = "continuous"
    connection_j: str = "continuous"
    # Truss-specific
    buckling_curve: str = "a"


@dataclass
class ElementDesignResult:
    name: str
    role: ElementRole
    designation: str
    length_m: float
    overall_ok: bool
    max_utilisation: float
    governing_check: str
    design_obj: BeamDesignEC3 | ColumnDesignEC3 | TrussMemberDesignEC3 | None = None


@dataclass
class StructureDesignResults:
    structure_name: str
    steel_grade: str
    analysis_results: AnalysisResults
    element_results: dict[str, ElementDesignResult] = field(default_factory=dict)
    plot_paths: dict[str, Path] = field(default_factory=dict)
    all_pass: bool = False

    def summary_table(self) -> list[dict[str, Any]]:
        rows = []
        for name, r in self.element_results.items():
            rows.append(
                {
                    "name": name,
                    "role": r.role.name.lower(),
                    "designation": r.designation,
                    "length_m": round(r.length_m, 2),
                    "governing_check": r.governing_check,
                    "utilisation": round(r.max_utilisation, 3),
                    "ok": r.overall_ok,
                }
            )
        return rows


_SUPPORT_MAP: dict[str, SupportType] = {
    "fixed": SupportType.FIXED,
    "pinned": SupportType.PINNED,
    "roller": SupportType.ROLLER_X,
    "roller_x": SupportType.ROLLER_X,
    "roller_y": SupportType.ROLLER_Y,
}

_RELEASE_MAP: dict[str, ReleaseType] = {
    "none": ReleaseType.NONE,
    "start": ReleaseType.START,
    "end": ReleaseType.END,
    "both": ReleaseType.BOTH,
}


# ── Effective length factors ──────────────────────────────────────

_EFF_LENGTH_SWAY_PREVENTED = {
    ("fixed", "fixed"): 0.7,
    ("fixed", "pinned"): 0.85,
    ("pinned", "fixed"): 0.85,
    ("pinned", "pinned"): 1.0,
}

_EFF_LENGTH_SWAY = {
    ("fixed", "fixed"): 1.2,
    ("fixed", "pinned"): 1.5,
    ("pinned", "fixed"): 1.5,
    ("pinned", "pinned"): 2.0,
}


class StructureDesigner:
    """High-level API for 2D structural analysis + EC3 design."""

    def __init__(self, name: str = "Structure", steel_grade: str = "S355") -> None:
        self.name = name
        self.steel_grade = steel_grade
        self._model = Model(name)
        self._configs: dict[str, ElementDesignConfig] = {}
        self._results: AnalysisResults | None = None
        self._design_results: StructureDesignResults | None = None
        self._plot_paths: dict[str, Path] | None = None

    # ── Nodes ────────────────────────────────────────────────────

    def add_node(self, name: str, x: float, y: float) -> Node:
        return self._model.add_node(name, x, y)

    # ── Supports ─────────────────────────────────────────────────

    def add_support(self, node: Node, type_str: str) -> Support:
        key = type_str.lower().strip()
        st = _SUPPORT_MAP.get(key)
        if st is None:
            raise ValueError(
                f"Unknown support type {type_str!r}. "
                f"Use one of: {', '.join(_SUPPORT_MAP)}"
            )
        return self._model.add_support(node, st)

    # ── Frame elements ───────────────────────────────────────────

    def add_beam(
        self,
        name: str,
        node_i: Node,
        node_j: Node,
        designation: str,
        *,
        release: str = "none",
        restraint_positions: list[float] | None = None,
        deflection_limit_type: str = "other",
        Lcr_y_override: float | None = None,
        Lcr_z_override: float | None = None,
    ) -> FrameElement:
        section = load_section(designation)
        release_type = _RELEASE_MAP.get(release.lower().strip(), ReleaseType.NONE)
        elem = self._model.add_frame_element(
            name, node_i, node_j, section, release=release_type
        )
        span = math.hypot(node_j.x - node_i.x, node_j.y - node_i.y)
        if restraint_positions is None:
            restraint_positions = [0.0, span]
        self._configs[name] = ElementDesignConfig(
            name=name,
            role=ElementRole.BEAM,
            designation=designation,
            node_i_name=node_i.name,
            node_j_name=node_j.name,
            restraint_positions=restraint_positions,
            deflection_limit_type=deflection_limit_type,
            Lcr_y_override=Lcr_y_override,
            Lcr_z_override=Lcr_z_override,
        )
        return elem

    def add_column(
        self,
        name: str,
        node_i: Node,
        node_j: Node,
        designation: str,
        *,
        release: str = "none",
        sway_mode: SwayMode = SwayMode.SWAY_PREVENTED,
        connection_i: str = "continuous",
        connection_j: str = "continuous",
        Lcr_y_override: float | None = None,
        Lcr_z_override: float | None = None,
    ) -> FrameElement:
        section = load_section(designation)
        release_type = _RELEASE_MAP.get(release.lower().strip(), ReleaseType.NONE)
        elem = self._model.add_frame_element(
            name, node_i, node_j, section, release=release_type
        )
        self._configs[name] = ElementDesignConfig(
            name=name,
            role=ElementRole.COLUMN,
            designation=designation,
            node_i_name=node_i.name,
            node_j_name=node_j.name,
            sway_mode=sway_mode,
            connection_i=connection_i,
            connection_j=connection_j,
            Lcr_y_override=Lcr_y_override,
            Lcr_z_override=Lcr_z_override,
        )
        return elem

    def add_truss_member(
        self,
        name: str,
        node_i: Node,
        node_j: Node,
        designation: str,
        *,
        buckling_curve: str = "a",
        Lcr_y_override: float | None = None,
        Lcr_z_override: float | None = None,
    ) -> TrussElement:
        hsd = load_hollow_section_data(designation)
        E = 210e9  # Pa
        A = hsd.A * 1e-4  # cm² → m²
        mat = self._model.add_material(name, E=E, A=A)
        elem = self._model.add_truss_element(name, node_i, node_j, mat)
        self._configs[name] = ElementDesignConfig(
            name=name,
            role=ElementRole.TRUSS_MEMBER,
            designation=designation,
            node_i_name=node_i.name,
            node_j_name=node_j.name,
            buckling_curve=buckling_curve,
            Lcr_y_override=Lcr_y_override,
            Lcr_z_override=Lcr_z_override,
        )
        return elem

    # ── Loads ─────────────────────────────────────────────────────

    def add_udl(self, elem_name: str, wx: float = 0.0, wy: float = 0.0) -> None:
        elem = self._model.elements[elem_name]
        if not isinstance(elem, FrameElement):
            raise TypeError(f"{elem_name!r} is not a frame element")
        self._model.add_distributed_load(elem, wx=wx, wy=wy)

    def add_point_load(
        self, node: Node, fx: float = 0.0, fy: float = 0.0, mz: float = 0.0
    ) -> None:
        self._model.add_nodal_load(node, fx=fx, fy=fy, mz=mz)

    def add_point_load_on_element(
        self,
        elem_name: str,
        py: float = 0.0,
        px: float = 0.0,
        x_ratio: float = 0.5,
    ) -> None:
        elem = self._model.elements[elem_name]
        if not isinstance(elem, FrameElement):
            raise TypeError(f"{elem_name!r} is not a frame element")
        self._model.add_point_load_on_element(elem, py=py, px=px, x_ratio=x_ratio)

    # ── Analysis ─────────────────────────────────────────────────

    def analyze(self, include_self_weight: bool = True) -> AnalysisResults:
        self._results = self._model.analyze(include_self_weight=include_self_weight)
        return self._results

    # ── Plotting ─────────────────────────────────────────────────

    def plot_all(self, output_dir: str | Path = "output") -> dict[str, Path]:
        try:
            paths = self._model.plot_all(output_dir=output_dir, renderer="plotly")
        except Exception as exc:
            print(f"  Plotly export unavailable, falling back to matplotlib: {exc}")
            paths = self._model.plot_all(output_dir=output_dir, renderer="matplotlib")
        names = ["model", "loads", "deformation", "axial", "shear", "moment"]
        self._plot_paths = {n: p for n, p in zip(names, paths)}
        return self._plot_paths

    # ── Design ───────────────────────────────────────────────────

    def design_all(self) -> StructureDesignResults:
        if self._results is None:
            raise RuntimeError("Call analyze() before design_all()")

        results = StructureDesignResults(
            structure_name=self.name,
            steel_grade=self.steel_grade,
            analysis_results=self._results,
        )

        for name, cfg in self._configs.items():
            if cfg.role == ElementRole.BEAM:
                r = self._design_beam(cfg)
            elif cfg.role == ElementRole.COLUMN:
                r = self._design_column(cfg)
            elif cfg.role == ElementRole.TRUSS_MEMBER:
                r = self._design_truss_member(cfg)
            else:
                continue
            results.element_results[name] = r

        results.all_pass = all(r.overall_ok for r in results.element_results.values())
        self._design_results = results
        return results

    def _elem_length(self, cfg: ElementDesignConfig) -> float:
        ni = self._model.nodes[cfg.node_i_name]
        nj = self._model.nodes[cfg.node_j_name]
        return math.hypot(nj.x - ni.x, nj.y - ni.y)

    # ── Beam design ──────────────────────────────────────────────

    def _design_beam(self, cfg: ElementDesignConfig) -> ElementDesignResult:
        assert self._results is not None
        sd = load_section_data(cfg.designation)
        span = self._elem_length(cfg)

        shear_at_i, moment_at_i, w_local = self._results.force_distribution(cfg.name)
        defl_mm, _ = self._results.max_deflection(cfg.name)

        design = BeamDesignEC3(
            section_data=sd,
            steel_grade=self.steel_grade,
            delta_max=abs(defl_mm),
            span=span,
            shear_at_i=shear_at_i,
            moment_at_i=moment_at_i,
            w_local=w_local,
            restraint_positions=cfg.restraint_positions,
            load_position="top_flange",
            deflection_limit_type=cfg.deflection_limit_type,
        )
        design.check_all()

        utils = [
            ("bending", design.bending_util),
            ("shear", design.shear_util),
            ("combined", design.combined_util),
            ("LTB", design.ltb_util),
            ("deflection", design.deflection_util),
        ]
        governing = max(utils, key=lambda x: x[1])

        return ElementDesignResult(
            name=cfg.name,
            role=ElementRole.BEAM,
            designation=cfg.designation,
            length_m=span,
            overall_ok=design.overall_ok,
            max_utilisation=governing[1],
            governing_check=governing[0],
            design_obj=design,
        )

    # ── Column design ────────────────────────────────────────────

    def _design_column(self, cfg: ElementDesignConfig) -> ElementDesignResult:
        assert self._results is not None
        sd = load_section_data(cfg.designation)
        L = self._elem_length(cfg)

        # Determine buckling length
        if cfg.Lcr_y_override is not None:
            Lcr_y = cfg.Lcr_y_override
        else:
            Lcr_y = self._auto_buckling_length(L, cfg)
        if cfg.Lcr_z_override is not None:
            Lcr_z = cfg.Lcr_z_override
        else:
            Lcr_z = self._auto_buckling_length(L, cfg)

        # Extract forces from analysis
        forces = self._results.element_forces[cfg.name]
        N_i, V_i, M_i, N_j, V_j, M_j = forces
        M_i = -M_i  # negate OpenSees M_i for internal moment convention

        # Axial: compression is positive for ColumnDesignEC3
        # element_forces[0] = N_i in local coords (tension positive → flip sign)
        NEd = abs(N_i) / 1e3  # kN

        # Moments at ends (take max absolute)
        M_i_abs = abs(M_i) / 1e3  # kNm
        M_j_abs = abs(M_j) / 1e3  # kNm
        My_Ed = max(M_i_abs, M_j_abs)

        # Shear
        max_shear_N, _ = self._results.max_shear(cfg.name)
        VEd = abs(max_shear_N) / 1e3  # kN

        # psi_y: ratio of smaller to larger moment
        if M_i_abs > 1e-6 or M_j_abs > 1e-6:
            if M_i_abs >= M_j_abs:
                M_max, M_min = M_i, M_j
            else:
                M_max, M_min = M_j, M_i
            # Same sign = single curvature (psi > 0), opposite = double (psi < 0)
            if abs(M_max) > 1e-6:
                psi_y = M_min / M_max
            else:
                psi_y = 1.0
        else:
            psi_y = 1.0

        design = ColumnDesignEC3(
            section_data=sd,
            steel_grade=self.steel_grade,
            NEd=NEd,
            My_Ed=My_Ed,
            Mz_Ed=0.0,  # 2D analysis
            VEd=VEd,
            Lcr_y=Lcr_y,
            Lcr_z=Lcr_z,
            psi_y=psi_y,
            psi_z=1.0,
        )
        design.check_all()

        # Governing utilisation
        utils = [
            ("shear", design.shear_util),
            ("conservative combined", design.conservative_util),
            ("alternative combined", design.alternative_util),
        ]
        if design.Nb_Rd > 0:
            utils.append(("flexural buckling", NEd / design.Nb_Rd))
        utils.append(("Eq.6.61", design.eq6_61))
        utils.append(("Eq.6.62", design.eq6_62))
        governing = max(utils, key=lambda x: x[1])

        return ElementDesignResult(
            name=cfg.name,
            role=ElementRole.COLUMN,
            designation=cfg.designation,
            length_m=L,
            overall_ok=design.overall_ok,
            max_utilisation=governing[1],
            governing_check=governing[0],
            design_obj=design,
        )

    def _auto_buckling_length(self, L: float, cfg: ElementDesignConfig) -> float:
        """Compute effective buckling length from end conditions."""
        cond_i = self._end_condition(cfg.node_i_name, cfg.connection_i)
        cond_j = self._end_condition(cfg.node_j_name, cfg.connection_j)
        key = (cond_i, cond_j)

        if cfg.sway_mode == SwayMode.SWAY:
            table = _EFF_LENGTH_SWAY
        else:
            table = _EFF_LENGTH_SWAY_PREVENTED

        factor = table.get(key, 1.0)
        return factor * L

    def _end_condition(self, node_name: str, connection_type: str) -> str:
        """Determine 'fixed' or 'pinned' for a node."""
        for sup in self._model._supports:
            if sup.node.name == node_name:
                if sup.support_type == SupportType.FIXED:
                    return "fixed"
                else:
                    return "pinned"
        # No support — connection type governs
        if connection_type == "continuous":
            return "fixed"
        return "pinned"

    # ── Truss member design ──────────────────────────────────────

    def _design_truss_member(self, cfg: ElementDesignConfig) -> ElementDesignResult:
        assert self._results is not None
        hsd = load_hollow_section_data(cfg.designation)
        L = self._elem_length(cfg)

        N = self._results.axial_force(cfg.name)  # positive = tension
        NEd_compression = abs(N) / 1e3 if N < 0 else 0.0
        NEd_tension = N / 1e3 if N > 0 else 0.0

        Lcr_ip = cfg.Lcr_y_override if cfg.Lcr_y_override is not None else 0.9 * L
        Lcr_oop = cfg.Lcr_z_override if cfg.Lcr_z_override is not None else L

        design = TrussMemberDesignEC3(
            section_data=hsd,
            steel_grade=self.steel_grade,
            NEd_compression=NEd_compression,
            NEd_tension=NEd_tension,
            Lcr_ip=Lcr_ip,
            Lcr_oop=Lcr_oop,
            buckling_curve=cfg.buckling_curve,
        )
        design.check_all()

        utils = [
            ("compression", design.compression_util),
            ("tension", design.tension_util),
        ]
        governing = max(utils, key=lambda x: x[1])

        return ElementDesignResult(
            name=cfg.name,
            role=ElementRole.TRUSS_MEMBER,
            designation=cfg.designation,
            length_m=L,
            overall_ok=design.overall_ok,
            max_utilisation=governing[1],
            governing_check=governing[0],
            design_obj=design,
        )

    # ── Report ───────────────────────────────────────────────────

    def generate_report(
        self,
        output_path: str | Path,
        *,
        logo_path: str | Path | None = None,
        project_title: str = "",
        job_no: str = "",
        calcs_for: str = "",
        calcs_by: str = "",
        checked_by: str = "",
        approved_by: str = "",
    ) -> Path:
        if self._results is None:
            raise RuntimeError("Call analyze() before generate_report()")
        if self._design_results is None:
            raise RuntimeError("Call design_all() before generate_report()")

        # Ensure plots exist
        if self._plot_paths is None:
            out_dir = Path(output_path).parent / "plots"
            self.plot_all(out_dir)

        from .combined_report import generate_combined_report

        return generate_combined_report(
            design_results=self._design_results,
            model=self._model,
            plot_paths=self._plot_paths or {},
            output_path=output_path,
            logo_path=logo_path,
            project_title=project_title,
            job_no=job_no,
            calcs_for=calcs_for,
            calcs_by=calcs_by,
            checked_by=checked_by,
            approved_by=approved_by,
        )

    # ── Printing ─────────────────────────────────────────────────

    def print_summary(self) -> None:
        if self._design_results is None:
            print("No design results. Call design_all() first.")
            return

        rows = self._design_results.summary_table()
        print(f"\n{'=' * 90}")
        print(f"  Design Summary — {self.name} ({self.steel_grade})")
        print(f"{'=' * 90}")
        print(
            f"{'Element':<12} {'Role':<8} {'Designation':<18} "
            f"{'L (m)':>6} {'Governing':<22} {'Util':>6} {'Status':>6}"
        )
        print("-" * 90)
        for row in rows:
            status = "PASS" if row["ok"] else "FAIL"
            print(
                f"{row['name']:<12} {row['role']:<8} {row['designation']:<18} "
                f"{row['length_m']:>6.2f} {row['governing_check']:<22} "
                f"{row['utilisation']:>6.3f} {status:>6}"
            )
        print("-" * 90)
        all_ok = self._design_results.all_pass
        print(f"  Overall: {'ALL PASS' if all_ok else 'SOME FAIL'}")
        print(f"{'=' * 90}\n")
