"""Material dataclass for truss elements."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Material:
    """Uniaxial elastic material for truss elements."""

    name: str
    E: float  # Young's modulus (Pa)
    A: float  # Cross-section area (m^2)
    tag: int = 0  # assigned by Model
