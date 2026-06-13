import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Group

def draw_node(d, x, y, w, h, text, bg_color_hex, text_color_hex='#FFFFFF', font_size=9):
    bg_color = colors.HexColor(bg_color_hex)
    text_color = colors.HexColor(text_color_hex)
    border_color = colors.HexColor('#1E293B')
    
    # Draw rounded rectangle
    d.add(Rect(x, y, w, h, fillColor=bg_color, strokeColor=border_color, strokeWidth=1.5, rx=6, ry=6))
    
    # Draw centered text string (handling single line or two lines)
    lines = text.split('\n')
    if len(lines) == 1:
        d.add(String(x + w / 2, y + h / 2 - font_size / 3, text, textAnchor='middle', fontName='Helvetica-Bold', fontSize=font_size, fillColor=text_color))
    else:
        # Two lines
        d.add(String(x + w / 2, y + h / 2 + font_size / 2, lines[0], textAnchor='middle', fontName='Helvetica-Bold', fontSize=font_size, fillColor=text_color))
        d.add(String(x + w / 2, y + h / 2 - font_size / 2 - 2, lines[1], textAnchor='middle', fontName='Helvetica-Bold', fontSize=font_size - 1, fillColor=colors.HexColor('#94A3B8') if text_color_hex == '#FFFFFF' else text_color))

def draw_down_arrow(d, x, y, length):
    arrow_color = colors.HexColor('#64748B')
    d.add(Line(x, y, x, y - length, strokeColor=arrow_color, strokeWidth=2))
    # Arrow head pointing down
    d.add(Polygon([x - 4, y - length + 4, x + 4, y - length + 4, x, y - length], fillColor=arrow_color, strokeColor=arrow_color))

def draw_right_arrow(d, x, y, length, label=""):
    arrow_color = colors.HexColor('#64748B')
    d.add(Line(x, y, x + length, y, strokeColor=arrow_color, strokeWidth=2))
    # Arrow head pointing right
    d.add(Polygon([x + length - 4, y + 4, x + length - 4, y - 4, x + length, y], fillColor=arrow_color, strokeColor=arrow_color))
    if label:
        d.add(String(x + length / 2, y + 6, label, textAnchor='middle', fontName='Helvetica', fontSize=7, fillColor=colors.HexColor('#64748B')))

def draw_left_arrow(d, x, y, length, label=""):
    arrow_color = colors.HexColor('#64748B')
    d.add(Line(x, y, x - length, y, strokeColor=arrow_color, strokeWidth=2))
    # Arrow head pointing left
    d.add(Polygon([x - length + 4, y + 4, x - length + 4, y - 4, x - length, y], fillColor=arrow_color, strokeColor=arrow_color))
    if label:
        d.add(String(x - length / 2, y - 11, label, textAnchor='middle', fontName='Helvetica', fontSize=7, fillColor=colors.HexColor('#64748B')))

