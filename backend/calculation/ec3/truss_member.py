"""Eurocode 3 truss member design checks (EN 1993-1-1:2005).

Implements design checks for axially loaded truss members
(compression and tension) with hollow sections (SHS/RHS):
  1. Yield strength
  2. Cross-section classification (internal compression parts)
  3. Cross-section resistance (§6.2.4)
  4. Flexural buckling (§6.3.1)
  5. Compression check
  6. Tension resistance (§6.2.3)
  7. Tension check
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .beam import GAMMA_M0, GAMMA_M1, _get_fy
from .hollow_section_data import HollowSectionData

# Flexural buckling imperfection factors (Table 6.1)
_ALPHA_FLEX = {"a0": 0.13, "a": 0.21, "b": 0.34, "c": 0.49, "d": 0.76}

# Ultimate tensile strength (N/mm²)
_FU_TABLE: dict[str, float] = {
    "S235": 360.0,
    "S275": 430.0,
    "S355": 510.0,
    "S450": 550.0,
}

GAMMA_M2 = 1.25


@dataclass
class TrussMemberDesignEC3:
    """EC3 truss member design checks for hollow section members."""

    section_data: HollowSectionData
    steel_grade: str = "S355"

    # Design forces (positive values, kN)
    NEd_compression: float = 0.0  # kN — max compression force
    NEd_tension: float = 0.0      # kN — max tension force

    # Buckling lengths
    Lcr_ip: float = 0.0   # m — in-plane buckling length
    Lcr_oop: float = 0.0  # m — out-of-plane buckling length

    # Buckling curve (hot-finished SHS = "a", cold-formed = "c")
    buckling_curve: str = "a"

    # Connection details for tension check
    has_holes: bool = False
    A_net: float = 0.0  # cm² — net area at bolt holes

    # ── Results populated by check_all() ────────────────────
    # Step 1
    fy: float = 0.0
    fu: float = 0.0
    epsilon: float = 0.0

    # Step 2
    c_h: float = 0.0
    ct_h: float = 0.0
    c_b: float = 0.0
    ct_b: float = 0.0
    section_class: int = 0

    # Step 3
    NRd: float = 0.0

    # Step 4
    lambda_1: float = 0.0
    lambda_bar_ip: float = 0.0
    lambda_bar_oop: float = 0.0
    lambda_bar: float = 0.0
    alpha_imp: float = 0.0
    Phi: float = 0.0
    chi: float = 0.0
    Nb_Rd: float = 0.0

    # Step 5
    compression_util: float = 0.0
    compression_ok: bool = False

    # Step 6
    Nt_Rd: float = 0.0

    # Step 7
    tension_util: float = 0.0
    tension_ok: bool = False

    overall_ok: bool = False

    # ──────────────────────────────────────────────────────────
    #  Public API
    # ──────────────────────────────────────────────────────────

    def check_all(self) -> bool:
        self._step1_yield_strength()
        self._step2_classify()
        self._step3_cross_section_resistance()
        self._step4_flexural_buckling()
        self._step5_compression_check()
        self._step6_tension_resistance()
        self._step7_tension_check()
        self.overall_ok = self.compression_ok and self.tension_ok
        return self.overall_ok

    # ══════════════════════════════════════════════════════════
    #  Step 1 — Yield strength (Table 3.1)
    # ══════════════════════════════════════════════════════════

    def _step1_yield_strength(self) -> None:
        sd = self.section_data
        self.fy = _get_fy(self.steel_grade, sd.t)
        self.epsilon = math.sqrt(235.0 / self.fy)
        grade = self.steel_grade.upper()
        self.fu = _FU_TABLE.get(grade, 510.0)

    # ══════════════════════════════════════════════════════════
    #  Step 2 — Classification (Table 5.2, internal parts)
    # ══════════════════════════════════════════════════════════

    def _step2_classify(self) -> None:
        sd = self.section_data
        eps = self.epsilon

        # Internal compression parts: c = h - 2t (conservative)
        self.c_h = sd.h - 2 * sd.t
        self.ct_h = self.c_h / sd.t

        self.c_b = sd.b - 2 * sd.t
        self.ct_b = self.c_b / sd.t

        # Governing c/t ratio
        ct = max(self.ct_h, self.ct_b)

        if ct <= 33 * eps:
            self.section_class = 1
        elif ct <= 38 * eps:
            self.section_class = 2
        elif ct <= 42 * eps:
            self.section_class = 3
        else:
            self.section_class = 4

    # ══════════════════════════════════════════════════════════
    #  Step 3 — Cross-section resistance (§6.2.4)
    # ══════════════════════════════════════════════════════════

    def _step3_cross_section_resistance(self) -> None:
        sd = self.section_data
        A_mm2 = sd.A * 1e2  # cm² → mm²
        self.NRd = A_mm2 * self.fy / GAMMA_M0 / 1e3  # kN

    # ══════════════════════════════════════════════════════════
    #  Step 4 — Flexural buckling (§6.3.1)
    # ══════════════════════════════════════════════════════════

    def _step4_flexural_buckling(self) -> None:
        sd = self.section_data

        # Slenderness
        self.lambda_1 = 93.9 * self.epsilon

        # In-plane: use iy for major axis
        i_ip = sd.iy  # mm
        i_oop = sd.iz  # mm (= iy for SHS)

        if i_ip > 0 and self.Lcr_ip > 0:
            self.lambda_bar_ip = (self.Lcr_ip * 1e3) / (i_ip * self.lambda_1)
        else:
            self.lambda_bar_ip = 0.0

        if i_oop > 0 and self.Lcr_oop > 0:
            self.lambda_bar_oop = (self.Lcr_oop * 1e3) / (i_oop * self.lambda_1)
        else:
            self.lambda_bar_oop = 0.0

        # Governing slenderness
        self.lambda_bar = max(self.lambda_bar_ip, self.lambda_bar_oop)

        # Imperfection factor
        self.alpha_imp = _ALPHA_FLEX[self.buckling_curve]

        # Reduction factor
        self.Phi = 0.5 * (1 + self.alpha_imp * (self.lambda_bar - 0.2) + self.lambda_bar ** 2)
        disc = self.Phi ** 2 - self.lambda_bar ** 2
        if disc > 0:
            self.chi = 1.0 / (self.Phi + math.sqrt(disc))
        else:
            self.chi = 1.0
        self.chi = min(self.chi, 1.0)

        # Buckling resistance
        A_mm2 = sd.A * 1e2  # cm² → mm²
        self.Nb_Rd = self.chi * A_mm2 * self.fy / GAMMA_M1 / 1e3  # kN

    # ══════════════════════════════════════════════════════════
    #  Step 5 — Compression check
    # ══════════════════════════════════════════════════════════

    def _step5_compression_check(self) -> None:
        if self.Nb_Rd > 0:
            self.compression_util = self.NEd_compression / self.Nb_Rd
        else:
            self.compression_util = 999.0 if self.NEd_compression > 0 else 0.0
        self.compression_ok = self.compression_util <= 1.0

    # ══════════════════════════════════════════════════════════
    #  Step 6 — Tension resistance (§6.2.3)
    # ══════════════════════════════════════════════════════════

    def _step6_tension_resistance(self) -> None:
        sd = self.section_data
        # Gross section: Npl,Rd = A · fy / γM0
        Npl_Rd = self.NRd  # same as cross-section resistance

        if self.has_holes and self.A_net > 0:
            A_net_mm2 = self.A_net * 1e2  # cm² → mm²
            Nu_Rd = 0.9 * A_net_mm2 * self.fu / GAMMA_M2 / 1e3  # kN
            self.Nt_Rd = min(Npl_Rd, Nu_Rd)
        else:
            self.Nt_Rd = Npl_Rd

    # ══════════════════════════════════════════════════════════
    #  Step 7 — Tension check
    # ══════════════════════════════════════════════════════════

    def _step7_tension_check(self) -> None:
        if self.Nt_Rd > 0:
            self.tension_util = self.NEd_tension / self.Nt_Rd
        else:
            self.tension_util = 999.0 if self.NEd_tension > 0 else 0.0
        self.tension_ok = self.tension_util <= 1.0

    # ══════════════════════════════════════════════════════════
    #  Summary printing
    # ══════════════════════════════════════════════════════════

    def print_summary(self) -> None:
        P = "PASS"
        F = "FAIL"
        sd = self.section_data
        print(f"\n{'='*64}")
        print(f"  EC3 Truss Member Design — {sd.designation}  ({self.steel_grade})")
        print(f"{'='*64}")
        print(f"  fy = {self.fy:.0f} N/mm²   ε = {self.epsilon:.4f}   Class {self.section_class}")
        print(f"  NEd,comp = {self.NEd_compression:.2f} kN   NEd,tens = {self.NEd_tension:.2f} kN")
        print(f"{'─'*64}")
        print(f"  Classification  c/t = {max(self.ct_h, self.ct_b):.2f}"
              f"  (33ε = {33*self.epsilon:.2f})")
        print(f"  NRd = {self.NRd:.2f} kN")
        print(f"  λ̄_ip = {self.lambda_bar_ip:.4f}   λ̄_oop = {self.lambda_bar_oop:.4f}"
              f"   λ̄ = {self.lambda_bar:.4f}")
        print(f"  Φ = {self.Phi:.4f}   χ = {self.chi:.4f}")
        print(f"  Nb,Rd = {self.Nb_Rd:.2f} kN")
        print(f"{'─'*64}")
        print(f"  Compression     NEd/Nb,Rd = {self.compression_util:.3f}  "
              f"{P if self.compression_ok else F}")
        print(f"  Tension         NEd/Nt,Rd = {self.tension_util:.3f}  "
              f"{P if self.tension_ok else F}")
        print(f"{'─'*64}")
        print(f"  OVERALL: {P if self.overall_ok else F}")
        print(f"{'='*64}")
