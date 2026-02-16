"""Section dataclass for frame elements."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Section:
    """Elastic beam-column section properties."""

    name: str
    A: float   # Cross-section area (m^2)
    Iz: float  # Second moment of area about z-axis (m^4)
    E: float   # Young's modulus (Pa)
    tag: int = 0  # assigned by Model
    designation: str = ""  # e.g. "UB 305x127x42"
    mass_per_metre: float = 0.0  # kg/m, used for self-weight calculation
