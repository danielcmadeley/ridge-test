"""Demo: Simply supported beam — analysis + EC3 design check + PDF report."""

from calculation import (
    BeamDesignEC3,
    Model,
    SupportType,
    generate_report,
    load_section,
    load_section_data,
)


def main():
    # ── Analysis ──────────────────────────────────────────────────
    m = Model("Simply Supported Beam")

    a = m.add_node("A", 0, 0)
    b = m.add_node("B", 6, 0)

    beam = load_section("UB 305x127x37")
    m.add_frame_element("AB", a, b, beam)

    m.add_support(a, SupportType.PINNED)
    m.add_support(b, SupportType.ROLLER_X)
    m.add_distributed_load(m.elements["AB"], wy=-10_000)  # 10 kN/m downward

    results = m.analyze()
    results.print_elements()
    results.print_reactions()
    results.print_displacements()
    m.plot_all()

    # ── EC3 Design ────────────────────────────────────────────────
    sd = load_section_data(beam.designation)
    defl_mm, _ = results.max_deflection("AB")

    # Force distribution from analysis (for segment-based LTB)
    shear_at_i, moment_at_i, w_local = results.force_distribution("AB")

    design = BeamDesignEC3(
        section_data=sd,
        steel_grade="S275",
        delta_max=abs(defl_mm),      # mm
        span=6.0,
        shear_at_i=shear_at_i,      # N
        moment_at_i=moment_at_i,    # N·m
        w_local=w_local,            # N/m
        restraint_positions=[0.0, 1.0, 2.0, 6.0],
        load_position="top_flange",
        deflection_limit_type="other",
    )
    design.check_all()
    design.print_summary()

    # ── PDF Report ────────────────────────────────────────────────
    generate_report(
        design,
        "output/beam_design_report.pdf",
        # logo_path="path/to/logo.png",   # uncomment when logo is available
        project_title="Example Project",
        job_no="J-2024-001",
        calcs_for="Steel Beam AB",
        calcs_by="DM",
        checked_by="",
        approved_by="",
    )


if __name__ == "__main__":
    main()
