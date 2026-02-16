"""Plotly-based diagram exports for PDF reporting."""

from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path

import plotly.graph_objects as go

from ._frame_math import (
    element_geometry,
    frame_axial_at_xi,
    frame_display_moment,
    global_load_to_local,
    local_transverse_displacement,
)
from .element import TrussElement


def _slugify(name: str) -> str:
    return name.lower().replace(" ", "_")


def _configure_browser_path_for_kaleido() -> None:
    """Prefer Microsoft Edge for Kaleido if available."""
    if os.environ.get("BROWSER_PATH"):
        return

    candidates: list[str] = []
    system = platform.system()

    if system == "Windows":
        candidates.extend(
            [
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            ]
        )
    elif system == "Darwin":
        candidates.append(
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        )
    else:
        candidates.extend(
            [
                "/usr/bin/microsoft-edge",
                "/usr/bin/microsoft-edge-beta",
                "/usr/bin/microsoft-edge-dev",
            ]
        )

    for exe_name in (
        "msedge",
        "microsoft-edge",
        "microsoft-edge-beta",
        "microsoft-edge-dev",
    ):
        found = shutil.which(exe_name)
        if found:
            os.environ["BROWSER_PATH"] = found
            return

    for path in candidates:
        if Path(path).exists():
            os.environ["BROWSER_PATH"] = path
            return


def _diagram_series(
    model, element_name: str, num_points: int = 101
) -> dict[str, list[float]]:
    results = model._results
    if results is None:
        raise RuntimeError("Model must be analyzed before generating diagrams")

    elem = results.elements[element_name]
    ni, nj = elem.node_i, elem.node_j
    dx = nj.x - ni.x
    dy = nj.y - ni.y
    L, c, s = element_geometry(dx, dy)

    xs: list[float] = []
    shear: list[float] = []
    moment: list[float] = []
    deflection: list[float] = []
    axial: list[float] = []

    if L < 1e-12:
        return {
            "x": [0.0 for _ in range(num_points)],
            "shear": [0.0 for _ in range(num_points)],
            "moment": [0.0 for _ in range(num_points)],
            "deflection": [0.0 for _ in range(num_points)],
            "axial": [0.0 for _ in range(num_points)],
        }

    if isinstance(elem, TrussElement):
        n_force = results.axial_force(element_name)
        dxi, dyi, _ = results.displacements[ni.name]
        dxj, dyj, _ = results.displacements[nj.name]
        vi = local_transverse_displacement(dxi, dyi, c, s)
        vj = local_transverse_displacement(dxj, dyj, c, s)
        for k in range(num_points):
            xi = k / (num_points - 1) if num_points > 1 else 0.0
            x = xi * L
            v = (1 - xi) * vi + xi * vj
            xs.append(round(x, 6))
            shear.append(0.0)
            moment.append(0.0)
            deflection.append(round(v * 1e3, 4))
            axial.append(round(n_force / 1e3, 4))
    else:
        forces = results.element_forces.get(element_name, (0.0,) * 6)
        f1 = forces[0]
        f2 = forces[1]
        f4 = forces[3]

        w_local = 0.0
        for dl in results.distributed_loads:
            if dl.element.name == element_name:
                _, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
                w_local += wy_local

        section = getattr(elem, "section", None)
        ei = section.E * section.Iz if section else 1.0

        dxi, dyi, rzi = results.displacements[ni.name]
        dxj, dyj, rzj = results.displacements[nj.name]
        vi = local_transverse_displacement(dxi, dyi, c, s)
        ti = rzi
        vj = local_transverse_displacement(dxj, dyj, c, s)
        tj = rzj

        for k in range(num_points):
            xi = k / (num_points - 1) if num_points > 1 else 0.0
            x = xi * L

            v_force = f2 + w_local * x
            m_force = frame_display_moment(
                m_i_raw=forces[2], v_i=f2, w_local=w_local, x=x
            )

            h1 = 1 - 3 * xi**2 + 2 * xi**3
            h2 = L * (xi - 2 * xi**2 + xi**3)
            h3 = 3 * xi**2 - 2 * xi**3
            h4 = L * (-(xi**2) + xi**3)
            v = h1 * vi + h2 * ti + h3 * vj + h4 * tj
            if abs(w_local) > 1e-12 and ei > 0:
                v += w_local * x**2 * (x - L) ** 2 / (24 * ei)

            n_force = frame_axial_at_xi(f1, f4, xi)

            xs.append(round(x, 6))
            shear.append(round(v_force / 1e3, 4))
            moment.append(round(m_force / 1e3, 4))
            deflection.append(round(v * 1e3, 4))
            axial.append(round(n_force / 1e3, 4))

    return {
        "x": xs,
        "shear": shear,
        "moment": moment,
        "deflection": deflection,
        "axial": axial,
    }


def plot_combined_diagram(
    model, kind: str, output_dir: Path, *, num_points: int = 101
) -> Path:
    if kind not in {"shear", "moment", "deflection", "axial"}:
        raise ValueError(f"Unsupported diagram kind: {kind}")

    output_dir.mkdir(parents=True, exist_ok=True)
    _configure_browser_path_for_kaleido()

    y_titles = {
        "shear": "V (kN)",
        "moment": "M (kNm)",
        "deflection": "delta (mm)",
        "axial": "N (kN)",
    }
    colors = {
        "shear": "#2563eb",
        "moment": "#dc2626",
        "deflection": "#16a34a",
        "axial": "#9333ea",
    }

    fig = go.Figure()
    for elem_name in model.elements.keys():
        series = _diagram_series(model, elem_name, num_points=num_points)
        fig.add_trace(
            go.Scatter(
                x=series["x"],
                y=series[kind],
                mode="lines",
                name=elem_name,
                line={"width": 2, "color": colors[kind]},
            )
        )

    fig.update_layout(
        title=f"{model.name} - {kind.capitalize()} Diagram",
        template="plotly_white",
        xaxis_title="Position (m)",
        yaxis_title=y_titles[kind],
        legend_title="Element",
        margin={"t": 70, "r": 30, "b": 60, "l": 70},
    )
    fig.update_yaxes(zeroline=True, zerolinewidth=1, zerolinecolor="#cbd5e1")

    path = output_dir / f"{_slugify(model.name)}_{kind}_plotly.png"
    fig.write_image(str(path), width=1400, height=800, scale=2)
    print(f"  Saved: {path}")
    return path
