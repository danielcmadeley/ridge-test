"""Static analysis runner using OpenSeesPy."""

from __future__ import annotations

import openseespy.opensees as ops


def run_static_analysis() -> int:
    """Configure and run a linear static analysis.

    Returns 0 on success, non-zero on failure.
    """
    ops.system("BandGeneral")
    ops.numberer("RCM")
    ops.constraints("Transformation")
    ops.integrator("LoadControl", 1.0)
    ops.algorithm("Linear")
    ops.analysis("Static")
    return ops.analyze(1)
