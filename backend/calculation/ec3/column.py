"""Eurocode 3 column (beam-column) design checks (EN 1993-1-1:2005).

Implements Steps 1-10 of the beam-column design workflow:
  1. Yield strength
  2. Cross-section classification (compression + bending)
  3. Axial compression resistance (§6.2.4)
  4. Bending resistance — both axes (§6.2.5)
  5. Shear resistance (§6.2.6)
  6. Combined cross-section resistance — conservative (§6.2.1)
  7. Combined cross-section resistance — alternative (§6.2.9.1)
  8. Flexural buckling resistance (§6.3.1)
  9. Lateral torsional buckling (§6.3.2)
 10. Combined buckling — Annex A interaction (§6.3.3)
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .beam import E_STEEL, G_STEEL, GAMMA_M0, GAMMA_M1, _get_fy, _ALPHA_LT
from .section_data import SteelSectionData

# Flexural buckling imperfection factors (Table 6.1)
_ALPHA_FLEX = {"a0": 0.13, "a": 0.21, "b": 0.34, "c": 0.49, "d": 0.76}


@dataclass
class ColumnDesignEC3:
    """EC3 beam-column design checks for a steel column element."""

    section_data: SteelSectionData
    steel_grade: str = "S275"

    # Design forces (positive compression, positive moments)
    NEd: float = 0.0      # kN — axial compression
    My_Ed: float = 0.0    # kNm — major axis bending moment
    Mz_Ed: float = 0.0    # kNm — minor axis bending moment
    VEd: float = 0.0      # kN — shear force

    # Buckling lengths
    Lcr_y: float = 0.0    # m — critical length about y-y axis
    Lcr_z: float = 0.0    # m — critical length about z-z axis

    # Moment diagram parameters (end moment ratios, -1 <= psi <= 1)
    psi_y: float = 1.0    # psi_y for major axis (1.0 = uniform moment)
    psi_z: float = 1.0    # psi_z for minor axis

    # LTB length (defaults to Lcr_z if None)
    Lcr_LT: float | None = None

    # ── Results populated by check_all() ──────────────────────
    # Step 1
    fy: float = 0.0
    epsilon: float = 0.0

    # Step 2
    alpha_web: float = 0.0
    c_web: float = 0.0
    ct_web: float = 0.0
    web_class: int = 0
    c_flange: float = 0.0
    ct_flange: float = 0.0
    flange_class: int = 0
    section_class: int = 0

    # Step 3
    NRd: float = 0.0

    # Step 4
    Wy: float = 0.0   # mm³
    Wz: float = 0.0   # mm³
    My_Rd: float = 0.0
    Mz_Rd: float = 0.0

    # Step 5
    Av: float = 0.0
    Vpl_Rd: float = 0.0
    shear_util: float = 0.0
    shear_ok: bool = False

    # Step 6
    conservative_util: float = 0.0
    conservative_ok: bool = False

    # Step 7
    a_w: float = 0.0
    MN_y_Rd: float = 0.0
    MN_z_Rd: float = 0.0
    alpha_interact: float = 2.0
    beta_interact: float = 1.0
    alternative_util: float = 0.0
    alternative_ok: bool = False

    # Step 8
    iy_mm: float = 0.0
    iz_mm: float = 0.0
    lambda_1: float = 0.0
    lambda_bar_y: float = 0.0
    lambda_bar_z: float = 0.0
    curve_y: str = ""
    curve_z: str = ""
    alpha_y: float = 0.0
    alpha_z: float = 0.0
    Phi_y: float = 0.0
    Phi_z: float = 0.0
    chi_y: float = 0.0
    chi_z: float = 0.0
    Nb_Rd: float = 0.0

    # Step 9
    Iw_mm6: float = 0.0
    buckling_curve_LT: str = ""
    alpha_LT: float = 0.0
    Mcr: float = 0.0
    lambda_LT: float = 0.0
    Phi_LT: float = 0.0
    chi_LT: float = 0.0
    Mb_Rd: float = 0.0

    # Step 10
    Ncr_y: float = 0.0   # kN
    Ncr_z: float = 0.0   # kN
    Ncr_T: float = 0.0   # kN
    aLT: float = 0.0
    Cmy: float = 0.0
    Cmz: float = 0.0
    CmLT: float = 0.0
    lambda_bar_0: float = 0.0
    kyy: float = 0.0
    kyz: float = 0.0
    kzy: float = 0.0
    kzz: float = 0.0
    eq6_61: float = 0.0
    eq6_62: float = 0.0
    combined_buckling_ok: bool = False

    overall_ok: bool = False

    # ──────────────────────────────────────────────────────────
    def __post_init__(self) -> None:
        if self.Lcr_LT is None:
            self.Lcr_LT = self.Lcr_z

    # ══════════════════════════════════════════════════════════
    #  Public API
    # ══════════════════════════════════════════════════════════

    def check_all(self) -> bool:
        self._step1_yield_strength()
        self._step2_classify()
        self._step3_axial()
        self._step4_bending()
        self._step5_shear()
        self._step6_conservative_combined()
        self._step7_alternative_combined()
        self._step8_flexural_buckling()
        self._step9_ltb()
        self._step10_combined_buckling()
        self.overall_ok = all([
            self.shear_ok,
            self.conservative_ok,
            self.alternative_ok,
            self.Nb_Rd >= self.NEd,
            self.chi_LT > 0,
            self.combined_buckling_ok,
        ])
        return self.overall_ok

    # ══════════════════════════════════════════════════════════
    #  Step 1 — Yield strength (Table 3.1)
    # ══════════════════════════════════════════════════════════

    def _step1_yield_strength(self) -> None:
        sd = self.section_data
        self.fy = _get_fy(self.steel_grade, sd.tf)
        self.epsilon = math.sqrt(235.0 / self.fy)

    # ══════════════════════════════════════════════════════════
    #  Step 2 — Cross-section classification (Table 5.2)
    # ══════════════════════════════════════════════════════════

    def _step2_classify(self) -> None:
        sd = self.section_data
        eps = self.epsilon

        # ── Flange (outstand, compression) ────────────────────
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

        # ── Web (combined bending + compression) ──────────────
        self.c_web = sd.d  # depth between root fillets
        self.ct_web = self.c_web / sd.tw

        # Compute alpha: fraction of web in compression
        # NEd in kN → convert to N for stress calculation
        NEd_N = self.NEd * 1e3
        A_mm2 = sd.A * 1e2  # cm² → mm²
        fy = self.fy

        if NEd_N > 0 and self.My_Ed != 0:
            # Combined axial + bending: alpha from plastic stress distribution
            alpha = (self.c_web / 2 + NEd_N / (2 * sd.tw * fy)) / self.c_web
            alpha = max(0.0, min(alpha, 1.0))
        elif NEd_N > 0:
            # Pure compression
            alpha = 1.0
        else:
            # Pure bending (no axial) — use beam classification
            alpha = 0.5

        self.alpha_web = alpha

        if alpha > 0.5:
            limit1 = 396 * eps / (13 * alpha - 1)
            limit2 = 456 * eps / (13 * alpha - 1)
        else:
            limit1 = 36 * eps / alpha if alpha > 0 else 999
            limit2 = 41.5 * eps / alpha if alpha > 0 else 999

        # Class 3 limit: stress ratio psi for web
        # For combined N+M: psi = (fy*(1-2*alpha) - sigma_comp) / sigma_comp
        # Simplified: use 42*eps/(0.67+0.33*psi)
        if alpha >= 1.0:
            # Pure compression: psi = 1
            limit3 = 42 * eps / (0.67 + 0.33 * 1.0)
        elif alpha > 0.5:
            psi_web = (2 * alpha - 1) / 1.0  # approximate stress ratio
            psi_web = max(-1.0, min(psi_web, 1.0))
            limit3 = 42 * eps / (0.67 + 0.33 * psi_web)
        else:
            # alpha <= 0.5: tension side larger, psi < 0
            psi_web = (2 * alpha - 1)
            psi_web = max(-1.0, min(psi_web, 1.0))
            denom = 0.67 + 0.33 * psi_web
            limit3 = 42 * eps / denom if denom > 0 else 999

        if self.ct_web <= limit1:
            self.web_class = 1
        elif self.ct_web <= limit2:
            self.web_class = 2
        elif self.ct_web <= limit3:
            self.web_class = 3
        else:
            self.web_class = 4

        self.section_class = max(self.web_class, self.flange_class)

    # ══════════════════════════════════════════════════════════
    #  Step 3 — Axial compression resistance (§6.2.4)
    # ══════════════════════════════════════════════════════════

    def _step3_axial(self) -> None:
        sd = self.section_data
        A_mm2 = sd.A * 1e2  # cm² → mm²
        self.NRd = A_mm2 * self.fy / GAMMA_M0 / 1e3  # kN

    # ══════════════════════════════════════════════════════════
    #  Step 4 — Bending resistance (§6.2.5)
    # ══════════════════════════════════════════════════════════

    def _step4_bending(self) -> None:
        sd = self.section_data
        if self.section_class <= 2:
            self.Wy = sd.Wpl_y * 1e3  # cm³ → mm³
            self.Wz = sd.Wpl_z * 1e3
        else:
            self.Wy = sd.Wel_y * 1e3
            self.Wz = sd.Wel_z * 1e3

        self.My_Rd = self.Wy * self.fy / GAMMA_M0 / 1e6  # kNm
        self.Mz_Rd = self.Wz * self.fy / GAMMA_M0 / 1e6

    # ══════════════════════════════════════════════════════════
    #  Step 5 — Shear resistance (§6.2.6)
    # ══════════════════════════════════════════════════════════

    def _step5_shear(self) -> None:
        sd = self.section_data
        A_mm2 = sd.A * 1e2
        Av = A_mm2 - 2 * sd.b * sd.tf + (sd.tw + 2 * sd.r) * sd.tf
        hw = sd.hi
        Av = max(Av, 1.0 * hw * sd.tw)
        self.Av = Av
        self.Vpl_Rd = Av * (self.fy / math.sqrt(3)) / GAMMA_M0 / 1e3  # kN
        self.shear_util = abs(self.VEd) / self.Vpl_Rd if self.Vpl_Rd > 0 else 999
        self.shear_ok = self.shear_util <= 1.0

    # ══════════════════════════════════════════════════════════
    #  Step 6 — Conservative combined (§6.2.1(7))
    # ══════════════════════════════════════════════════════════

    def _step6_conservative_combined(self) -> None:
        terms = []
        if self.NRd > 0:
            terms.append(self.NEd / self.NRd)
        if self.My_Rd > 0:
            terms.append(abs(self.My_Ed) / self.My_Rd)
        if self.Mz_Rd > 0:
            terms.append(abs(self.Mz_Ed) / self.Mz_Rd)
        self.conservative_util = sum(terms) if terms else 0.0
        self.conservative_ok = self.conservative_util <= 1.0

    # ══════════════════════════════════════════════════════════
    #  Step 7 — Alternative combined (§6.2.9.1)
    # ══════════════════════════════════════════════════════════

    def _step7_alternative_combined(self) -> None:
        sd = self.section_data
        if self.section_class > 2:
            # §6.2.9.1 only applies to class 1 and 2
            self.alternative_util = self.conservative_util
            self.alternative_ok = self.conservative_ok
            self.MN_y_Rd = self.My_Rd
            self.MN_z_Rd = self.Mz_Rd
            return

        n = self.NEd / self.NRd if self.NRd > 0 else 0.0
        A_mm2 = sd.A * 1e2
        a_w = min((A_mm2 - 2 * sd.b * sd.tf) / A_mm2, 0.5)
        self.a_w = a_w

        # Reduced bending resistance about y-y
        Mpl_y_Rd = self.My_Rd  # already Wpl * fy / gamma_M0 for class 1/2
        if a_w < 1.0:
            self.MN_y_Rd = min(Mpl_y_Rd * (1 - n) / (1 - 0.5 * a_w), Mpl_y_Rd)
        else:
            self.MN_y_Rd = Mpl_y_Rd * (1 - n)

        # Reduced bending resistance about z-z
        Mpl_z_Rd = self.Mz_Rd
        if n <= a_w:
            self.MN_z_Rd = Mpl_z_Rd
        else:
            ratio = ((n - a_w) / (1 - a_w)) ** 2 if (1 - a_w) > 0 else 1.0
            self.MN_z_Rd = Mpl_z_Rd * (1 - ratio)

        # Interaction formula
        self.alpha_interact = 2.0
        self.beta_interact = max(1.0, 5 * n)

        util = 0.0
        if self.MN_y_Rd > 0:
            util += (abs(self.My_Ed) / self.MN_y_Rd) ** self.alpha_interact
        if self.MN_z_Rd > 0:
            util += (abs(self.Mz_Ed) / self.MN_z_Rd) ** self.beta_interact
        self.alternative_util = util
        self.alternative_ok = self.alternative_util <= 1.0

    # ══════════════════════════════════════════════════════════
    #  Step 8 — Flexural buckling (§6.3.1)
    # ══════════════════════════════════════════════════════════

    def _step8_flexural_buckling(self) -> None:
        sd = self.section_data
        A_mm2 = sd.A * 1e2  # cm² → mm²
        Iy_mm4 = sd.Iy * 1e4  # cm⁴ → mm⁴
        Iz_mm4 = sd.Iz * 1e4

        # Radii of gyration
        self.iy_mm = math.sqrt(Iy_mm4 / A_mm2)
        self.iz_mm = math.sqrt(Iz_mm4 / A_mm2)

        # Slenderness
        self.lambda_1 = 93.9 * self.epsilon
        self.lambda_bar_y = (self.Lcr_y * 1e3) / (self.iy_mm * self.lambda_1) if self.iy_mm > 0 else 0.0
        self.lambda_bar_z = (self.Lcr_z * 1e3) / (self.iz_mm * self.lambda_1) if self.iz_mm > 0 else 0.0

        # Buckling curves from Table 6.2 (rolled I-sections)
        h_over_b = sd.h / sd.b
        if h_over_b > 1.2:
            if sd.tf <= 40:
                self.curve_y, self.curve_z = "a", "b"
            else:
                self.curve_y, self.curve_z = "b", "c"
        else:
            if sd.tf <= 100:
                self.curve_y, self.curve_z = "b", "c"
            else:
                self.curve_y, self.curve_z = "d", "d"

        self.alpha_y = _ALPHA_FLEX[self.curve_y]
        self.alpha_z = _ALPHA_FLEX[self.curve_z]

        # Reduction factor y
        self.Phi_y = 0.5 * (1 + self.alpha_y * (self.lambda_bar_y - 0.2) + self.lambda_bar_y ** 2)
        disc_y = self.Phi_y ** 2 - self.lambda_bar_y ** 2
        if disc_y > 0:
            self.chi_y = 1.0 / (self.Phi_y + math.sqrt(disc_y))
        else:
            self.chi_y = 1.0
        self.chi_y = min(self.chi_y, 1.0)

        # Reduction factor z
        self.Phi_z = 0.5 * (1 + self.alpha_z * (self.lambda_bar_z - 0.2) + self.lambda_bar_z ** 2)
        disc_z = self.Phi_z ** 2 - self.lambda_bar_z ** 2
        if disc_z > 0:
            self.chi_z = 1.0 / (self.Phi_z + math.sqrt(disc_z))
        else:
            self.chi_z = 1.0
        self.chi_z = min(self.chi_z, 1.0)

        # Buckling resistance
        chi_min = min(self.chi_y, self.chi_z)
        self.Nb_Rd = chi_min * A_mm2 * self.fy / GAMMA_M1 / 1e3  # kN

    # ══════════════════════════════════════════════════════════
    #  Step 9 — Lateral torsional buckling (§6.3.2)
    # ══════════════════════════════════════════════════════════

    def _step9_ltb(self) -> None:
        sd = self.section_data
        Iz_mm4 = sd.Iz * 1e4
        It_mm4 = sd.It * 1e4
        self.Iw_mm6 = sd.Iw * 1e6

        L_mm = self.Lcr_LT * 1e3

        # Buckling curve — Table 6.5 (rolled sections)
        h_over_b = sd.h / sd.b
        if h_over_b <= 2:
            self.buckling_curve_LT = "b"
        else:
            self.buckling_curve_LT = "c"
        self.alpha_LT = _ALPHA_LT[self.buckling_curve_LT]

        # Mcr — elastic critical moment (C1=1 for uniform moment)
        coeff = math.pi ** 2 * E_STEEL * Iz_mm4 / L_mm ** 2
        t1 = self.Iw_mm6 / Iz_mm4
        t2 = L_mm ** 2 * G_STEEL * It_mm4 / (math.pi ** 2 * E_STEEL * Iz_mm4)
        self.Mcr = coeff * math.sqrt(t1 + t2) / 1e6  # kNm

        # lambda_LT
        Wy_fy = self.Wy * self.fy  # N·mm
        self.lambda_LT = math.sqrt(Wy_fy / (self.Mcr * 1e6)) if self.Mcr > 0 else 999.0

        # Rolled sections method (§6.3.2.3)
        beta_LT = 0.75
        lambda_LT_0 = 0.4
        self.Phi_LT = 0.5 * (1 + self.alpha_LT * (self.lambda_LT - lambda_LT_0) + beta_LT * self.lambda_LT ** 2)
        disc = self.Phi_LT ** 2 - beta_LT * self.lambda_LT ** 2
        if disc > 0:
            self.chi_LT = 1.0 / (self.Phi_LT + math.sqrt(disc))
        else:
            self.chi_LT = 1.0
        self.chi_LT = min(self.chi_LT, 1.0, 1.0 / self.lambda_LT ** 2 if self.lambda_LT > 0 else 1.0)

        self.Mb_Rd = self.chi_LT * self.Wy * self.fy / GAMMA_M1 / 1e6  # kNm

    # ══════════════════════════════════════════════════════════
    #  Step 10 — Combined buckling — Annex A (§6.3.3)
    # ══════════════════════════════════════════════════════════

    def _step10_combined_buckling(self) -> None:
        sd = self.section_data
        A_mm2 = sd.A * 1e2
        Iy_mm4 = sd.Iy * 1e4
        Iz_mm4 = sd.Iz * 1e4
        It_mm4 = sd.It * 1e4
        Iw_mm6 = self.Iw_mm6

        NEd = self.NEd  # kN
        My_Ed = abs(self.My_Ed)  # kNm
        Mz_Ed = abs(self.Mz_Ed)  # kNm

        Lcr_y_mm = self.Lcr_y * 1e3
        Lcr_z_mm = self.Lcr_z * 1e3
        Lcr_LT_mm = self.Lcr_LT * 1e3

        # Critical forces (kN)
        self.Ncr_y = math.pi ** 2 * E_STEEL * Iy_mm4 / Lcr_y_mm ** 2 / 1e3
        self.Ncr_z = math.pi ** 2 * E_STEEL * Iz_mm4 / Lcr_z_mm ** 2 / 1e3

        # Torsional critical force (kN)
        i0_sq = (Iy_mm4 + Iz_mm4) / A_mm2  # mm²
        self.Ncr_T = (1 / i0_sq) * (G_STEEL * It_mm4 + math.pi ** 2 * E_STEEL * Iw_mm6 / Lcr_LT_mm ** 2) / 1e3

        # Characteristic resistances (for Annex A)
        NRk = A_mm2 * self.fy / 1e3  # kN
        Wel_y_mm3 = sd.Wel_y * 1e3
        Wpl_y_mm3 = sd.Wpl_y * 1e3
        Wel_z_mm3 = sd.Wel_z * 1e3
        Wpl_z_mm3 = sd.Wpl_z * 1e3

        if self.section_class <= 2:
            My_Rk = Wpl_y_mm3 * self.fy / 1e6  # kNm
            Mz_Rk = Wpl_z_mm3 * self.fy / 1e6
        else:
            My_Rk = Wel_y_mm3 * self.fy / 1e6
            Mz_Rk = Wel_z_mm3 * self.fy / 1e6

        Mpl_y_Rd = Wpl_y_mm3 * self.fy / GAMMA_M1 / 1e6
        Mpl_z_Rd = Wpl_z_mm3 * self.fy / GAMMA_M1 / 1e6

        # aLT
        self.aLT = max(1 - It_mm4 / Iy_mm4, 0.0)

        # lambda_bar_0 (using Mcr with C1=1 — which is self.Mcr)
        self.lambda_bar_0 = self.lambda_LT

        # Equivalent uniform moment factors (Table A.2, end moments)
        Cmy0 = 0.79 + 0.21 * self.psi_y + 0.36 * (self.psi_y - 0.33) * NEd / self.Ncr_y
        Cmz0 = 0.79 + 0.21 * self.psi_z + 0.36 * (self.psi_z - 0.33) * NEd / self.Ncr_z

        # epsilon_y, epsilon_z (dimensionless)
        if NEd > 0 and Wel_y_mm3 > 0:
            eps_y = (My_Ed / NEd) * (A_mm2 / Wel_y_mm3) * 1e3  # unit: (kNm/kN)*(mm²/mm³) → need *1e3 to get m→mm
        else:
            eps_y = 0.0
        if NEd > 0 and Wel_z_mm3 > 0:
            eps_z = (Mz_Ed / NEd) * (A_mm2 / Wel_z_mm3) * 1e3
        else:
            eps_z = 0.0

        # Threshold check for lambda_bar_0
        nz_ratio = 1 - NEd / self.Ncr_z if self.Ncr_z > 0 else 1.0
        nTF_ratio = 1 - NEd / self.Ncr_T if self.Ncr_T > 0 else 1.0
        # Ncr_TF = Ncr_T for doubly symmetric sections
        C1 = 1.0  # for uniform moment (used with Mcr above)
        threshold = 0.2 * math.sqrt(C1) * (max(nz_ratio * nTF_ratio, 0.0)) ** 0.25

        if self.lambda_bar_0 <= threshold:
            self.Cmy = Cmy0
            self.CmLT = 1.0
        else:
            denom_cmy = 1 + eps_y * self.aLT
            self.Cmy = Cmy0 + (1 - Cmy0) * eps_y * self.aLT / denom_cmy if denom_cmy != 0 else Cmy0
            nz_fac = max(nz_ratio, 1e-10)
            nT_fac = max(1 - NEd / self.Ncr_T, 1e-10) if self.Ncr_T > 0 else 1.0
            self.CmLT = max(self.Cmy ** 2 * self.aLT / (nz_fac * nT_fac), 1.0)

        self.Cmz = Cmz0

        # Intermediate factors (Table A.1)
        chi_LT = self.chi_LT
        lam_0 = self.lambda_bar_0
        lam_z = self.lambda_bar_z

        # Guard against zero moments for bLT, cLT, dLT, eLT
        my_term = My_Ed / (chi_LT * Mpl_y_Rd) if (chi_LT * Mpl_y_Rd) > 0 else 0.0
        mz_term = Mz_Ed / Mpl_z_Rd if Mpl_z_Rd > 0 else 0.0

        bLT = 0.5 * self.aLT * lam_0 ** 2 * my_term * mz_term
        cLT_denom = 5 + lam_z ** 4
        cLT = 10 * self.aLT * lam_0 ** 2 / cLT_denom * My_Ed / (self.Cmy * chi_LT * Mpl_y_Rd) if (self.Cmy * chi_LT * Mpl_y_Rd) > 0 else 0.0
        dLT_denom = 0.1 + lam_z ** 4
        dLT = 2 * self.aLT * lam_0 / dLT_denom
        if (self.Cmy * chi_LT * Mpl_y_Rd) > 0 and (self.Cmz * Mpl_z_Rd) > 0:
            dLT *= My_Ed / (self.Cmy * chi_LT * Mpl_y_Rd) * Mz_Ed / (self.Cmz * Mpl_z_Rd)
        else:
            dLT = 0.0
        eLT = 1.7 * self.aLT * lam_0 / dLT_denom * My_Ed / (self.Cmy * chi_LT * Mpl_y_Rd) if (self.Cmy * chi_LT * Mpl_y_Rd) > 0 else 0.0

        # n_pl, w_y, w_z, lambda_max
        npl = NEd / (NRk / GAMMA_M1)
        wy = min(Wpl_y_mm3 / Wel_y_mm3, 1.5) if Wel_y_mm3 > 0 else 1.0
        wz = min(Wpl_z_mm3 / Wel_z_mm3, 1.5) if Wel_z_mm3 > 0 else 1.0
        lam_max = max(self.lambda_bar_y, self.lambda_bar_z)

        # C_ij factors
        Cyy = 1 + (wy - 1) * ((2 - 1.6 / wy * self.Cmy ** 2 * lam_max - 1.6 / wy * self.Cmy ** 2 * lam_max ** 2) * npl - bLT)
        Cyy = max(Cyy, Wel_y_mm3 / Wpl_y_mm3 if Wpl_y_mm3 > 0 else 1.0)

        Cyz = 1 + (wz - 1) * ((2 - 14 * self.Cmz ** 2 * lam_max ** 2 / wz ** 5) * npl - cLT)
        Cyz = max(Cyz, 0.6 * math.sqrt(wz / wy) * Wel_z_mm3 / Wpl_z_mm3 if (Wpl_z_mm3 > 0 and wy > 0) else 1.0)

        Czy = 1 + (wy - 1) * ((2 - 14 * self.Cmy ** 2 * lam_max ** 2 / wy ** 5) * npl - dLT)
        Czy = max(Czy, 0.6 * math.sqrt(wy / wz) * Wel_y_mm3 / Wpl_y_mm3 if (Wpl_y_mm3 > 0 and wz > 0) else 1.0)

        Czz = 1 + (wz - 1) * ((2 - 1.6 / wz * self.Cmz ** 2 * lam_max - 1.6 / wz * self.Cmz ** 2 * lam_max ** 2) * npl - eLT)
        Czz = max(Czz, Wel_z_mm3 / Wpl_z_mm3 if Wpl_z_mm3 > 0 else 1.0)

        # mu factors
        ny_ratio = 1 - NEd / self.Ncr_y if self.Ncr_y > 0 else 1.0
        nz_ratio_f = 1 - NEd / self.Ncr_z if self.Ncr_z > 0 else 1.0
        mu_y = ny_ratio / (1 - self.chi_y * NEd / self.Ncr_y) if (self.Ncr_y > 0 and (1 - self.chi_y * NEd / self.Ncr_y) != 0) else 1.0
        mu_z = nz_ratio_f / (1 - self.chi_z * NEd / self.Ncr_z) if (self.Ncr_z > 0 and (1 - self.chi_z * NEd / self.Ncr_z) != 0) else 1.0

        # Interaction factors k_ij
        ny_fac = max(ny_ratio, 1e-10)
        nz_fac_k = max(nz_ratio_f, 1e-10)

        self.kyy = self.Cmy * self.CmLT * mu_y / ny_fac / Cyy if Cyy > 0 else 999
        self.kyz = self.Cmz * mu_y / nz_fac_k / Cyz * 0.6 * math.sqrt(wz / wy) if (Cyz > 0 and wy > 0) else 999
        self.kzy = self.Cmy * self.CmLT * mu_z / ny_fac / Czy * 0.6 * math.sqrt(wy / wz) if (Czy > 0 and wz > 0) else 999
        self.kzz = self.Cmz * mu_z / nz_fac_k / Czz if Czz > 0 else 999

        # Interaction equations (6.61 and 6.62)
        chi_y_NRk = self.chi_y * NRk / GAMMA_M1
        chi_z_NRk = self.chi_z * NRk / GAMMA_M1
        chi_LT_MyRk = chi_LT * My_Rk / GAMMA_M1
        MzRk_gM1 = Mz_Rk / GAMMA_M1

        self.eq6_61 = 0.0
        if chi_y_NRk > 0:
            self.eq6_61 += NEd / chi_y_NRk
        if chi_LT_MyRk > 0:
            self.eq6_61 += self.kyy * My_Ed / chi_LT_MyRk
        if MzRk_gM1 > 0:
            self.eq6_61 += self.kyz * Mz_Ed / MzRk_gM1

        self.eq6_62 = 0.0
        if chi_z_NRk > 0:
            self.eq6_62 += NEd / chi_z_NRk
        if chi_LT_MyRk > 0:
            self.eq6_62 += self.kzy * My_Ed / chi_LT_MyRk
        if MzRk_gM1 > 0:
            self.eq6_62 += self.kzz * Mz_Ed / MzRk_gM1

        self.combined_buckling_ok = self.eq6_61 <= 1.0 and self.eq6_62 <= 1.0

    # ══════════════════════════════════════════════════════════
    #  Summary printing
    # ══════════════════════════════════════════════════════════

    def print_summary(self) -> None:
        P = "PASS"
        F = "FAIL"
        sd = self.section_data
        print(f"\n{'='*68}")
        print(f"  EC3 Column Design — {sd.designation}  ({self.steel_grade})")
        print(f"{'='*68}")
        print(f"  fy = {self.fy:.0f} N/mm²   Class {self.section_class}")
        print(f"  NEd = {self.NEd:.2f} kN   My,Ed = {abs(self.My_Ed):.2f} kNm   Mz,Ed = {abs(self.Mz_Ed):.2f} kNm")
        print(f"{'─'*68}")

        # Step 3
        print(f"  Axial          NRd     = {self.NRd:>8.2f} kN    "
              f"util = {self.NEd/self.NRd:.3f}  {P if self.NEd <= self.NRd else F}")

        # Step 4
        print(f"  Bending y      My,Rd   = {self.My_Rd:>8.2f} kNm   "
              f"util = {abs(self.My_Ed)/self.My_Rd:.3f}" if self.My_Rd > 0 else "")
        print(f"  Bending z      Mz,Rd   = {self.Mz_Rd:>8.2f} kNm   "
              f"util = {abs(self.Mz_Ed)/self.Mz_Rd:.3f}" if self.Mz_Rd > 0 else "")

        # Step 5
        print(f"  Shear          Vpl,Rd  = {self.Vpl_Rd:>8.2f} kN    "
              f"util = {self.shear_util:.3f}  {P if self.shear_ok else F}")

        # Step 6
        print(f"  Combined (cons.)       util = {self.conservative_util:.3f}  "
              f"{P if self.conservative_ok else F}")

        # Step 7
        print(f"  Combined (alt.)        util = {self.alternative_util:.3f}  "
              f"{P if self.alternative_ok else F}")

        # Step 8
        print(f"  Flex. buckling Nb,Rd   = {self.Nb_Rd:>8.2f} kN    "
              f"χy={self.chi_y:.3f}  χz={self.chi_z:.3f}  {P if self.Nb_Rd >= self.NEd else F}")

        # Step 9
        print(f"  LTB            Mb,Rd   = {self.Mb_Rd:>8.2f} kNm   "
              f"χLT={self.chi_LT:.3f}")

        # Step 10
        print(f"  Eq.6.61 = {self.eq6_61:.3f}   Eq.6.62 = {self.eq6_62:.3f}   "
              f"{P if self.combined_buckling_ok else F}")

        print(f"{'─'*68}")
        print(f"  OVERALL: {P if self.overall_ok else F}")
        print(f"{'='*68}")
