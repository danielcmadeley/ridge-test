"""Result formatting and checks for 3D load takedown."""

from __future__ import annotations


def load_balance_warning(
    total_vertical_reaction: float,
    total_applied_load: float,
    tolerance: float = 0.05,
) -> str | None:
    """Return warning string if load balance mismatch exceeds tolerance."""
    if total_applied_load <= 0:
        return None

    mismatch = abs(total_vertical_reaction - total_applied_load) / total_applied_load
    if mismatch > tolerance:
        return (
            "Load balance mismatch exceeds tolerance: "
            f"applied={total_applied_load:.3f} N, "
            f"reactions={total_vertical_reaction:.3f} N, "
            f"mismatch={mismatch * 100:.2f}%"
        )
    return None
