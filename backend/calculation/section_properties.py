"""Custom section property calculations using sectionproperties."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sectionproperties.analysis.section import Section
from sectionproperties.pre.library.primitive_sections import rectangular_section


@dataclass
class SectionRectangle:
    """Rectangle primitive in mm with bottom-left origin."""

    id: str
    x_mm: float
    y_mm: float
    width_mm: float
    height_mm: float


def calculate_custom_section_properties(
    rectangles: list[SectionRectangle],
) -> dict[str, Any]:
    """Compute geometric properties for a composite rectangle section."""
    if not rectangles:
        raise ValueError("At least one rectangle is required")

    for r in rectangles:
        if r.width_mm <= 0 or r.height_mm <= 0:
            raise ValueError(f"Rectangle {r.id!r} must have positive width and height")

    geom = None
    min_dim = min(min(r.width_mm, r.height_mm) for r in rectangles)

    for r in rectangles:
        g = rectangular_section(d=r.height_mm, b=r.width_mm).shift_section(
            x_offset=r.x_mm,
            y_offset=r.y_mm,
        )
        geom = g if geom is None else geom + g

    if geom is None:
        raise ValueError("Could not construct geometry")

    mesh_size = max(1.0, min_dim / 8.0)
    geom.create_mesh(mesh_sizes=[mesh_size])

    section = Section(geometry=geom)
    section.calculate_geometric_properties()

    area = float(section.get_area())
    cx, cy = section.get_c()
    ixx, iyy, ixy = section.get_ic()
    i11, i22 = section.get_ip()
    rx, ry = section.get_rc()
    perimeter = float(section.get_perimeter())
    phi_deg = float(section.get_phi())

    warnings: list[str] = []
    j_mm4: float | None = None
    try:
        section.calculate_warping_properties()
        j_mm4 = float(section.get_j())
    except Exception:
        warnings.append("Torsion constant J could not be computed for this geometry.")

    return {
        "area_mm2": area,
        "perimeter_mm": perimeter,
        "centroid_x_mm": float(cx),
        "centroid_y_mm": float(cy),
        "ixx_mm4": float(ixx),
        "iyy_mm4": float(iyy),
        "ixy_mm4": float(ixy),
        "i11_mm4": float(i11),
        "i22_mm4": float(i22),
        "phi_deg": phi_deg,
        "rx_mm": float(rx),
        "ry_mm": float(ry),
        "j_mm4": j_mm4,
        "rectangle_count": len(rectangles),
        "warnings": warnings,
    }
