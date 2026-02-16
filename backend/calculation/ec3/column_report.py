"""Generate a PDF design report from EC3 column design results."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import jinja2

from .column import ColumnDesignEC3

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


def _template_vars(d: ColumnDesignEC3) -> dict:
    """Build the flat dict of template variables from design results."""
    sd = d.section_data
    fmt2 = lambda v: f"{v:.2f}"
    fmt3 = lambda v: f"{v:.3f}"
    fmt4 = lambda v: f"{v:.4f}"

    # Section modulus display values (cm³)
    if d.section_class <= 2:
        Wy_cm3 = fmt2(sd.Wpl_y)
        Wz_cm3 = fmt2(sd.Wpl_z)
    else:
        Wy_cm3 = fmt2(sd.Wel_y)
        Wz_cm3 = fmt2(sd.Wel_z)

    return dict(
        # Header
        designation=sd.designation,
        steel_grade=d.steel_grade,
        NEd=fmt2(d.NEd),
        My_Ed=fmt2(abs(d.My_Ed)),
        Mz_Ed=fmt2(abs(d.Mz_Ed)),
        VEd=fmt2(abs(d.VEd)),
        Lcr_y=fmt2(d.Lcr_y),
        Lcr_z=fmt2(d.Lcr_z),

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
        Wel_z=fmt2(sd.Wel_z),
        Wpl_z=fmt2(sd.Wpl_z),
        mass=fmt2(sd.mass_per_metre),

        # Step 1
        fy=f"{d.fy:.0f}",
        epsilon=fmt4(d.epsilon),

        # Step 2
        alpha_web=fmt3(d.alpha_web),
        c_web=fmt2(d.c_web),
        ct_web=fmt2(d.ct_web),
        web_class=d.web_class,
        c_flange=fmt2(d.c_flange),
        ct_flange=fmt2(d.ct_flange),
        fl_9e=fmt2(9 * d.epsilon),
        flange_class=d.flange_class,
        section_class=d.section_class,

        # Step 3
        NRd=fmt2(d.NRd),
        axial_util=fmt3(d.NEd / d.NRd) if d.NRd > 0 else "---",
        axial_ok=d.NEd <= d.NRd,

        # Step 4
        Wy_cm3=Wy_cm3,
        Wz_cm3=Wz_cm3,
        My_Rd=fmt2(d.My_Rd),
        Mz_Rd=fmt2(d.Mz_Rd),

        # Step 5
        Av=fmt2(d.Av),
        Vpl_Rd=fmt2(d.Vpl_Rd),
        shear_util=fmt3(d.shear_util),
        shear_ok=d.shear_ok,

        # Step 6
        conservative_util=fmt3(d.conservative_util),
        conservative_ok=d.conservative_ok,

        # Step 7
        a_w=fmt3(d.a_w),
        MN_y_Rd=fmt2(d.MN_y_Rd),
        MN_z_Rd=fmt2(d.MN_z_Rd),
        alpha_interact=f"{d.alpha_interact:.1f}",
        beta_interact=fmt3(d.beta_interact),
        alternative_util=fmt3(d.alternative_util),
        alternative_ok=d.alternative_ok,

        # Step 8
        iy_mm=fmt2(d.iy_mm),
        iz_mm=fmt2(d.iz_mm),
        lambda_1=fmt2(d.lambda_1),
        lambda_bar_y=fmt4(d.lambda_bar_y),
        lambda_bar_z=fmt4(d.lambda_bar_z),
        curve_y=d.curve_y,
        curve_z=d.curve_z,
        alpha_y=fmt2(d.alpha_y),
        alpha_z=fmt2(d.alpha_z),
        Phi_y=fmt4(d.Phi_y),
        Phi_z=fmt4(d.Phi_z),
        chi_y=fmt4(d.chi_y),
        chi_z=fmt4(d.chi_z),
        Nb_Rd=fmt2(d.Nb_Rd),
        buckling_ok=d.Nb_Rd >= d.NEd,

        # Step 9
        h_over_b=sd.h / sd.b,
        h_over_b_disp=fmt2(sd.h / sd.b),
        curve_LT=d.buckling_curve_LT,
        alpha_LT=fmt2(d.alpha_LT),
        Mcr=fmt2(d.Mcr),
        lambda_LT=fmt4(d.lambda_LT),
        Phi_LT=fmt4(d.Phi_LT),
        chi_LT=fmt4(d.chi_LT),
        Mb_Rd=fmt2(d.Mb_Rd),

        # Step 10
        Ncr_y=fmt2(d.Ncr_y),
        Ncr_z=fmt2(d.Ncr_z),
        Ncr_T=fmt2(d.Ncr_T),
        aLT=fmt4(d.aLT),
        Cmy=fmt4(d.Cmy),
        Cmz=fmt4(d.Cmz),
        CmLT=fmt4(d.CmLT),
        psi_y=fmt2(d.psi_y),
        psi_z=fmt2(d.psi_z),
        kyy=fmt4(d.kyy),
        kyz=fmt4(d.kyz),
        kzy=fmt4(d.kzy),
        kzz=fmt4(d.kzz),
        eq6_61=fmt3(d.eq6_61),
        eq6_62=fmt3(d.eq6_62),
        combined_buckling_ok=d.combined_buckling_ok,

        # Overall
        overall_ok=d.overall_ok,
    )


def generate_column_report(
    design: ColumnDesignEC3,
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
    design : ColumnDesignEC3
        A design object **after** ``check_all()`` has been called.
    output_path : str or Path
        Destination for the PDF (e.g. ``"output/column_report.pdf"``).
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
    template = env.get_template("column_report.tex.j2")

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
