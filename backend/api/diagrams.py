"""Compute force diagram arrays from AnalysisResults."""

from __future__ import annotations

from calculation.element import TrussElement
from calculation._frame_math import (
    element_geometry,
    frame_axial_at_xi,
    frame_display_moment,
    global_load_to_local,
    local_transverse_displacement,
)
from calculation.results import AnalysisResults

from .schemas import DiagramOutput


def compute_diagrams(
    results: AnalysisResults,
    element_name: str,
    num_points: int = 101,
) -> DiagramOutput:
    """Compute shear, moment, deflection, and axial arrays along an element."""
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
        zero_x = [0.0 for _ in range(num_points)]
        return DiagramOutput(
            element_name=element_name,
            x=zero_x,
            shear=[0.0 for _ in range(num_points)],
            moment=[0.0 for _ in range(num_points)],
            deflection=[0.0 for _ in range(num_points)],
            axial=[0.0 for _ in range(num_points)],
        )

    if isinstance(elem, TrussElement):
        # Truss: constant axial, zero shear/moment, linear transverse deflection
        N = results.axial_force(element_name)
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
            deflection.append(round(v * 1e3, 4))  # mm
            axial.append(round(N / 1e3, 4))  # kN
    else:
        # Frame element
        forces = results.element_forces.get(element_name, (0,) * 6)
        f1 = forces[0]  # N_i (axial end force at i)
        f2 = forces[1]  # V_i (shear at i)
        f4 = forces[3]  # N_j (axial end force at j)

        # Local transverse distributed load
        w_local = 0.0
        for dl in results.distributed_loads:
            if dl.element.name == element_name:
                _, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
                w_local += wy_local

        # Nodal displacements in local coords
        section = getattr(elem, "section", None)
        EI = section.E * section.Iz if section else 1.0

        dxi, dyi, rzi = results.displacements[ni.name]
        dxj, dyj, rzj = results.displacements[nj.name]
        vi = local_transverse_displacement(dxi, dyi, c, s)
        ti = rzi
        vj = local_transverse_displacement(dxj, dyj, c, s)
        tj = rzj

        for k in range(num_points):
            xi = k / (num_points - 1) if num_points > 1 else 0.0
            x = xi * L

            # Shear: V(x) = f2 + w*x
            V = f2 + w_local * x

            M = frame_display_moment(m_i_raw=forces[2], v_i=f2, w_local=w_local, x=x)

            # Deflection: Hermitian shape functions + UDL correction
            H1 = 1 - 3 * xi**2 + 2 * xi**3
            H2 = L * (xi - 2 * xi**2 + xi**3)
            H3 = 3 * xi**2 - 2 * xi**3
            H4 = L * (-(xi**2) + xi**3)
            v = H1 * vi + H2 * ti + H3 * vj + H4 * tj
            if abs(w_local) > 1e-12 and EI > 0:
                v += w_local * x**2 * (x - L) ** 2 / (24 * EI)

            xs.append(round(x, 6))
            shear.append(round(V / 1e3, 4))  # kN
            moment.append(round(M / 1e3, 4))  # kNm
            deflection.append(round(v * 1e3, 4))  # mm
            # Axial: N(0)=N_i and N(L)=-N_j (OpenSees end-force convention)
            N = frame_axial_at_xi(f1, f4, xi)
            axial.append(round(N / 1e3, 4))  # kN

    return DiagramOutput(
        element_name=element_name,
        x=xs,
        shear=shear,
        moment=moment,
        deflection=deflection,
        axial=axial,
    )
