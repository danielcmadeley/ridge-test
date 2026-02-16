"""Full geometric properties of a steel section for EC3 design."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SteelSectionData:
    """All geometric properties needed for EC3 beam design.

    Units follow published section tables:
    - Dimensions: mm
    - Areas: cm²
    - Second moments of area: cm⁴
    - Warping constant: cm⁶
    - Section moduli: cm³
    - Mass: kg/m
    """

    designation: str
    h: float       # mm  — overall section depth
    b: float       # mm  — flange width
    tw: float      # mm  — web thickness
    tf: float      # mm  — flange thickness
    r: float       # mm  — root radius
    d: float       # mm  — depth between root fillets
    hi: float      # mm  — clear web height (h − 2·tf)
    A: float       # cm² — cross-section area
    Iy: float      # cm⁴ — 2nd moment of area, major axis
    Iz: float      # cm⁴ — 2nd moment of area, minor axis
    It: float      # cm⁴ — St Venant torsion constant
    Iw: float      # cm⁶ — warping constant
    Wel_y: float   # cm³ — elastic section modulus, major axis
    Wpl_y: float   # cm³ — plastic section modulus, major axis
    Wel_z: float   # cm³ — elastic section modulus, minor axis
    Wpl_z: float   # cm³ — plastic section modulus, minor axis
    mass_per_metre: float  # kg/m
