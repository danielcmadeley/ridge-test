"""Analysis results container."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from ._frame_math import (
    element_geometry,
    frame_internal_moment,
    global_to_local_components,
    global_load_to_local,
    local_transverse_displacement,
)
from .node import Node
from .support import Support

if TYPE_CHECKING:
    from .element import FrameElement, TrussElement
    from .load import DistributedLoad


@dataclass
class AnalysisResults:
    """Stores analysis output: reactions and node displacements."""

    reactions: dict[str, tuple[float, float, float]] = field(default_factory=dict)
    displacements: dict[str, tuple[float, float, float]] = field(default_factory=dict)
    supports: list[Support] = field(default_factory=list)
    elements: dict[str, FrameElement | TrussElement] = field(default_factory=dict)
    distributed_loads: list[DistributedLoad] = field(default_factory=list)
    element_forces: dict[str, tuple] = field(default_factory=dict)

    def max_deflection(self, elem_name: str) -> tuple[float, float]:
        """Compute max transverse deflection for a frame element.

        Uses Hermitian shape-function interpolation of the nodal DOFs
        plus the fixed-fixed particular solution for any UDL on the
        element (the correction term the cubic interpolation misses).

        Returns:
            (deflection_mm, x_location_m) — signed deflection in mm and
            the distance from node_i where it occurs.
        """
        elem = self.elements[elem_name]
        section = getattr(elem, "section", None)
        if section is None:
            return 0.0, 0.0

        ni, nj = elem.node_i, elem.node_j
        dx = nj.x - ni.x
        dy = nj.y - ni.y
        L, c, s = element_geometry(dx, dy)
        if L < 1e-12:
            return 0.0, 0.0

        # Global displacements at element end-nodes
        dxi, dyi, rzi = self.displacements[ni.name]
        dxj, dyj, rzj = self.displacements[nj.name]

        # Transform to local transverse displacement & rotation
        vi = local_transverse_displacement(dxi, dyi, c, s)
        ti = rzi
        vj = local_transverse_displacement(dxj, dyj, c, s)
        tj = rzj

        # Sum distributed loads on this element in local transverse direction
        w_local = 0.0
        for dl in self.distributed_loads:
            if dl.element.name == elem_name:
                _, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
                w_local += wy_local

        EI = section.E * section.Iz

        # Sample at 100 points along the element
        best_abs = 0.0
        best_v = 0.0
        best_x = 0.0
        for k in range(101):
            xi = k / 100
            x = xi * L

            # Hermitian shape functions
            H1 = 1 - 3 * xi**2 + 2 * xi**3
            H2 = L * (xi - 2 * xi**2 + xi**3)
            H3 = 3 * xi**2 - 2 * xi**3
            H4 = L * (-(xi**2) + xi**3)

            v = H1 * vi + H2 * ti + H3 * vj + H4 * tj

            # Fixed-fixed particular solution for UDL correction
            if abs(w_local) > 1e-12 and EI > 0:
                v += w_local * x**2 * (x - L) ** 2 / (24 * EI)

            if abs(v) > best_abs:
                best_abs = abs(v)
                best_v = v
                best_x = x

        return best_v * 1e3, best_x  # mm, m

    def _local_w(self, elem_name: str) -> tuple[float, float, float, float]:
        """Return (w_local, L, f2, f3) for internal force calculations."""
        elem = self.elements[elem_name]
        ni, nj = elem.node_i, elem.node_j
        dx = nj.x - ni.x
        dy = nj.y - ni.y
        L, c, s = element_geometry(dx, dy)
        if L < 1e-12:
            return 0.0, 0.0, 0.0, 0.0

        w_local = 0.0
        for dl in self.distributed_loads:
            if dl.element.name == elem_name:
                _, wy_local = global_load_to_local(dl.wx, dl.wy, c, s)
                w_local += wy_local

        forces = self.element_forces.get(elem_name, (0,) * 6)
        f2 = forces[1]  # local shear at node i
        f3 = -forces[2]  # negate OpenSees end moment at i for internal convention
        return w_local, L, f2, f3

    def max_shear(self, elem_name: str) -> tuple[float, float]:
        """Max absolute shear force along an element.

        Returns (V_N, x_m) — shear in N and distance from node_i in m.
        """
        w, L, f2, _ = self._local_w(elem_name)
        best_abs = 0.0
        best_v = 0.0
        best_x = 0.0
        for k in range(101):
            x = k / 100 * L
            V = f2 + w * x
            if abs(V) > best_abs:
                best_abs = abs(V)
                best_v = V
                best_x = x
        return best_v, best_x

    def max_moment(self, elem_name: str) -> tuple[float, float]:
        """Max absolute bending moment along an element.

        Returns (M_Nm, x_m) — moment in N-m and distance from node_i in m.
        """
        w, L, f2, f3 = self._local_w(elem_name)
        best_abs = 0.0
        best_m = 0.0
        best_x = 0.0
        for k in range(101):
            x = k / 100 * L
            M = frame_internal_moment(m_i_raw=-f3, v_i=f2, w_local=w, x=x)
            if abs(M) > best_abs:
                best_abs = abs(M)
                best_m = M
                best_x = x
        return best_m, best_x

    def force_distribution(self, elem_name: str) -> tuple[float, float, float]:
        """Return force distribution parameters for an element.

        Returns (shear_at_i_N, moment_at_i_Nm, w_local_Npm) used for
        internal force computation: V(x) = shear + w*x,
        M(x) = moment + shear*x + w*x²/2.
        """
        w, L, f2, f3 = self._local_w(elem_name)
        return f2, f3, w

    def axial_force(self, elem_name: str) -> float:
        """Axial force in an element (positive = tension, negative = compression).

        Works for both truss and frame elements.
        """
        from .element import TrussElement

        elem = self.elements[elem_name]
        forces = self.element_forces.get(elem_name, (0,) * 6)

        if isinstance(elem, TrussElement):
            # Truss: stored forces are global [Fx_i,Fy_i,0,Fx_j,Fy_j,0]
            ni, nj = elem.node_i, elem.node_j
            dx = nj.x - ni.x
            dy = nj.y - ni.y
            L, c, s = element_geometry(dx, dy)
            if L < 1e-12:
                return 0.0
            n_j, _ = global_to_local_components(forces[3], forces[4], c, s)
            return n_j
        else:
            # Frame: stored forces are local, forces[0] = N_i
            return forces[0]

    def print_member_forces(self) -> None:
        """Print axial forces for all elements (useful for trusses)."""
        print("\n=== Member Forces ===")
        print(
            f"{'Name':<10} {'Nodes':<12} {'Length (m)':>10}"
            f"  {'Axial (kN)':>12} {'Type':>6}"
        )
        print("-" * 54)
        for name, elem in self.elements.items():
            ni, nj = elem.node_i, elem.node_j
            L = math.hypot(nj.x - ni.x, nj.y - ni.y)
            N = self.axial_force(name)
            N_kN = N / 1e3
            if N > 1e-3:
                member_type = "T"
            elif N < -1e-3:
                member_type = "C"
            else:
                member_type = "-"
            print(
                f"{name:<10} {ni.name + '-' + nj.name:<12} {L:>10.3f}"
                f"  {N_kN:>12.2f} {member_type:>6}"
            )

    def print_elements(self) -> None:
        """Print a table of elements with section, end moments, and max deflection."""
        print("\n=== Elements ===")
        print(
            f"{'Name':<10} {'Section':<22} {'Length (m)':>10}"
            f"  {'Mi (kNm)':>10} {'Mj (kNm)':>10}"
            f"  {'Max defl (mm)':>14} {'@ x (m)':>8}"
        )
        print("-" * 88)
        for name, elem in self.elements.items():
            ni, nj = elem.node_i, elem.node_j
            length = math.hypot(nj.x - ni.x, nj.y - ni.y)
            section = getattr(elem, "section", None)
            designation = ""
            if section is not None:
                designation = section.designation or section.name
            # End moments from element forces [N_i, V_i, M_i, N_j, V_j, M_j]
            forces = self.element_forces.get(name)
            mi_kn = -forces[2] / 1e3 if forces else 0.0
            mj_kn = forces[5] / 1e3 if forces else 0.0
            defl_mm, defl_x = self.max_deflection(name)
            print(
                f"{name:<10} {designation:<22} {length:>10.2f}"
                f"  {mi_kn:>10.2f} {mj_kn:>10.2f}"
                f"  {defl_mm:>14.4f} {defl_x:>8.2f}"
            )

    def print_reactions(self) -> None:
        """Print reaction forces at each support."""
        print("\n=== Reactions ===")
        print(f"{'Node':<10} {'Fx (kN)':>14} {'Fy (kN)':>14} {'Mz (kNm)':>14}")
        print("-" * 56)
        total_fx = total_fy = total_mz = 0.0
        for name, (fx, fy, mz) in self.reactions.items():
            print(f"{name:<10} {fx / 1e3:>14.2f} {fy / 1e3:>14.2f} {mz / 1e3:>14.2f}")
            total_fx += fx
            total_fy += fy
            total_mz += mz
        print("-" * 56)
        print(
            f"{'Total':<10} {total_fx / 1e3:>14.2f} {total_fy / 1e3:>14.2f} {total_mz / 1e3:>14.2f}"
        )

    def print_displacements(self) -> None:
        """Print displacements at each node."""
        print("\n=== Displacements ===")
        print(f"{'Node':<10} {'dx (mm)':>14} {'dy (mm)':>14} {'rz (rad)':>14}")
        print("-" * 56)
        for name, (dx, dy, rz) in self.displacements.items():
            print(f"{name:<10} {dx * 1e3:>14.4f} {dy * 1e3:>14.4f} {rz:>14.6f}")
