"""Eurocode 3 beam design checks (EN 1993-1-1:2005).

Implements Steps 1-9 of the beam design workflow:
  1. Yield strength
  2. Cross-section classification
  3. Bending resistance
  4. Shear resistance
  5. Shear buckling
  6. Combined bending + shear
  8. Lateral torsional buckling (LTB) — rolled sections method (§6.3.2.3)
  9. Serviceability (deflection)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .section_data import SteelSectionData

# ── Constants ────────────────────────────────────────────────────────────
E_STEEL = 210_000.0  # N/mm²
G_STEEL = 80_770.0   # N/mm²
GAMMA_M0 = 1.0       # EN 1993-1-1 §6.1 NOTE 2B
GAMMA_M1 = 1.0       # EN 1993-1-1 §6.1 NOTE 2B


# ── Yield strength table (EN 1993-1-1 Table 3.1) ────────────────────────
_FY_TABLE: dict[str, list[tuple[float, float]]] = {
    "S235": [(16, 235), (40, 225), (63, 215), (80, 215), (999, 195)],
    "S275": [(16, 275), (40, 265), (63, 255), (80, 245), (999, 235)],
    "S355": [(16, 355), (40, 345), (63, 335), (80, 325), (999, 315)],
    "S450": [(16, 440), (40, 430), (63, 410), (80, 390), (999, 380)],
}


def _get_fy(grade: str, tf_mm: float) -> float:
    grade = grade.upper()
    if grade not in _FY_TABLE:
        raise ValueError(f"Unknown steel grade '{grade}'. Use S235/S275/S355/S450.")
    for max_t, fy in _FY_TABLE[grade]:
        if tf_mm <= max_t:
            return fy
    return _FY_TABLE[grade][-1][1]


# ── LTB buckling curves ─────────────────────────────────────────────────
_ALPHA_LT = {"a": 0.21, "b": 0.34, "c": 0.49, "d": 0.76}


@dataclass
class LTBSegment:
    """Results for one unrestrained segment of the LTB check."""

    start_m: float
    end_m: float
    L_mm: float
    MEd_seg: float   # kNm — max absolute moment in segment
    C1: float
    kc: float
    Mcr: float       # kNm
    lambda_LT: float
    Phi_LT: float
    chi_LT: float
    f_mod: float
    chi_LT_mod: float
    Mb_Rd: float     # kNm
    util: float
    ok: bool


@dataclass
class BeamDesignEC3:
    """EC3 beam design checks for a steel beam element.

    For **segment-based LTB**, supply the internal force distribution
    (``shear_at_i``, ``moment_at_i``, ``w_local``) together with
    ``restraint_positions``.  The class will automatically compute
    ``MEd``, ``VEd``, and per-segment LTB checks.

    If those are omitted the class falls back to a single-segment
    check using the explicit ``MEd``, ``VEd``, ``Lcr`` values.
    """

    section_data: SteelSectionData
    steel_grade: str = "S275"

    # Design forces (auto-computed when force distribution is given)
    MEd: float = 0.0       # kNm
    VEd: float = 0.0       # kN
    delta_max: float = 0.0  # mm
    span: float = 0.0       # m

    # Force distribution for segment-based LTB
    # (V(x)=shear_at_i+w_local*x, M(x)=moment_at_i+shear_at_i*x+w_local*x²/2)
    shear_at_i: float = 0.0    # N   — eleForce[1]
    moment_at_i: float = 0.0   # N·m — eleForce[2]
    w_local: float = 0.0       # N/m — total distributed load (local coords)

    # Lateral restraints (list of positions in m from node i; must include
    # 0 and span). If None → single segment of length Lcr.
    restraint_positions: list[float] | None = None

    # Fallback for single-segment mode
    Lcr: float | None = None
    C1: float = 1.132
    C2: float = 0.459

    load_position: str = "top_flange"
    deflection_limit_type: str = "other"

    # ── results populated by check_all() ─────────────────────────────
    fy: float = 0.0
    epsilon: float = 0.0

    c_web: float = 0.0
    ct_web: float = 0.0
    web_class: int = 0
    c_flange: float = 0.0
    ct_flange: float = 0.0
    flange_class: int = 0
    section_class: int = 0

    Wy: float = 0.0
    Mc_Rd: float = 0.0
    bending_util: float = 0.0
    bending_ok: bool = False

    Av: float = 0.0
    Vpl_Rd: float = 0.0
    shear_util: float = 0.0
    shear_ok: bool = False

    hw_tw: float = 0.0
    hw_tw_limit: float = 0.0
    shear_buckling_ok: bool = False

    rho: float = 0.0
    Mv_Rd: float = 0.0
    combined_util: float = 0.0
    combined_ok: bool = False
    low_shear: bool = False

    # LTB — rolled-sections method §6.3.2.3
    beta_LT: float = 0.75
    lambda_LT_0: float = 0.4
    zg: float = 0.0
    Iw_mm6: float = 0.0
    buckling_curve: str = ""
    alpha_LT: float = 0.0

    # governing segment results (copied for easy access / template)
    Mcr: float = 0.0
    lambda_LT: float = 0.0
    Phi_LT: float = 0.0
    chi_LT: float = 0.0
    kc: float = 0.0
    f_mod: float = 0.0
    chi_LT_mod: float = 0.0
    Mb_Rd: float = 0.0
    ltb_util: float = 0.0
    ltb_ok: bool = False
    ltb_segments: list[LTBSegment] = field(default_factory=list)
    governing_seg_idx: int = 0

    delta_limit: float = 0.0
    defl_ratio: float = 0.0
    deflection_util: float = 0.0
    deflection_ok: bool = False

    overall_ok: bool = False

    # ──────────────────────────────────────────────────────────────────
    def __post_init__(self) -> None:
        if self.Lcr is None:
            self.Lcr = self.span

        has_dist = (
            self.shear_at_i != 0.0
            or self.moment_at_i != 0.0
            or self.w_local != 0.0
        )
        if has_dist:
            # Auto-compute MEd / VEd from the force distribution
            best_M = 0.0
            best_V = 0.0
            for k in range(101):
                x = k / 100 * self.span
                M = abs(self._M_at(x))
                V = abs(self._V_at(x))
                if M > best_M:
                    best_M = M
                if V > best_V:
                    best_V = V
            self.MEd = best_M / 1e3  # N·m → kNm
            self.VEd = best_V / 1e3  # N   → kN

        if self.restraint_positions is None:
            self.restraint_positions = [0.0, self.span]

    # ── helpers: internal forces at position x (m from node i) ───────
    def _M_at(self, x: float) -> float:
        """Bending moment at *x* m from node i (N·m)."""
        return self.moment_at_i + self.shear_at_i * x + self.w_local * x**2 / 2

    def _V_at(self, x: float) -> float:
        """Shear force at *x* m from node i (N)."""
        return self.shear_at_i + self.w_local * x

    # ══════════════════════════════════════════════════════════════════
    #  Public API
    # ══════════════════════════════════════════════════════════════════

    def check_all(self) -> bool:
        self._step1_yield_strength()
        self._step2_classify()
        self._step3_bending()
        self._step4_shear()
        self._step5_shear_buckling()
        self._step6_combined()
        self._step8_ltb()
        self._step9_serviceability()
        self.overall_ok = all([
            self.bending_ok,
            self.shear_ok,
            self.shear_buckling_ok,
            self.combined_ok,
            self.ltb_ok,
            self.deflection_ok,
        ])
        return self.overall_ok

    # ══════════════════════════════════════════════════════════════════
    #  Step 1 — Yield strength (Table 3.1)
    # ══════════════════════════════════════════════════════════════════

    def _step1_yield_strength(self) -> None:
        sd = self.section_data
        self.fy = _get_fy(self.steel_grade, sd.tf)
        self.epsilon = math.sqrt(235.0 / self.fy)

    # ══════════════════════════════════════════════════════════════════
    #  Step 2 — Cross-section classification (Table 5.2)
    # ══════════════════════════════════════════════════════════════════

    def _step2_classify(self) -> None:
        sd = self.section_data
        eps = self.epsilon

        self.c_web = sd.d
        self.ct_web = self.c_web / sd.tw
        if self.ct_web <= 72 * eps:
            self.web_class = 1
        elif self.ct_web <= 83 * eps:
            self.web_class = 2
        elif self.ct_web <= 124 * eps:
            self.web_class = 3
        else:
            self.web_class = 4

        self.c_flange = (sd.b - sd.tw) / 2 - sd.r
        self.ct_flange = self.c_flange / sd.tf
        if self.ct_flange <= 9 * eps:
            self.flange_class = 1
        elif self.ct_flange <= 10 * eps:
            self.flange_class = 2
        elif self.ct_flange <= 14 * eps:
            self.flange_class = 3
        else:
            self.flange_class = 4

        self.section_class = max(self.web_class, self.flange_class)

    # ══════════════════════════════════════════════════════════════════
    #  Step 3 — Bending resistance (§6.2.5)
    # ══════════════════════════════════════════════════════════════════

    def _step3_bending(self) -> None:
        sd = self.section_data
        if self.section_class <= 2:
            self.Wy = sd.Wpl_y * 1e3
        else:
            self.Wy = sd.Wel_y * 1e3

        self.Mc_Rd = self.Wy * self.fy / GAMMA_M0 / 1e6
        self.bending_util = abs(self.MEd) / self.Mc_Rd if self.Mc_Rd > 0 else 999
        self.bending_ok = self.bending_util <= 1.0

    # ══════════════════════════════════════════════════════════════════
    #  Step 4 — Shear resistance (§6.2.6)
    # ══════════════════════════════════════════════════════════════════

    def _step4_shear(self) -> None:
        sd = self.section_data
        A_mm2 = sd.A * 1e2
        Av = A_mm2 - 2 * sd.b * sd.tf + (sd.tw + 2 * sd.r) * sd.tf
        hw = sd.hi
        Av = max(Av, 1.0 * hw * sd.tw)
        self.Av = Av
        self.Vpl_Rd = Av * (self.fy / math.sqrt(3)) / GAMMA_M0 / 1e3
        self.shear_util = abs(self.VEd) / self.Vpl_Rd if self.Vpl_Rd > 0 else 999
        self.shear_ok = self.shear_util <= 1.0

    # ══════════════════════════════════════════════════════════════════
    #  Step 5 — Shear buckling (§6.2.6 Expression 6.22)
    # ══════════════════════════════════════════════════════════════════

    def _step5_shear_buckling(self) -> None:
        sd = self.section_data
        self.hw_tw = sd.d / sd.tw
        self.hw_tw_limit = 72 * self.epsilon / 1.0
        self.shear_buckling_ok = self.hw_tw <= self.hw_tw_limit

    # ══════════════════════════════════════════════════════════════════
    #  Step 6 — Combined bending + shear (§6.2.8)
    # ══════════════════════════════════════════════════════════════════

    def _step6_combined(self) -> None:
        self.low_shear = abs(self.VEd) <= 0.5 * self.Vpl_Rd
        if self.low_shear:
            self.rho = 0.0
            self.Mv_Rd = self.Mc_Rd
        else:
            self.rho = (2 * abs(self.VEd) / self.Vpl_Rd - 1) ** 2
            fy_red = (1 - self.rho) * self.fy
            self.Mv_Rd = self.Wy * fy_red / GAMMA_M0 / 1e6

        self.combined_util = abs(self.MEd) / self.Mv_Rd if self.Mv_Rd > 0 else 999
        self.combined_ok = self.combined_util <= 1.0

    # ══════════════════════════════════════════════════════════════════
    #  Step 8 — Lateral torsional buckling
    #  Rolled-sections method (§6.3.2.3) with segment analysis
    # ══════════════════════════════════════════════════════════════════

    def _step8_ltb(self) -> None:
        sd = self.section_data

        # Unit conversions
        Iz_mm4 = sd.Iz * 1e4
        It_mm4 = sd.It * 1e4
        self.Iw_mm6 = sd.Iw * 1e6

        # Buckling curve — Table 6.5 (rolled sections)
        h_over_b = sd.h / sd.b
        if h_over_b <= 2:
            self.buckling_curve = "b"
        else:
            self.buckling_curve = "c"
        self.alpha_LT = _ALPHA_LT[self.buckling_curve]

        # Build segments from restraint positions
        rpos = sorted(set(self.restraint_positions))
        segments: list[LTBSegment] = []

        for i in range(len(rpos) - 1):
            x_start = rpos[i]   # m
            x_end = rpos[i + 1]  # m
            L_seg_mm = (x_end - x_start) * 1e3

            # ── Moment distribution in this segment ──────────────────
            #  Sample at 21 points, identify quarter-point moments
            n_pts = 20
            moments = []
            for k in range(n_pts + 1):
                x = x_start + k / n_pts * (x_end - x_start)
                moments.append(abs(self._M_at(x)))  # N·m

            M_max = max(moments)
            M_A = moments[n_pts // 4]         # quarter
            M_B = moments[n_pts // 2]         # mid
            M_C = moments[3 * n_pts // 4]     # three-quarter
            MEd_seg = M_max / 1e3             # kNm

            # ── C1 via quarter-point formula ─────────────────────────
            denom = 2.5 * M_max + 3 * M_A + 4 * M_B + 3 * M_C
            C1_seg = 12.5 * M_max / denom if denom > 0 else 1.0
            C1_seg = max(C1_seg, 1.0)  # C1 ≥ 1.0

            # kc = 1/√C1 (Table 6.6 relationship)
            kc_seg = 1.0 / math.sqrt(C1_seg)

            # ── Mcr for this segment ─────────────────────────────────
            coeff = C1_seg * math.pi**2 * E_STEEL * Iz_mm4 / L_seg_mm**2
            t1 = self.Iw_mm6 / Iz_mm4
            t2 = L_seg_mm**2 * G_STEEL * It_mm4 / (
                math.pi**2 * E_STEEL * Iz_mm4
            )
            Mcr_seg = coeff * math.sqrt(t1 + t2) / 1e6  # kNm

            # ── λ̄_LT ────────────────────────────────────────────────
            Wy_fy = self.Wy * self.fy  # N·mm
            lam = math.sqrt(Wy_fy / (Mcr_seg * 1e6)) if Mcr_seg > 0 else 999.0

            # ── Φ_LT (§6.3.2.3  eq 6.57) ────────────────────────────
            phi = 0.5 * (
                1
                + self.alpha_LT * (lam - self.lambda_LT_0)
                + self.beta_LT * lam**2
            )

            # ── χ_LT ────────────────────────────────────────────────
            disc = phi**2 - self.beta_LT * lam**2
            if disc > 0:
                chi = 1.0 / (phi + math.sqrt(disc))
            else:
                chi = 1.0
            chi = min(chi, 1.0, 1.0 / lam**2 if lam > 0 else 1.0)

            # ── Modification factor f (§6.3.2.3(2)) ─────────────────
            f = 1.0 - 0.5 * (1 - kc_seg) * (1 - 2 * (lam - 0.8) ** 2)
            f = min(f, 1.0)

            chi_mod = min(chi / f, 1.0) if f > 0 else chi

            # ── Mb,Rd ────────────────────────────────────────────────
            Mb_Rd_seg = chi_mod * self.Wy * self.fy / GAMMA_M1 / 1e6  # kNm
            util_seg = MEd_seg / Mb_Rd_seg if Mb_Rd_seg > 0 else 999.0

            segments.append(LTBSegment(
                start_m=x_start,
                end_m=x_end,
                L_mm=L_seg_mm,
                MEd_seg=MEd_seg,
                C1=C1_seg,
                kc=kc_seg,
                Mcr=Mcr_seg,
                lambda_LT=lam,
                Phi_LT=phi,
                chi_LT=chi,
                f_mod=f,
                chi_LT_mod=chi_mod,
                Mb_Rd=Mb_Rd_seg,
                util=util_seg,
                ok=util_seg <= 1.0,
            ))

        self.ltb_segments = segments

        # Governing segment = highest utilisation
        if segments:
            self.governing_seg_idx = max(
                range(len(segments)), key=lambda i: segments[i].util
            )
            gov = segments[self.governing_seg_idx]
            self.Mcr = gov.Mcr
            self.lambda_LT = gov.lambda_LT
            self.kc = gov.kc
            self.Phi_LT = gov.Phi_LT
            self.chi_LT = gov.chi_LT
            self.f_mod = gov.f_mod
            self.chi_LT_mod = gov.chi_LT_mod
            self.Mb_Rd = gov.Mb_Rd
            self.ltb_util = gov.util
            self.ltb_ok = gov.ok
        else:
            self.ltb_ok = True

    # ══════════════════════════════════════════════════════════════════
    #  Step 9 — Serviceability (deflection)
    # ══════════════════════════════════════════════════════════════════

    def _step9_serviceability(self) -> None:
        span_mm = self.span * 1e3
        if self.deflection_limit_type == "cantilever":
            self.defl_ratio = 180
        elif self.deflection_limit_type == "brittle":
            self.defl_ratio = 360
        else:
            self.defl_ratio = 200

        self.delta_limit = span_mm / self.defl_ratio
        self.deflection_util = (
            abs(self.delta_max) / self.delta_limit if self.delta_limit > 0 else 999
        )
        self.deflection_ok = self.deflection_util <= 1.0

    # ══════════════════════════════════════════════════════════════════
    #  Summary printing
    # ══════════════════════════════════════════════════════════════════

    def print_summary(self) -> None:
        P = "PASS"
        F = "FAIL"
        sd = self.section_data
        print(f"\n{'='*64}")
        print(f"  EC3 Beam Design — {sd.designation}  ({self.steel_grade})")
        print(f"{'='*64}")
        print(f"  fy = {self.fy:.0f} N/mm²   Class {self.section_class}")
        print(f"  MEd = {abs(self.MEd):.2f} kNm   VEd = {abs(self.VEd):.2f} kN")
        print(f"{'─'*64}")
        print(f"  Bending       Mc,Rd  = {self.Mc_Rd:>8.2f} kNm   "
              f"util = {self.bending_util:.3f}  {P if self.bending_ok else F}")
        print(f"  Shear         Vpl,Rd = {self.Vpl_Rd:>8.2f} kN    "
              f"util = {self.shear_util:.3f}  {P if self.shear_ok else F}")
        print(f"  Shear buckling       hw/tw = {self.hw_tw:.1f}"
              f" {'<=' if self.shear_buckling_ok else '>'} {self.hw_tw_limit:.1f}   "
              f"{P if self.shear_buckling_ok else F}")
        print(f"  Bending+Shear Mv,Rd  = {self.Mv_Rd:>8.2f} kNm   "
              f"util = {self.combined_util:.3f}  {P if self.combined_ok else F}")
        # LTB segment detail
        if len(self.ltb_segments) > 1:
            print(f"  LTB segments ({len(self.ltb_segments)}):")
            for i, seg in enumerate(self.ltb_segments):
                tag = " *" if i == self.governing_seg_idx else ""
                print(f"    [{seg.start_m:.1f}–{seg.end_m:.1f} m] "
                      f"L={seg.L_mm:.0f}mm  C1={seg.C1:.3f}  "
                      f"Mcr={seg.Mcr:.1f}  Mb,Rd={seg.Mb_Rd:.1f} kNm  "
                      f"util={seg.util:.3f}{tag}")
        print(f"  LTB (govern.) Mb,Rd  = {self.Mb_Rd:>8.2f} kNm   "
              f"util = {self.ltb_util:.3f}  {P if self.ltb_ok else F}")
        print(f"  Deflection    {abs(self.delta_max):.2f} mm"
              f" <= {self.delta_limit:.2f} mm (L/{self.defl_ratio:.0f})   "
              f"util = {self.deflection_util:.3f}  {P if self.deflection_ok else F}")
        print(f"{'─'*64}")
        print(f"  OVERALL: {P if self.overall_ok else F}")
        print(f"{'='*64}")
