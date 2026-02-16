"""Superposition combiner for load case results."""

from __future__ import annotations

from calculation.load import DistributedLoad
from calculation.results import AnalysisResults


def combine_results(
    case_results: dict[str, AnalysisResults],
    factors: dict[str, float],
) -> AnalysisResults:
    """Linearly combine per-case analysis results using given factors.

    For each node/element key present in any case result, the combined
    value is ``sum(factor * case_value)`` for reactions, displacements,
    and element forces.
    """
    combined = AnalysisResults()

    # Use any case to get geometry references
    any_case = next(iter(case_results.values()))
    combined.elements = dict(any_case.elements)
    combined.supports = list(any_case.supports)

    # Reactions
    all_reaction_keys: set[str] = set()
    for cr in case_results.values():
        all_reaction_keys.update(cr.reactions.keys())

    for key in all_reaction_keys:
        rx, ry, rz = 0.0, 0.0, 0.0
        for case_name, factor in factors.items():
            if case_name in case_results:
                vals = case_results[case_name].reactions.get(key, (0.0, 0.0, 0.0))
                rx += factor * vals[0]
                ry += factor * vals[1]
                rz += factor * vals[2]
        combined.reactions[key] = (rx, ry, rz)

    # Displacements
    all_disp_keys: set[str] = set()
    for cr in case_results.values():
        all_disp_keys.update(cr.displacements.keys())

    for key in all_disp_keys:
        dx, dy, drz = 0.0, 0.0, 0.0
        for case_name, factor in factors.items():
            if case_name in case_results:
                vals = case_results[case_name].displacements.get(key, (0.0, 0.0, 0.0))
                dx += factor * vals[0]
                dy += factor * vals[1]
                drz += factor * vals[2]
        combined.displacements[key] = (dx, dy, drz)

    # Element forces
    all_force_keys: set[str] = set()
    for cr in case_results.values():
        all_force_keys.update(cr.element_forces.keys())

    for key in all_force_keys:
        forces = [0.0] * 6
        for case_name, factor in factors.items():
            if case_name in case_results:
                case_forces = case_results[case_name].element_forces.get(
                    key, (0.0,) * 6
                )
                for i in range(6):
                    forces[i] += factor * case_forces[i]
        combined.element_forces[key] = tuple(forces)

    # Distributed loads — scale each case's loads by the factor
    for case_name, factor in factors.items():
        if case_name not in case_results:
            continue
        for dl in case_results[case_name].distributed_loads:
            combined.distributed_loads.append(
                DistributedLoad(
                    element=dl.element,
                    wx=dl.wx * factor,
                    wy=dl.wy * factor,
                )
            )

    return combined


def build_envelope(
    combined_results: dict[str, AnalysisResults],
    combo_types: dict[str, str],
) -> dict[str, str]:
    """Find the governing ULS combination per element.

    For each element, selects the ULS combination with the highest
    ``max(|M_i|, |M_j|)`` from element_forces.

    Returns ``{element_name: governing_combo_name}``.
    """
    # Collect all element names from any combination
    all_elem_names: set[str] = set()
    for cr in combined_results.values():
        all_elem_names.update(cr.element_forces.keys())

    envelope: dict[str, str] = {}

    for elem_name in all_elem_names:
        best_combo = ""
        best_moment = -1.0

        for combo_name, cr in combined_results.items():
            # Only ULS combinations govern strength design
            if combo_types.get(combo_name) != "ULS":
                continue

            forces = cr.element_forces.get(elem_name, (0.0,) * 6)
            m_max = max(abs(forces[2]), abs(forces[5]))

            if m_max > best_moment:
                best_moment = m_max
                best_combo = combo_name

        if best_combo:
            envelope[elem_name] = best_combo

    return envelope
