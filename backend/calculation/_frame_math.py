"""Shared 2D frame geometry/sign-convention helpers."""

from __future__ import annotations

import math


def element_geometry(dx: float, dy: float) -> tuple[float, float, float]:
    """Return (L, c, s) from element delta coordinates."""
    L = math.hypot(dx, dy)
    if L < 1e-12:
        return 0.0, 0.0, 0.0
    return L, dx / L, dy / L


def global_to_local_components(
    fx: float, fy: float, c: float, s: float
) -> tuple[float, float]:
    """Rotate global force components into local (N, V)."""
    n_local = c * fx + s * fy
    v_local = -s * fx + c * fy
    return n_local, v_local


def global_load_to_local(
    wx: float, wy: float, c: float, s: float
) -> tuple[float, float]:
    """Rotate global distributed load into local (wx_local, wy_local)."""
    wx_local = wx * c + wy * s
    wy_local = -wx * s + wy * c
    return wx_local, wy_local


def local_transverse_displacement(
    dx_global: float, dy_global: float, c: float, s: float
) -> float:
    """Local transverse displacement from global (dx, dy)."""
    return -dx_global * s + dy_global * c


def frame_internal_moment(
    m_i_raw: float, v_i: float, w_local: float, x: float
) -> float:
    """Internal moment convention used by results/design.

    M_int(x) = -M_i_raw + V_i*x + w*x^2/2
    """
    return -m_i_raw + v_i * x + 0.5 * w_local * x * x


def frame_display_moment(m_i_raw: float, v_i: float, w_local: float, x: float) -> float:
    """Display-moment convention (same visual direction as deflection)."""
    return -frame_internal_moment(m_i_raw=m_i_raw, v_i=v_i, w_local=w_local, x=x)


def frame_axial_at_xi(n_i: float, n_j: float, xi: float) -> float:
    """Axial force using OpenSees end-force convention.

    N(0)=N_i and N(L)=-N_j
    """
    return n_i + ((-n_j) - n_i) * xi
