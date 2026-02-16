"""Full geometric properties of a hollow steel section for EC3 design."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HollowSectionData:
    """All geometric properties needed for EC3 truss member design.

    Units follow published section tables:
    - Dimensions: mm
    - Areas: cm²
    - Second moments of area: cm⁴
    - Section moduli: cm³
    - Radii of gyration: mm
    - Mass: kg/m
    """

    designation: str
    h: float       # mm — overall depth
    b: float       # mm — overall width (= h for SHS)
    t: float       # mm — wall thickness
    A: float       # cm² — cross-section area
    Iy: float      # cm⁴ — 2nd moment of area, major axis
    Iz: float      # cm⁴ — 2nd moment of area, minor axis (= Iy for SHS)
    iy: float      # mm — radius of gyration, major axis
    iz: float      # mm — radius of gyration, minor axis (= iy for SHS)
    Wel_y: float   # cm³ — elastic section modulus, major axis
    Wpl_y: float   # cm³ — plastic section modulus, major axis
    Wel_z: float   # cm³ — elastic section modulus, minor axis
    Wpl_z: float   # cm³ — plastic section modulus, minor axis
    mass_per_metre: float  # kg/m
    section_type: str = "SHS"  # "SHS" or "RHS"
