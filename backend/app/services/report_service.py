"""
MedicX — PDF Report Generation Service
Generates hospital-branded PDF diagnostic reports.
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage,
    HRFlowable, PageBreak,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import os
from datetime import datetime
from app.config import settings


def generate_pdf_report(
    case_data: dict,
    patient_data: dict,
    findings: list,
    conclusion: str = None,
    signature: str = None,
    output_dir: str = None,
) -> str:
    """
    Generate a professional PDF diagnostic report.

    Args:
        case_data: Case information dict
        patient_data: Patient profile dict
        findings: List of validated findings
        conclusion: Doctor's final conclusion
        signature: Digital signature string
        output_dir: Output directory (defaults to settings.REPORT_DIR)

    Returns:
        Path to generated PDF file.
    """
    if output_dir is None:
        output_dir = settings.REPORT_DIR

    os.makedirs(output_dir, exist_ok=True)

    filename = f"MediX_Report_{case_data['id'][:8]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    filepath = os.path.join(output_dir, filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )

    # ─── Styles ─────────────────────────────────────────
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=22,
        textColor=colors.HexColor("#1a237e"),
        spaceAfter=4 * mm,
        alignment=TA_CENTER,
    )

    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#666666"),
        alignment=TA_CENTER,
        spaceAfter=6 * mm,
    )

    section_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=colors.HexColor("#1a73e8"),
        spaceBefore=6 * mm,
        spaceAfter=3 * mm,
        borderPadding=(0, 0, 2, 0),
    )

    body_style = ParagraphStyle(
        "BodyText",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        spaceAfter=2 * mm,
    )

    # ─── Build Content ──────────────────────────────────
    elements = []

    # Header
    elements.append(Paragraph("🏥 MediX Diagnostic Report", title_style))
    elements.append(Paragraph(
        f"AI-Assisted Radiology Analysis — Generated {datetime.now().strftime('%B %d, %Y at %H:%M')}",
        subtitle_style,
    ))
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1a73e8")))
    elements.append(Spacer(1, 4 * mm))

    # Patient Information
    elements.append(Paragraph("Patient Information", section_style))
    patient_table_data = [
        ["Full Name", patient_data.get("full_name", "N/A")],
        ["Date of Birth", str(patient_data.get("date_of_birth", "N/A"))],
        ["Sex", patient_data.get("sex", "N/A").capitalize()],
        ["Patient ID", patient_data.get("id", "N/A")[:8] + "..."],
    ]
    patient_table = Table(patient_table_data, colWidths=[40 * mm, 120 * mm])
    patient_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e3f2fd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#bbdefb")),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(patient_table)
    elements.append(Spacer(1, 4 * mm))

    # Clinical Notes
    if case_data.get("clinical_notes"):
        elements.append(Paragraph("Clinical Notes", section_style))
        elements.append(Paragraph(case_data["clinical_notes"], body_style))
        elements.append(Spacer(1, 3 * mm))

    # AI Analysis Results
    elements.append(Paragraph("AI Analysis Results", section_style))
    elements.append(Paragraph(
        f"Sensitivity Threshold: {case_data.get('sensitivity_threshold', 0.5):.0%}",
        body_style,
    ))

    findings_header = ["Disease", "Confidence", "Status", "Flagged"]
    findings_data = [findings_header]
    for f in findings:
        status_text = f.get("validation_status", "pending").upper()
        flagged_text = "⚠️ YES" if f.get("is_flagged") == "true" else "—"
        confidence_pct = f"{f.get('confidence_score', 0):.1%}"
        findings_data.append([
            f.get("disease_name", ""),
            confidence_pct,
            status_text,
            flagged_text,
        ])

    findings_table = Table(findings_data, colWidths=[40 * mm, 30 * mm, 35 * mm, 25 * mm])
    findings_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a73e8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0e0e0")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
    ]))
    elements.append(findings_table)
    elements.append(Spacer(1, 4 * mm))

    # Doctor's Notes for each finding
    for f in findings:
        if f.get("doctor_notes"):
            elements.append(Paragraph(
                f"<b>{f['disease_name']}:</b> {f['doctor_notes']}", body_style
            ))

    # Conclusion
    if conclusion:
        elements.append(Spacer(1, 4 * mm))
        elements.append(Paragraph("Clinical Conclusion", section_style))
        elements.append(Paragraph(conclusion, body_style))

    # Signature
    elements.append(Spacer(1, 10 * mm))
    elements.append(HRFlowable(width="40%", thickness=1, color=colors.black))
    elements.append(Paragraph(
        f"Digitally signed by: {signature or 'N/A'}", body_style
    ))
    elements.append(Paragraph(
        f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}",
        body_style,
    ))

    # Disclaimer
    elements.append(Spacer(1, 8 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    disclaimer_style = ParagraphStyle(
        "Disclaimer", parent=styles["Normal"],
        fontSize=8, textColor=colors.grey, alignment=TA_CENTER,
    )
    elements.append(Paragraph(
        "⚠️ AI support tool only — physician review required. "
        "This report was generated with AI assistance and must be validated by a qualified medical professional.",
        disclaimer_style,
    ))

    # Build PDF
    doc.build(elements)
    return filepath
