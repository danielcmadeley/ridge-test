"""Geometry/load helpers for 3D load takedown.

Columns-first MVP: slab load is distributed to connected columns using
Voronoi tributary areas clipped by slab rectangle boundaries.
"""

from __future__ import annotations

from .types import Column, Slab

EPS = 1e-9


def _poly_area(poly: list[tuple[float, float]]) -> float:
    if len(poly) < 3:
        return 0.0
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return abs(a) * 0.5


def _clip_half_plane(
    poly: list[tuple[float, float]],
    a: float,
    b: float,
    c: float,
) -> list[tuple[float, float]]:
    """Clip polygon by half-plane a*x + b*y <= c."""
    if not poly:
        return []
    out: list[tuple[float, float]] = []
    n = len(poly)
    for i in range(n):
        sx, sy = poly[i]
        ex, ey = poly[(i + 1) % n]
        s_in = (a * sx + b * sy) <= c + EPS
        e_in = (a * ex + b * ey) <= c + EPS

        if s_in and e_in:
            out.append((ex, ey))
        elif s_in and not e_in:
            denom = a * (ex - sx) + b * (ey - sy)
            if abs(denom) > EPS:
                t = (c - a * sx - b * sy) / denom
                out.append((sx + t * (ex - sx), sy + t * (ey - sy)))
        elif (not s_in) and e_in:
            denom = a * (ex - sx) + b * (ey - sy)
            if abs(denom) > EPS:
                t = (c - a * sx - b * sy) / denom
                out.append((sx + t * (ex - sx), sy + t * (ey - sy)))
            out.append((ex, ey))

    return out


def _voronoi_cell_clipped_to_rect(
    px: float,
    py: float,
    others: list[tuple[float, float]],
    rect: tuple[float, float, float, float],
) -> list[tuple[float, float]]:
    x0, y0, x1, y1 = rect
    poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

    for qx, qy in others:
        # region closer to p than q: a*x + b*y <= c
        a = 2.0 * (qx - px)
        b = 2.0 * (qy - py)
        c = qx * qx + qy * qy - px * px - py * py
        poly = _clip_half_plane(poly, a, b, c)
        if len(poly) < 3:
            return []

    return poly


def distribute_slab_udl_to_columns(
    slabs: list[Slab],
    columns: list[Column],
    slab_udl: float,
) -> tuple[dict[str, float], float, list[str], dict[str, list[tuple[float, float]]]]:
    """Distribute slab gravity load to nearest connected columns.

    Returns:
        - per-column top nodal load in global -Z (N, negative downwards)
        - total applied vertical load magnitude (N, positive)
        - warnings
        - per-column level contributions [(slab_elevation, load_magnitude_N)]
    """
    nodal_loads: dict[str, float] = {c.id: 0.0 for c in columns}
    level_contributions: dict[str, list[tuple[float, float]]] = {
        c.id: [] for c in columns
    }
    warnings: list[str] = []
    total_applied = 0.0

    if slab_udl <= 0:
        warnings.append("slabUDL is non-positive; no gravity load applied.")
        return nodal_loads, total_applied, warnings, level_contributions

    for slab in slabs:
        slab_area = slab.width * slab.depth
        if slab_area <= 0:
            warnings.append(f"Slab {slab.id!r} has non-positive area and is ignored.")
            continue

        total_applied += slab_udl * slab_area

        # Columns considered connected if slab elevation lies on the column span.
        connected = [
            c
            for c in columns
            if (
                min(c.base.z, c.base.z + c.height) - max(0.05, slab.thickness)
                <= slab.elevation
                <= max(c.base.z, c.base.z + c.height) + max(0.05, slab.thickness)
            )
        ]

        if not connected:
            warnings.append(
                f"Slab {slab.id!r} has no connected columns at elevation {slab.elevation:.3f} m."
            )
            continue

        rect = (
            slab.origin.x,
            slab.origin.y,
            slab.origin.x + slab.width,
            slab.origin.y + slab.depth,
        )

        # Group coincident supports to avoid double-counting in Voronoi partition.
        unique_sites: dict[tuple[int, int], list[Column]] = {}
        for c in connected:
            key = (round(c.base.x / 1e-6), round(c.base.y / 1e-6))
            unique_sites.setdefault(key, []).append(c)

        points = [
            (cols[0].base.x, cols[0].base.y, cols) for cols in unique_sites.values()
        ]

        if len(points) == 1:
            only = points[0][2]
            each = -(slab_udl * slab_area) / len(only)
            for c in only:
                nodal_loads[c.id] += each
                level_contributions[c.id].append((slab.elevation, -each))
            continue

        for i, (px, py, cols_here) in enumerate(points):
            others = [(qx, qy) for j, (qx, qy, _) in enumerate(points) if j != i]
            cell = _voronoi_cell_clipped_to_rect(px, py, others, rect)
            area = _poly_area(cell)
            if area <= 0:
                continue
            load = -(slab_udl * area) / len(cols_here)
            for c in cols_here:
                nodal_loads[c.id] += load
                level_contributions[c.id].append((slab.elevation, -load))

    return nodal_loads, total_applied, warnings, level_contributions
