"""Columns-first 3D load takedown analysis engine."""

from __future__ import annotations

import time

from .mesh import distribute_slab_udl_to_columns
from .opensees_builder import run_columns_analysis
from .results import load_balance_warning
from .types import (
    Column,
    ColumnReaction,
    LevelForce,
    LoadTakedownModel,
    LoadTakedownResult,
)


def _validate(model: LoadTakedownModel) -> None:
    if model.units != "SI":
        raise ValueError("Only SI units are supported")
    if model.version != "0.1":
        raise ValueError("Model version must be '0.1'")
    if model.grid_size <= 0:
        raise ValueError("gridSize must be positive")
    if not model.slabs:
        raise ValueError("At least one slab is required")
    if not model.columns:
        raise ValueError("At least one column is required")

    for slab in model.slabs:
        if slab.width <= 0 or slab.depth <= 0 or slab.thickness <= 0:
            raise ValueError(f"Slab {slab.id!r} has non-positive dimensions")
        if slab.material.E <= 0:
            raise ValueError(f"Slab {slab.id!r} has invalid material E")

    for col in model.columns:
        if col.height <= 0 or col.size_x <= 0 or col.size_y <= 0:
            raise ValueError(f"Column {col.id!r} has non-positive dimensions")
        if col.material.E <= 0:
            raise ValueError(f"Column {col.id!r} has invalid material E")


def run_load_takedown(model: LoadTakedownModel) -> LoadTakedownResult:
    """Run columns-first gravity load takedown analysis."""
    _validate(model)
    warnings: list[str] = []

    if model.walls:
        warnings.append(
            "Wall analysis is not yet enabled in columns-first MVP; walls are ignored."
        )

    t0 = time.perf_counter()
    top_loads_z, total_applied, load_warnings, level_contributions = (
        distribute_slab_udl_to_columns(
            slabs=model.slabs,
            columns=model.columns,
            slab_udl=model.slab_udl,
        )
    )
    warnings.extend(load_warnings)
    t1 = time.perf_counter()

    reactions = run_columns_analysis(
        columns=model.columns, top_nodal_loads_z=top_loads_z
    )
    t2 = time.perf_counter()

    columns_out = _format_columns(
        model.columns,
        reactions,
        model.storeys,
        level_contributions,
    )
    total_vertical_reaction = sum(c.n_base for c in columns_out)

    balance_warning = load_balance_warning(total_vertical_reaction, total_applied)
    if balance_warning:
        warnings.append(balance_warning)

    warnings.append(
        f"Timing: load distribution={t1 - t0:.3f}s, analysis={t2 - t1:.3f}s"
    )

    return LoadTakedownResult(
        total_vertical_reaction=total_vertical_reaction,
        total_applied_load=total_applied,
        columns=columns_out,
        walls=[],
        warnings=warnings,
    )


def _format_columns(
    columns: list[Column],
    reactions: dict[str, tuple[float, float, float]],
    storeys,
    level_contributions: dict[str, list[tuple[float, float]]],
) -> list[ColumnReaction]:
    out: list[ColumnReaction] = []
    for col in columns:
        n, vx, vy = reactions.get(col.id, (0.0, 0.0, 0.0))
        top = col.base.z + col.height
        lo = min(col.base.z, top)
        hi = max(col.base.z, top)

        levels = sorted(
            {s.elevation for s in storeys if lo - 1e-6 <= s.elevation <= hi + 1e-6}
            | {col.base.z},
            reverse=True,
        )

        contrib = level_contributions.get(col.id, [])
        level_forces: list[LevelForce] = []
        for lv in levels:
            n_down = sum(load for elev, load in contrib if elev >= lv - 1e-9)
            level_forces.append(LevelForce(elevation=lv, n_down=n_down))

        out.append(
            ColumnReaction(
                id=col.id,
                n_base=n,
                vx_base=vx,
                vy_base=vy,
                level_forces=level_forces,
            )
        )
    return out
