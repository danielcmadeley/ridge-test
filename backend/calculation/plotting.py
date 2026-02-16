"""Plotting facade using opsvis and matplotlib — saves to PNG files."""

from __future__ import annotations

import math
from pathlib import Path
from typing import TYPE_CHECKING

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import opsvis

from ._frame_math import (
    element_geometry,
    frame_axial_at_xi,
    frame_display_moment,
    global_load_to_local,
    local_transverse_displacement,
)
from .element import TrussElement

if TYPE_CHECKING:
    from .model import Model


_BG = "#ffffff"
_PANEL = "#ffffff"
_GRID_MAJOR = "#d4d4d4"
_GRID_MINOR = "#eeeeee"
_TEXT = "#1f2937"
_TEXT_MUTED = "#6b7280"
_MODEL_LINE = "#2563eb"


def _slugify(name: str) -> str:
    return name.lower().replace(" ", "_")


def _savefig(fig, model: Model, suffix: str, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"{_slugify(model.name)}_{suffix}.png"
    fig.savefig(path, dpi=170, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"  Saved: {path}")
    return path


def _style_axes(
    ax, title: str, *, xlabel: str = "x (m)", ylabel: str = "y (m)"
) -> None:
    fig = ax.figure
    fig.patch.set_facecolor(_BG)
    ax.set_facecolor(_PANEL)
    ax.set_title(title, color=_TEXT, fontsize=12, pad=6)
    ax.set_xlabel(xlabel, color=_TEXT_MUTED)
    ax.set_ylabel(ylabel, color=_TEXT_MUTED)
    ax.tick_params(colors=_TEXT_MUTED)
    for spine in ax.spines.values():
        spine.set_color(_GRID_MAJOR)
    ax.grid(True, color=_GRID_MAJOR, alpha=0.6, linewidth=0.8)
    ax.minorticks_on()
    ax.grid(which="minor", color=_GRID_MINOR, alpha=0.6, linewidth=0.5)


def _style_force_axes(ax, title: str) -> None:
    fig = ax.figure
    fig.patch.set_facecolor(_BG)
    ax.set_facecolor(_PANEL)
    ax.set_title(title, color=_TEXT, fontsize=10, pad=6)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.grid(False)
    for spine in ax.spines.values():
        spine.set_visible(False)


def _tint_existing_lines(ax, color: str = _MODEL_LINE, lw: float = 1.8) -> None:
    for line in ax.lines:
        line.set_color(color)
        line.set_linewidth(lw)
        line.set_alpha(0.95)


def plot_model(model: Model, output_dir: Path) -> Path:
    """Plot the undeformed model geometry."""
    fig, ax = plt.subplots()
    opsvis.plot_model(ax=ax)
    _tint_existing_lines(ax)

    # Annotate elements with section designation at midpoint
    for elem in model.elements.values():
        section = getattr(elem, "section", None)
        if section is None:
            continue
        label = section.designation or section.name
        if not label:
            continue
        mx = (elem.node_i.x + elem.node_j.x) / 2
        my = (elem.node_i.y + elem.node_j.y) / 2
        ax.text(
            mx,
            my,
            label,
            fontsize=7,
            color=_TEXT,
            ha="center",
            va="bottom",
            bbox=dict(boxstyle="round,pad=0.2", fc="#ffffff", ec="#a3a3a3", alpha=0.95),
        )

    ax.set_aspect("equal")
    _style_axes(ax, f"{model.name} — Model Geometry")
    return _savefig(fig, model, "model", output_dir)


def plot_loads(model: Model, output_dir: Path) -> Path:
    """Plot the model with load arrows overlaid."""
    fig, ax = plt.subplots()
    opsvis.plot_model(ax=ax)
    _tint_existing_lines(ax)

    for nl in model._nodal_loads:
        nd = nl.node
        _draw_load_arrow(ax, nd.x, nd.y, nl.fx, nl.fy)

    for dl in model._distributed_loads:
        _draw_udl(ax, dl)

    ax.set_aspect("equal")
    _style_axes(ax, f"{model.name} — Applied Loads")
    return _savefig(fig, model, "loads", output_dir)


def plot_deformation(model: Model, output_dir: Path, scale: float = 100.0) -> Path:
    """Plot the deformed shape."""
    fig, ax = plt.subplots()
    if model._results is None:
        opsvis.plot_defo(ax=ax, sfac=scale)
    else:
        _draw_model_outline(ax, model, color="#a3a3a3", lw=1.0)
        scale, max_mm = _draw_deflection_diagram(ax, model)
    if model._results is None:
        max_mm = _max_displacement_mm(model)
    ax.set_aspect("equal")
    _style_axes(
        ax,
        f"{model.name} — Deformed Shape (max={max_mm:.3f} mm, visual scale={scale:.1f}x)",
    )
    return _savefig(fig, model, "deformation", output_dir)


def plot_axial(model: Model, output_dir: Path, scale: float = 0.0001) -> Path:
    """Plot axial force diagram."""
    fig, ax = plt.subplots()
    if model._results is None:
        opsvis.section_force_diagram_2d("N", sfac=scale, ax=ax)
    else:
        _draw_force_diagram(ax, model, kind="axial")
    ax.set_aspect("equal")
    _style_force_axes(ax, f"{model.name} — Axial Diagram (kN)")
    return _savefig(fig, model, "axial", output_dir)


def plot_shear(model: Model, output_dir: Path, scale: float = 0.0001) -> Path:
    """Plot shear force diagram."""
    fig, ax = plt.subplots()
    if model._results is None:
        opsvis.section_force_diagram_2d("T", sfac=scale, ax=ax)
    else:
        _draw_force_diagram(ax, model, kind="shear")
    ax.set_aspect("equal")
    _style_force_axes(ax, f"{model.name} — Shear Envelope (kN)")
    return _savefig(fig, model, "shear", output_dir)


def plot_moment(model: Model, output_dir: Path, scale: float = 0.0001) -> Path:
    """Plot bending moment diagram."""
    fig, ax = plt.subplots()
    if model._results is None:
        opsvis.section_force_diagram_2d("M", sfac=scale, ax=ax)
    else:
        _draw_force_diagram(ax, model, kind="moment")
    ax.set_aspect("equal")
    _style_force_axes(ax, f"{model.name} — Bending Moment (kNm)")
    return _savefig(fig, model, "moment", output_dir)


# ── helpers ──────────────────────────────────────────────────────────


def _draw_load_arrow(ax, x: float, y: float, fx: float, fy: float) -> None:
    """Draw a force arrow at a node."""
    max_f = max(abs(fx), abs(fy), 1e-12)
    arrow_len = 0.5
    if abs(fx) > 1e-6:
        ax.annotate(
            "",
            xy=(x, y),
            xytext=(x - arrow_len * fx / max_f, y),
            arrowprops=dict(arrowstyle="->", color="red", lw=1.5),
        )
        ax.text(
            x - arrow_len * fx / max_f * 0.5,
            y,
            f"{fx:.0f} N",
            fontsize=7,
            color="#1f2937",
            ha="center",
            va="bottom",
        )
    if abs(fy) > 1e-6:
        ax.annotate(
            "",
            xy=(x, y),
            xytext=(x, y - arrow_len * fy / max_f),
            arrowprops=dict(arrowstyle="->", color="blue", lw=1.5),
        )
        ax.text(
            x,
            y - arrow_len * fy / max_f * 0.5,
            f"{fy:.0f} N",
            fontsize=7,
            color="#1f2937",
            ha="left",
            va="center",
        )


def _draw_udl(ax, dl) -> None:
    """Draw a simplified UDL indicator along an element."""
    elem = dl.element
    xi, yi = elem.node_i.x, elem.node_i.y
    xj, yj = elem.node_j.x, elem.node_j.y
    n_arrows = 8
    for i in range(n_arrows + 1):
        t = i / n_arrows
        px = xi + t * (xj - xi)
        py = yi + t * (yj - yi)
        if abs(dl.wy) > 1e-6:
            arrow_len = 0.3
            sign = 1.0 if dl.wy > 0 else -1.0
            ax.annotate(
                "",
                xy=(px, py),
                xytext=(px, py - sign * arrow_len),
                arrowprops=dict(arrowstyle="->", color="green", lw=0.8),
            )

    mx = 0.5 * (xi + xj)
    my = 0.5 * (yi + yj)
    labels: list[str] = []
    if abs(dl.wx) > 1e-6:
        labels.append(f"wx={dl.wx / 1e3:.2f} kN/m")
    if abs(dl.wy) > 1e-6:
        labels.append(f"wy={dl.wy / 1e3:.2f} kN/m")
    if labels:
        ax.text(
            mx,
            my,
            ", ".join(labels),
            fontsize=7,
            color="#166534",
            ha="center",
            va="bottom",
            bbox=dict(boxstyle="round,pad=0.2", fc="#ffffff", ec="#86efac", alpha=0.95),
        )


def _draw_model_outline(
    ax, model: Model, color: str = _MODEL_LINE, lw: float = 1.5
) -> None:
    for elem in model.elements.values():
        ax.plot(
            [elem.node_i.x, elem.node_j.x],
            [elem.node_i.y, elem.node_j.y],
            color=color,
            lw=lw,
            zorder=1,
        )


def _model_span(model: Model) -> float:
    if not model.nodes:
        return 1.0
    xs = [n.x for n in model.nodes.values()]
    ys = [n.y for n in model.nodes.values()]
    return max(max(xs) - min(xs), max(ys) - min(ys), 1.0)


def _auto_deformation_scale(model: Model) -> float:
    assert model._results is not None
    max_disp = 0.0
    for dx, dy, _ in model._results.displacements.values():
        max_disp = max(max_disp, math.hypot(dx, dy))
    if max_disp < 1e-12:
        return 100.0
    target = 0.2 * _model_span(model)
    return round(max(100.0, min(2_000_000.0, target / max_disp)), 1)


def _max_displacement_mm(model: Model) -> float:
    if model._results is None:
        return 0.0
    max_disp = 0.0
    for dx, dy, _ in model._results.displacements.values():
        max_disp = max(max_disp, math.hypot(dx, dy))
    return max_disp * 1e3


def _draw_deformed_shape(ax, model: Model, scale: float) -> None:
    assert model._results is not None
    for elem in model.elements.values():
        ni, nj = elem.node_i, elem.node_j
        dxi, dyi, _ = model._results.displacements.get(ni.name, (0.0, 0.0, 0.0))
        dxj, dyj, _ = model._results.displacements.get(nj.name, (0.0, 0.0, 0.0))
        x0, y0 = ni.x, ni.y
        x1, y1 = nj.x, nj.y
        xd0, yd0 = ni.x + dxi * scale, ni.y + dyi * scale
        xd1, yd1 = nj.x + dxj * scale, nj.y + dyj * scale

        ax.fill(
            [x0, x1, xd1, xd0],
            [y0, y1, yd1, yd0],
            color="#86efac",
            alpha=0.55,
            zorder=2,
        )
        ax.plot(
            [xd0, xd1],
            [yd0, yd1],
            color="#16a34a",
            lw=2.0,
            zorder=3,
        )
        ax.plot([xd0, xd1], [yd0, yd1], "o", ms=3.0, color="#166534", zorder=4)


def _draw_deflection_diagram(ax, model: Model) -> tuple[float, float]:
    assert model._results is not None
    samples_per_elem = 61

    max_abs_v = 0.0
    for name, elem in model.elements.items():
        ni, nj = elem.node_i, elem.node_j
        dx = nj.x - ni.x
        dy = nj.y - ni.y
        L, c, s = element_geometry(dx, dy)
        if L < 1e-12:
            continue

        dxi, dyi, rzi = model._results.displacements.get(ni.name, (0.0, 0.0, 0.0))
        dxj, dyj, rzj = model._results.displacements.get(nj.name, (0.0, 0.0, 0.0))
        vi = local_transverse_displacement(dxi, dyi, c, s)
        vj = local_transverse_displacement(dxj, dyj, c, s)

        w_local = 0.0
        ei = 1.0
        if not isinstance(elem, TrussElement):
            for dl in model._results.distributed_loads:
                if dl.element.name == name:
                    _, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
                    w_local += wy_local
            section = getattr(elem, "section", None)
            if section is not None:
                ei = section.E * section.Iz

        for k in range(samples_per_elem):
            xi = k / (samples_per_elem - 1)
            x = xi * L
            if isinstance(elem, TrussElement):
                v = (1 - xi) * vi + xi * vj
            else:
                h1 = 1 - 3 * xi**2 + 2 * xi**3
                h2 = L * (xi - 2 * xi**2 + xi**3)
                h3 = 3 * xi**2 - 2 * xi**3
                h4 = L * (-(xi**2) + xi**3)
                v = h1 * vi + h2 * rzi + h3 * vj + h4 * rzj
                if abs(w_local) > 1e-12 and ei > 0:
                    v += w_local * x**2 * (x - L) ** 2 / (24 * ei)
            max_abs_v = max(max_abs_v, abs(v))

    if max_abs_v < 1e-12:
        return 1.0, 0.0

    scale = 0.06 * _model_span(model) / max_abs_v

    for name, elem in model.elements.items():
        ni, nj = elem.node_i, elem.node_j
        dx = nj.x - ni.x
        dy = nj.y - ni.y
        L, c, s = element_geometry(dx, dy)
        if L < 1e-12:
            continue
        nx, ny = -s, c

        dxi, dyi, rzi = model._results.displacements.get(ni.name, (0.0, 0.0, 0.0))
        dxj, dyj, rzj = model._results.displacements.get(nj.name, (0.0, 0.0, 0.0))
        vi = local_transverse_displacement(dxi, dyi, c, s)
        vj = local_transverse_displacement(dxj, dyj, c, s)

        w_local = 0.0
        ei = 1.0
        if not isinstance(elem, TrussElement):
            for dl in model._results.distributed_loads:
                if dl.element.name == name:
                    _, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
                    w_local += wy_local
            section = getattr(elem, "section", None)
            if section is not None:
                ei = section.E * section.Iz

        base_xs: list[float] = []
        base_ys: list[float] = []
        def_xs: list[float] = []
        def_ys: list[float] = []
        for k in range(samples_per_elem):
            xi = k / (samples_per_elem - 1)
            x = xi * L

            if isinstance(elem, TrussElement):
                v = (1 - xi) * vi + xi * vj
            else:
                h1 = 1 - 3 * xi**2 + 2 * xi**3
                h2 = L * (xi - 2 * xi**2 + xi**3)
                h3 = 3 * xi**2 - 2 * xi**3
                h4 = L * (-(xi**2) + xi**3)
                v = h1 * vi + h2 * rzi + h3 * vj + h4 * rzj
                if abs(w_local) > 1e-12 and ei > 0:
                    v += w_local * x**2 * (x - L) ** 2 / (24 * ei)

            gx = ni.x + c * x
            gy = ni.y + s * x
            base_xs.append(gx)
            base_ys.append(gy)
            def_xs.append(gx + nx * v * scale)
            def_ys.append(gy + ny * v * scale)

        ax.fill(
            base_xs + def_xs[::-1],
            base_ys + def_ys[::-1],
            color="#86efac",
            alpha=0.5,
            zorder=2,
        )
        ax.plot(def_xs, def_ys, color="#16a34a", lw=1.8, zorder=3)

    return scale, max_abs_v * 1e3


def _draw_force_diagram(ax, model: Model, kind: str) -> float:
    assert model._results is not None
    _draw_model_outline(ax, model, color="#9ca3af", lw=1.0)

    samples_per_elem = 41
    max_abs = 0.0

    for name, elem in model.elements.items():
        ni, nj = elem.node_i, elem.node_j
        dx = nj.x - ni.x
        dy = nj.y - ni.y
        L, c, s = element_geometry(dx, dy)
        if L < 1e-12:
            continue

        forces = model._results.element_forces.get(name, (0.0,) * 6)
        n_i, v_i, m_i, n_j, _, _ = forces

        w_local = 0.0
        for dl in model._results.distributed_loads:
            if dl.element.name == name:
                _, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
                w_local += wy_local

        for k in range(samples_per_elem):
            x = L * k / (samples_per_elem - 1)
            xi = x / L
            if kind == "axial":
                val = frame_axial_at_xi(n_i, n_j, xi)
            elif kind == "shear":
                val = v_i + w_local * x
            else:
                val = frame_display_moment(m_i_raw=m_i, v_i=v_i, w_local=w_local, x=x)
            max_abs = max(max_abs, abs(val))

    if max_abs < 1e-9:
        return 1.0

    scale = 0.12 * _model_span(model) / max_abs

    colors = {
        "axial": {"fill": "#c7d2fe", "edge": "#6366f1"},
        "shear": {"fill": "#c7e5b8", "edge": "#5a8f45"},
        "moment": {"fill": "#e6ccf5", "edge": "#8b5fbf"},
    }[kind]

    for name, elem in model.elements.items():
        ni, nj = elem.node_i, elem.node_j
        dx = nj.x - ni.x
        dy = nj.y - ni.y
        L, c, s = element_geometry(dx, dy)
        if L < 1e-12:
            continue
        nx, ny = -s, c

        forces = model._results.element_forces.get(name, (0.0,) * 6)
        n_i, v_i, m_i, n_j, _, _ = forces

        w_local = 0.0
        for dl in model._results.distributed_loads:
            if dl.element.name == name:
                _, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
                w_local += wy_local

        xs: list[float] = []
        ys: list[float] = []
        base_xs: list[float] = []
        base_ys: list[float] = []
        vals: list[float] = []
        for k in range(samples_per_elem):
            x = L * k / (samples_per_elem - 1)
            xi = x / L
            if kind == "axial":
                val = frame_axial_at_xi(n_i, n_j, xi)
            elif kind == "shear":
                val = v_i + w_local * x
            else:
                val = frame_display_moment(m_i_raw=m_i, v_i=v_i, w_local=w_local, x=x)

            gx = ni.x + c * x
            gy = ni.y + s * x
            base_xs.append(gx)
            base_ys.append(gy)
            xs.append(gx + nx * val * scale)
            ys.append(gy + ny * val * scale)
            vals.append(val)

        ax.plot(base_xs, base_ys, color="#6b7280", lw=0.8, zorder=1)

        ax.fill(
            base_xs + xs[::-1],
            base_ys + ys[::-1],
            color=colors["fill"],
            alpha=0.65,
            zorder=2,
        )
        ax.plot(xs, ys, color=colors["edge"], lw=1.4, zorder=3)
        ax.plot(
            [xs[0], xs[-1]],
            [ys[0], ys[-1]],
            "o",
            ms=2.8,
            color=colors["edge"],
            zorder=4,
        )

        candidates = {0, len(vals) - 1}
        candidates.add(max(range(len(vals)), key=lambda i: vals[i]))
        candidates.add(min(range(len(vals)), key=lambda i: vals[i]))
        unit_scale = 1e3
        value_offset = 0.035 * _model_span(model)
        for idx in candidates:
            v = vals[idx]
            if abs(v) < 0.08 * max_abs:
                continue
            tx = xs[idx] + nx * value_offset
            ty = ys[idx] + ny * value_offset
            ax.text(
                tx,
                ty,
                f"{v / unit_scale:.1f}",
                fontsize=6.5,
                color="#374151",
                ha="center",
                va="center",
                zorder=5,
            )

    return scale
