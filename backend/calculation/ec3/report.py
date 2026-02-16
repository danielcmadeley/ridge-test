"""Generate a PDF design report from EC3 beam design results."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import jinja2

from .beam import BeamDesignEC3

_TEMPLATE_DIR = Path(__file__).parent / "templates"


def _make_env() -> jinja2.Environment:
    """Jinja2 environment with LaTeX-safe delimiters."""
    return jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(_TEMPLATE_DIR)),
        block_start_string=r"\BLOCK{",
        block_end_string="}",
        variable_start_string=r"\VAR{",
        variable_end_string="}",
        comment_start_string=r"\#{",
        comment_end_string="}",
        line_statement_prefix="%%",
        line_comment_prefix="%#",
        trim_blocks=True,
        lstrip_blocks=True,
        autoescape=False,
    )


def _template_vars(d: BeamDesignEC3) -> dict:
    """Build the flat dict of template variables from design results."""
    sd = d.section_data
    fmt2 = lambda v: f"{v:.2f}"
    fmt3 = lambda v: f"{v:.3f}"
    fmt4 = lambda v: f"{v:.4f}"

    # Wy display value (cm³) — whichever modulus was used
    if d.section_class <= 2:
        Wy_cm3 = fmt2(sd.Wpl_y)
    else:
        Wy_cm3 = fmt2(sd.Wel_y)

    return dict(
        # Header
        designation=sd.designation,
        steel_grade=d.steel_grade,
        span=fmt2(d.span),
        MEd=fmt2(abs(d.MEd)),
        VEd=fmt2(abs(d.VEd)),

        # Section properties
        h=fmt2(sd.h),
        b=fmt2(sd.b),
        tw=fmt2(sd.tw),
        tf=fmt2(sd.tf),
        r=fmt2(sd.r),
        d=fmt2(sd.d),
        A_sec=fmt2(sd.A),
        Iy=fmt2(sd.Iy),
        Iz_sec=fmt2(sd.Iz),
        It=fmt2(sd.It),
        Iw=fmt2(sd.Iw),
        Wel_y=fmt2(sd.Wel_y),
        Wpl_y=fmt2(sd.Wpl_y),
        mass=fmt2(sd.mass_per_metre),

        # Step 1
        fy=f"{d.fy:.0f}",
        epsilon=fmt4(d.epsilon),

        # Step 2
        c_web=fmt2(d.c_web),
        ct_web=fmt2(d.ct_web),
        web_72e=fmt2(72 * d.epsilon),
        web_class=d.web_class,
        c_flange=fmt2(d.c_flange),
        ct_flange=fmt2(d.ct_flange),
        fl_9e=fmt2(9 * d.epsilon),
        flange_class=d.flange_class,
        section_class=d.section_class,

        # Step 3
        Mc_Rd=fmt2(d.Mc_Rd),
        bending_util=fmt3(d.bending_util),
        bending_ok=d.bending_ok,

        # Step 4
        Av=fmt2(d.Av),
        Vpl_Rd=fmt2(d.Vpl_Rd),
        shear_util=fmt3(d.shear_util),
        shear_ok=d.shear_ok,

        # Step 5
        hw_tw=fmt2(d.hw_tw),
        hw_tw_limit=fmt2(d.hw_tw_limit),
        shear_buckling_ok=d.shear_buckling_ok,

        # Step 6
        low_shear=d.low_shear,
        half_Vpl=fmt2(0.5 * d.Vpl_Rd),
        rho=fmt4(d.rho),
        Mv_Rd=fmt2(d.Mv_Rd),
        combined_util=fmt3(d.combined_util),
        combined_ok=d.combined_ok,

        # Step 8 — LTB (segment-based, rolled sections method §6.3.2.3)
        n_segments=len(d.ltb_segments),
        restraint_pos_text=", ".join(f"{p:.1f}" for p in d.restraint_positions),
        beta_LT=fmt2(d.beta_LT),
        lambda_LT_0=fmt2(d.lambda_LT_0),
        h_over_b=sd.h / sd.b,
        h_over_b_disp=fmt2(sd.h / sd.b),
        curve=d.buckling_curve,
        alpha_LT=fmt2(d.alpha_LT),
        segments=[
            dict(
                idx=i + 1,
                start=fmt2(seg.start_m),
                end=fmt2(seg.end_m),
                L_mm=f"{seg.L_mm:.0f}",
                MEd_seg=fmt2(seg.MEd_seg),
                C1=fmt3(seg.C1),
                kc=fmt3(seg.kc),
                Mcr=fmt2(seg.Mcr),
                lambda_LT=fmt4(seg.lambda_LT),
                Phi_LT=fmt4(seg.Phi_LT),
                chi_LT=fmt4(seg.chi_LT),
                f_mod=fmt4(seg.f_mod),
                chi_LT_mod=fmt4(seg.chi_LT_mod),
                Mb_Rd=fmt2(seg.Mb_Rd),
                util=fmt3(seg.util),
                ok=seg.ok,
                governing=(i == d.governing_seg_idx),
            )
            for i, seg in enumerate(d.ltb_segments)
        ],
        gov_seg_num=d.governing_seg_idx + 1,
        Mcr=fmt2(d.Mcr),
        Wy_fy_disp=f"{d.Wy * d.fy:.0f}",
        Mcr_Nmm_disp=f"{d.Mcr * 1e6:.0f}",
        lambda_LT=fmt4(d.lambda_LT),
        Phi_LT=fmt4(d.Phi_LT),
        chi_LT=fmt4(d.chi_LT),
        kc=fmt3(d.kc),
        f_mod=fmt4(d.f_mod),
        chi_LT_mod=fmt4(d.chi_LT_mod),
        Wy_cm3=Wy_cm3,
        Mb_Rd=fmt2(d.Mb_Rd),
        ltb_MEd=fmt2(d.ltb_segments[d.governing_seg_idx].MEd_seg) if d.ltb_segments else fmt2(abs(d.MEd)),
        ltb_util=fmt3(d.ltb_util),
        ltb_ok=d.ltb_ok,

        # Step 9
        delta_max=fmt2(abs(d.delta_max)),
        span_mm=f"{d.span * 1e3:.0f}",
        defl_ratio_int=f"{d.defl_ratio:.0f}",
        delta_limit=fmt2(d.delta_limit),
        deflection_util=fmt3(d.deflection_util),
        deflection_ok=d.deflection_ok,

        # Overall
        overall_ok=d.overall_ok,
    )


def generate_report(
    design: BeamDesignEC3,
    output_path: str | Path,
    *,
    logo_path: str | Path | None = None,
    project_title: str = "",
    job_no: str = "",
    calcs_for: str = "",
    calcs_by: str = "",
    checked_by: str = "",
    approved_by: str = "",
) -> Path:
    """Render the LaTeX template and compile to PDF.

    Parameters
    ----------
    design : BeamDesignEC3
        A design object **after** ``check_all()`` has been called.
    output_path : str or Path
        Destination for the PDF (e.g. ``"output/beam_report.pdf"``).
    logo_path : str or Path, optional
        Path to a logo image (PNG/PDF/JPG) for the header.
    project_title, job_no, calcs_for, calcs_by, checked_by, approved_by : str
        Project information fields displayed in the page header.

    Returns
    -------
    Path
        Absolute path to the generated PDF.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    env = _make_env()
    template = env.get_template("beam_report.tex.j2")

    with tempfile.TemporaryDirectory() as tmp:
        # Copy logo if provided
        logo_filename = ""
        if logo_path is not None:
            logo = Path(logo_path)
            if logo.exists():
                shutil.copy2(logo, Path(tmp) / logo.name)
                logo_filename = logo.name

        # Build template variables
        tvars = _template_vars(design)
        tvars.update(
            has_logo=bool(logo_filename),
            logo_filename=logo_filename,
            project_title=project_title,
            job_no=job_no,
            calcs_for=calcs_for,
            calcs_by=calcs_by,
            checked_by=checked_by,
            approved_by=approved_by,
        )

        tex_source = template.render(**tvars)
        tex_file = Path(tmp) / "report.tex"
        tex_file.write_text(tex_source, encoding="utf-8")

        # Run pdflatex twice for cross-references
        for _ in range(2):
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "report.tex"],
                cwd=tmp,
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode != 0:
                # Write the .tex for debugging
                debug_tex = output_path.with_suffix(".tex")
                debug_tex.write_text(tex_source, encoding="utf-8")
                raise RuntimeError(
                    f"pdflatex failed (see {debug_tex} for source).\n"
                    f"stderr: {result.stderr[-500:]}\n"
                    f"stdout: {result.stdout[-500:]}"
                )

        pdf_src = Path(tmp) / "report.pdf"
        output_path.write_bytes(pdf_src.read_bytes())

    print(f"  Saved: {output_path}")
    return output_path.resolve()
