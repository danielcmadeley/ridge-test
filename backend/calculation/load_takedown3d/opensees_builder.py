"""OpenSees builder/solver for 3D load takedown columns-first MVP."""

from __future__ import annotations

import math

import openseespy.opensees as ops

from .types import Column


def _rect_section_props(
    size_x: float, size_y: float
) -> tuple[float, float, float, float]:
    """Return A, Iy, Iz, J for rectangle (local y=size_x, z=size_y approximation)."""
    a = size_x * size_y
    iy = (size_x * (size_y**3)) / 12.0
    iz = (size_y * (size_x**3)) / 12.0
    # Saint-Venant torsion constant approximate for solid rectangle
    b = max(size_x, size_y)
    t = min(size_x, size_y)
    j = (1.0 / 3.0) * b * (t**3) * (1.0 - 0.63 * (t / b) + 0.052 * ((t / b) ** 5))
    return a, iy, iz, j


def run_columns_analysis(
    columns: list[Column],
    top_nodal_loads_z: dict[str, float],
) -> dict[str, tuple[float, float, float]]:
    """Solve column-only 3D model and return base reactions per column id.

    Returns mapping: column_id -> (N_base_compression_pos, Vx_base, Vy_base)
    """
    if not columns:
        return {}

    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    ops.geomTransf("Linear", 1, 1.0, 0.0, 0.0)

    node_tag = 1
    elem_tag = 1
    col_node_tags: dict[str, tuple[int, int]] = {}

    for col in columns:
        base_tag = node_tag
        top_tag = node_tag + 1
        node_tag += 2

        ops.node(base_tag, col.base.x, col.base.y, col.base.z)
        ops.node(top_tag, col.base.x, col.base.y, col.base.z + col.height)
        ops.fix(base_tag, 1, 1, 1, 1, 1, 1)

        e = max(col.material.E, 1e6)
        nu = min(max(col.material.nu, 0.0), 0.49)
        g = e / (2.0 * (1.0 + nu))
        a, iy, iz, j = _rect_section_props(col.size_x, col.size_y)

        ops.element(
            "elasticBeamColumn",
            elem_tag,
            base_tag,
            top_tag,
            a,
            e,
            g,
            max(j, 1e-9),
            max(iy, 1e-9),
            max(iz, 1e-9),
            1,
        )
        elem_tag += 1
        col_node_tags[col.id] = (base_tag, top_tag)

    ops.timeSeries("Constant", 1)
    ops.pattern("Plain", 1, 1)
    for col in columns:
        fz = top_nodal_loads_z.get(col.id, 0.0)
        if abs(fz) > 0:
            _, top_tag = col_node_tags[col.id]
            ops.load(top_tag, 0.0, 0.0, fz, 0.0, 0.0, 0.0)

    ops.system("BandGeneral")
    ops.numberer("RCM")
    ops.constraints("Plain")
    ops.integrator("LoadControl", 1.0)
    ops.algorithm("Linear")
    ops.analysis("Static")

    code = ops.analyze(1)
    if code != 0:
        raise RuntimeError(f"OpenSees analysis failed with code {code}")

    ops.reactions()

    out: dict[str, tuple[float, float, float]] = {}
    for col in columns:
        base_tag, _ = col_node_tags[col.id]
        rxn = ops.nodeReaction(base_tag)
        # Compression positive under gravity
        n_base = float(rxn[2])
        vx = float(rxn[0])
        vy = float(rxn[1])
        out[col.id] = (n_base, vx, vy)

    return out