def build_pdf(filename):
    # Setup document geometry with 0.75 in margin
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Palette
    primary_color = '#7C3AED' # Violet 600
    dark_bg = '#0F172A'      # Slate 900
    border_color = '#E2E8F0' # Slate 200
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor(primary_color),
        spaceAfter=15
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#475569'),
        spaceAfter=25
    )
    
    h1_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=15,
        spaceAfter=8,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'SubSectionHeading',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#475569'),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'),
        spaceAfter=10
    )
    
    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#4F46E5'),
    )
    
    story = []
    
    # Header Block
    story.append(Paragraph("SupportStream — Architecture Guide", title_style))
    story.append(Paragraph("Enterprise Customer Support Ecosystem with Real-Time Video Assistance", subtitle_style))
    story.append(Spacer(1, 10))
    
    # Problem Statement Section
    story.append(Paragraph("1. System Vision & Problem Statement", h1_style))
    p_text = (
        "Enterprise customer service centers require a secure, reliable, and high-performance video support architecture. "
        "Standard Peer-to-Peer (P2P) WebRTC models suffer from connection instability, IP address exposure, and a complete lack of "
        "recording/auditability. SupportStream addresses these gaps by decoupling the <b>Control Plane</b> (orchestrating session tokens, "
        "integrations, and workflows) from the <b>Data Plane</b> (mediasoup-based Selective Forwarding Unit SFU server processes). "
        "This enforces security, reliability, 5-minute client recovery intervals, and comprehensive operational visibility."
    )
    story.append(Paragraph(p_text, body_style))
    story.append(Spacer(1, 10))
    
    # Diagram 1: Control Flow & Data Access Architecture
    story.append(Paragraph("2. Full-Stack Control Flow & Data Access", h1_style))
    story.append(Paragraph(
        "This flow diagram illustrates the data flow of the SupportStream control plane, mapping how client-side interactions in the web browser "
        "propagate down to the backend API layer and write to the database engine.", body_style
    ))
    
    # Draw Diagram 1
    d1 = Drawing(500, 310)
    # Background card
    d1.add(Rect(0, 0, 500, 310, fillColor=colors.HexColor('#F8FAFC'), strokeColor=colors.HexColor('#E2E8F0'), strokeWidth=1, rx=8, ry=8))
    
    draw_node(d1, 160, 260, 180, 30, "Browser Client\nNext.js 15 UI", '#6366F1')
    draw_down_arrow(d1, 250, 260, 20)
    
    draw_node(d1, 160, 210, 180, 30, "API Gateway / Next.js Proxy\nStatic App Router", '#4F46E5')
    draw_down_arrow(d1, 250, 210, 20)
    
    draw_node(d1, 160, 160, 180, 30, "NestJS Monolith\nControl Plane Controllers", '#7C3AED')
    draw_down_arrow(d1, 250, 160, 20)
    
    draw_node(d1, 160, 110, 180, 30, "Prisma ORM\nDatabase Layer Engine", '#A855F7')
    draw_down_arrow(d1, 250, 110, 20)
    
    draw_node(d1, 160, 60, 180, 30, "Database Engine\nSQLite (Dev) / PostgreSQL (Prod)", '#1E293B')
    
    story.append(d1)
    story.append(Spacer(1, 15))
    story.append(PageBreak())
    
    # Diagram 2: Real-time SFU WebRTC Media Architecture
    story.append(Paragraph("3. SFU Media Server Architecture", h1_style))
    story.append(Paragraph(
        "SupportStream implements server-routed media routing using Mediasoup. Clients do not establish direct P2P connections; "
        "instead, they push audio, video, and screen sharing tracks as producers to the SFU worker process, which forwards "
        "them as consumers to the remote peer. This ensures maximum connection stability, low latency, and enables server-side recording.", body_style
    ))
    
    # Draw Diagram 2
    d2 = Drawing(500, 110)
    d2.add(Rect(0, 0, 500, 110, fillColor=colors.HexColor('#F8FAFC'), strokeColor=colors.HexColor('#E2E8F0'), strokeWidth=1, rx=8, ry=8))
    
    draw_node(d2, 20, 35, 110, 40, "Customer Guest\n(Consumer / Producer)", '#0EA5E9')
    
    # Double-headed style arrows with actions
    draw_right_arrow(d2, 130, 62, 70, "Produce Audio/Video")
    draw_left_arrow(d2, 130, 48, 70, "Consume Agent Track")
    
    draw_node(d2, 200, 35, 100, 40, "Mediasoup SFU\nMedia Router Pool", '#7C3AED')
    
    draw_right_arrow(d2, 300, 62, 70, "Consume Cust Track")
    draw_left_arrow(d2, 300, 48, 70, "Produce Audio/Video")
    
    draw_node(d2, 370, 35, 110, 40, "Support Agent\n(Producer / Consumer)", '#10B981')
    
    story.append(d2)
    story.append(Spacer(1, 20))
    
    # Diagram 3: Session State Lifecycle Transitions
    story.append(Paragraph("4. Session Lifecycle State Machine", h1_style))
    story.append(Paragraph(
        "Support call sessions traverse an auditable state machine. This lifecycle allows SupportStream to enforce invite security rules, "
        "track customer wait times, verify link connections, and manage post-call processing like generating AI summaries and sync logs.", body_style
    ))
    
    # Draw Diagram 3
    d3 = Drawing(500, 90)
    d3.add(Rect(0, 0, 500, 90, fillColor=colors.HexColor('#F8FAFC'), strokeColor=colors.HexColor('#E2E8F0'), strokeWidth=1, rx=8, ry=8))
    
    # Horizontal chain
    draw_node(d3, 15, 30, 70, 30, "CREATED", '#64748B')
    draw_right_arrow(d3, 85, 45, 20)
    
    draw_node(d3, 105, 30, 75, 30, "WAITING", '#F59E0B')
    draw_right_arrow(d3, 180, 45, 20)
    
    draw_node(d3, 200, 30, 75, 30, "ACTIVE", '#10B981')
    draw_right_arrow(d3, 275, 45, 20)
    
    draw_node(d3, 295, 30, 85, 30, "RECORDING", '#EF4444')
    draw_right_arrow(d3, 380, 45, 20)
    
    draw_node(d3, 400, 30, 85, 30, "ENDED", '#1E293B')
    
    story.append(d3)
    story.append(Spacer(1, 20))
    story.append(PageBreak())
    
    # Diagram 4: Escalation Flow & Departmental Routing
    story.append(Paragraph("5. Outcome Sentiment & Ticket Escalation Flow", h1_style))
    story.append(Paragraph(
        "Post-session feedback is validated on the backend. When a customer submits a satisfaction score of 2 stars or fewer, "
        "an automated escalation workflow rule is triggered. The session outcome is set to ESCALATED, and the ticket reference "
        "is immediately routed to the department's Critical Escalations queue column for immediate manager attention.", body_style
    ))
    
    # Draw Diagram 4
    d4 = Drawing(500, 110)
    d4.add(Rect(0, 0, 500, 110, fillColor=colors.HexColor('#F8FAFC'), strokeColor=colors.HexColor('#E2E8F0'), strokeWidth=1, rx=8, ry=8))
    
    draw_node(d4, 15, 35, 110, 40, "Customer Feedback\nRating <= 2 Stars", '#EF4444')
    draw_right_arrow(d4, 125, 55, 45, "Triggers Rules")
    
    draw_node(d4, 170, 35, 130, 40, "Workflow Engine\nSets Status: ESCALATED", '#F59E0B')
    draw_right_arrow(d4, 300, 55, 45, "Enqueues Ticket")
    
    draw_node(d4, 345, 35, 140, 40, "Operations Dashboard\nCritical Escalations Queue", '#1E293B')
    
    story.append(d4)
    story.append(Spacer(1, 20))
    
    # Table of Core Technologies
    story.append(Paragraph("6. Key Technology Stack Mapping", h1_style))
    table_data = [
        [Paragraph("<b>Component Layer</b>", body_style), Paragraph("<b>Technology</b>", body_style), Paragraph("<b>Architectural Responsibility</b>", body_style)],
        [Paragraph("Frontend Client", body_style), Paragraph("Next.js 15 (React, Tailwind, Zustand)", body_style), Paragraph("Renders premium dark theme UI, device pre-check, screen-sharing hooks, and live dashboards.", body_style)],
        [Paragraph("Control Monolith", body_style), Paragraph("NestJS (TypeScript, WebSockets)", body_style), Paragraph("Manages session JWT states, ticket reference sequences, and triggers automation integrations.", body_style)],
        [Paragraph("SFU Media Server", body_style), Paragraph("Mediasoup (C++ Worker Sub-processes)", body_style), Paragraph("Handles high-performance WebRTC packet routing, stream encryption, and multi-track feeds.", body_style)],
        [Paragraph("Database ORM", body_style), Paragraph("Prisma Client (SQLite / PostgreSQL)", body_style), Paragraph("Provides type-safe access schemas, atomic transaction locks, and sequential ticket index generations.", body_style)]
    ]
    t = Table(table_data, colWidths=[1.2 * inch, 1.8 * inch, 3.5 * inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    
    # Footer builder
    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor('#64748B'))
        page_num = canvas.getPageNumber()
        canvas.drawRightString(doc.pagesize[0] - 54, 30, f"Page {page_num}")
        canvas.drawString(54, 30, "SupportStream Architecture Guide — CONFIDENTIAL")
        canvas.setStrokeColor(colors.HexColor('#E2E8F0'))
        canvas.setLineWidth(0.5)
        canvas.line(54, 42, doc.pagesize[0] - 54, 42)
        canvas.restoreState()
        
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"Successfully compiled professional PDF: {filename}")

if __name__ == "__main__":
    pdf_path = os.path.join("docs", "Architecture.pdf")
    # Make sure output directory exists
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
    build_pdf(pdf_path)
