"""Converts JSON input into StructureDesigner calls."""

from __future__ import annotations

from calculation import StructureDesigner, StructureDesignResults
from calculation.node import Node
from calculation.results import AnalysisResults

from .combiner import build_envelope, combine_results
from .schemas import StructureInput


# ── Public entry point ────────────────────────────────────────


def build_and_analyze(
    data: StructureInput,
) -> tuple[StructureDesigner, AnalysisResults, StructureDesignResults]:
    """Build a structure from input data, run analysis and EC3 design.

    Returns (designer, analysis_results, design_results).
    """
    if data.load_cases is not None and data.combinations is not None:
        return _build_and_analyze_combinations(data)
    return _build_and_analyze_legacy(data)


# ── Legacy path (flat loads, backward compat) ────────────────


def _build_and_analyze_legacy(
    data: StructureInput,
) -> tuple[StructureDesigner, AnalysisResults, StructureDesignResults]:
    sd = StructureDesigner(name=data.name, steel_grade=data.steel_grade)

    nodes = _build_geometry(sd, data)

    # Add loads
    for udl in data.udls:
        sd.add_udl(udl.element_name, wx=udl.wx, wy=udl.wy)
    for pl in data.point_loads:
        sd.add_point_load(nodes[pl.node_name], fx=pl.fx, fy=pl.fy, mz=pl.mz)

    results = sd.analyze()
    design_results = sd.design_all()

    return sd, results, design_results


# ── Combinations path ────────────────────────────────────────


def _build_geometry(sd: StructureDesigner, data: StructureInput) -> dict[str, Node]:
    """Add nodes, supports, and elements (no loads)."""
    nodes: dict[str, Node] = {}
    for n in data.nodes:
        nodes[n.name] = sd.add_node(n.name, n.x, n.y)

    for s in data.supports:
        sd.add_support(nodes[s.node_name], s.type)

    for e in data.elements:
        ni = nodes[e.node_i]
        nj = nodes[e.node_j]
        if e.role == "beam":
            sd.add_beam(e.name, ni, nj, e.designation, release=e.release)
        elif e.role == "column":
            sd.add_column(e.name, ni, nj, e.designation, release=e.release)
        elif e.role == "truss_member":
            sd.add_truss_member(e.name, ni, nj, e.designation)

    return nodes


def _build_and_analyze_combinations(
    data: StructureInput,
) -> tuple[StructureDesigner, AnalysisResults, StructureDesignResults]:
    """Run per-case analyses, combine with factors, design with governing combo."""
    assert data.load_cases is not None
    assert data.combinations is not None

    # 1. Run one analysis per load case
    case_results: dict[str, AnalysisResults] = {}

    for lc in data.load_cases:
        sd_case = StructureDesigner(name=data.name, steel_grade=data.steel_grade)
        _build_geometry(sd_case, data)

        # Add this case's loads
        for udl in lc.udls:
            sd_case.add_udl(udl.element_name, wx=udl.wx, wy=udl.wy)
        for pl in lc.point_loads:
            node = sd_case._model.nodes[pl.node_name]
            sd_case.add_point_load(node, fx=pl.fx, fy=pl.fy, mz=pl.mz)

        # G case includes self-weight; others do not
        if lc.category == "G":
            sd_case._model.apply_self_weight()
            case_results[lc.name] = sd_case.analyze(include_self_weight=False)
        else:
            case_results[lc.name] = sd_case.analyze(include_self_weight=False)

    # 2. Combine results for each combination
    combined_results: dict[str, AnalysisResults] = {}
    combo_types: dict[str, str] = {}

    for combo in data.combinations:
        combined_results[combo.name] = combine_results(case_results, combo.factors)
        combo_types[combo.name] = combo.combination_type

    # 3. Find governing ULS combination per element
    envelope = build_envelope(combined_results, combo_types)

    # 4. Build a final StructureDesigner for design_all() using governing results
    sd_design = StructureDesigner(name=data.name, steel_grade=data.steel_grade)
    nodes = _build_geometry(sd_design, data)

    # Pick the first ULS combo as the default governing if no envelope found
    first_uls = next(
        (c.name for c in data.combinations if c.combination_type == "ULS"),
        data.combinations[0].name,
    )

    # Find the single governing combo (the one that appears most, or first ULS)
    governing_combo_name = first_uls
    if envelope:
        # Use the most common governing combo
        from collections import Counter

        counts = Counter(envelope.values())
        governing_combo_name = counts.most_common(1)[0][0]

    governing_results = combined_results[governing_combo_name]

    # Rebind geometry references so design_all() can find elements
    governing_results.elements = sd_design._model.elements
    governing_results.supports = sd_design._model._supports

    # Apply combined distributed loads to the design model so
    # force_distribution / max_deflection work correctly
    sd_design._model._distributed_loads = list(governing_results.distributed_loads)

    # Inject the combined results into the designer
    sd_design._results = governing_results
    sd_design._model._results = governing_results
    design_results = sd_design.design_all()

    # Attach extra data for the API response
    design_results._combination_results = combined_results  # type: ignore[attr-defined]
    design_results._combo_types = combo_types  # type: ignore[attr-defined]
    design_results._envelope = envelope  # type: ignore[attr-defined]

    return sd_design, governing_results, design_results
