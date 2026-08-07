import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DailyBriefingData } from "../pages/DailyBriefingPage";
import { SITE_TIMEZONE } from "./siteTimeZone";

/**
 * Daily Venue Brief, as a printable operational report.
 *
 * The previous version tracked a single `y` cursor by hand and never checked it
 * against the page height, so a long narrative or a venue with many cameras
 * simply wrote past the bottom edge and the text was lost - there was no page
 * break, no margin discipline and no way to tell how many pages the report even
 * had. Everything here goes through `flow()`, which measures a block before
 * drawing it and starts a new page when it will not fit, and every page is
 * stamped with the same frame, header rule and "Page n of m" footer.
 *
 * Page geometry is declared once in PAGE below and nothing draws outside it.
 */

// Brand palette, matching pnpTheme (Biryani Katha green / mustard).
const GREEN: [number, number, number] = [62, 86, 38];
const GREEN_DEEP: [number, number, number] = [44, 61, 27];
const MUSTARD: [number, number, number] = [192, 133, 41];
const CREAM: [number, number, number] = [250, 221, 157];
const INK: [number, number, number] = [31, 42, 22];
const INK_SOFT: [number, number, number] = [95, 107, 82];
const RULE: [number, number, number] = [214, 219, 206];

const PAGE = {
  w: 210,
  h: 297,
  /** Outer margin. The page border sits just inside it. */
  margin: 14,
  /** First baseline of body content, below the running header. */
  top: 32,
  /** Content must stop here so it never collides with the footer. */
  bottom: 268,
} as const;

const CONTENT_W = PAGE.w - PAGE.margin * 2;

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { timeZone: SITE_TIMEZONE });
  } catch {
    return iso;
  }
}

/**
 * Draws the frame, running header and footer on every content page.
 *
 * Called once at the end over the finished document, because the total page
 * count is not known until then - stamping "Page 2 of 5" as each page is
 * created would require knowing the future.
 */
function decoratePages(doc: Doc, data: DailyBriefingData, title: string) {
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p += 1) {
    doc.setPage(p);

    // Page border.
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.4);
    doc.rect(PAGE.margin - 4, PAGE.margin - 4, CONTENT_W + 8, PAGE.h - (PAGE.margin - 4) * 2);

    // Running header: report name left, period right, rule underneath.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GREEN);
    doc.text(title.toUpperCase(), PAGE.margin, PAGE.margin + 4);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK_SOFT);
    doc.text(data.meta.reportDateLabel, PAGE.w - PAGE.margin, PAGE.margin + 4, { align: "right" });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(PAGE.margin, PAGE.margin + 7, PAGE.w - PAGE.margin, PAGE.margin + 7);

    // Footer: confidentiality left, page number right.
    doc.setDrawColor(...RULE);
    doc.line(PAGE.margin, PAGE.h - PAGE.margin - 6, PAGE.w - PAGE.margin, PAGE.h - PAGE.margin - 6);
    doc.setFontSize(7.5);
    doc.setTextColor(...INK_SOFT);
    doc.text("Confidential — internal management use only", PAGE.margin, PAGE.h - PAGE.margin - 1);
    doc.text(`Page ${p - 1} of ${total - 1}`, PAGE.w - PAGE.margin, PAGE.h - PAGE.margin - 1, {
      align: "right",
    });
  }
}

/** Cursor that knows where the page ends. */
class Flow {
  // Explicitly typed: PAGE is `as const`, so `y = PAGE.top` would infer the
  // literal type 32 and reject every later assignment.
  y: number = PAGE.top;

  private doc: Doc;

  // A plain field, not a parameter property — the build runs with
  // `erasableSyntaxOnly`, which rejects TypeScript-only constructor syntax.
  constructor(doc: Doc) {
    this.doc = doc;
  }

  /** Reserves `h` mm, breaking to a new page first if it will not fit. */
  need(h: number) {
    if (this.y + h > PAGE.bottom) {
      this.doc.addPage();
      this.y = PAGE.top;
    }
    return this.y;
  }

  gap(h: number) {
    this.y += h;
  }

  /** Section heading with a mustard underline. Never orphaned from its body. */
  heading(text: string, minBodyHeight = 12) {
    this.need(9 + minBodyHeight);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12);
    this.doc.setTextColor(...GREEN_DEEP);
    this.doc.text(text, PAGE.margin, this.y);
    this.doc.setDrawColor(...MUSTARD);
    this.doc.setLineWidth(0.8);
    this.doc.line(PAGE.margin, this.y + 1.6, PAGE.margin + 22, this.y + 1.6);
    this.y += 8;
  }

  /**
   * Wrapped body copy.
   *
   * Splits first, then places line by line so a paragraph can straddle a page
   * break instead of being pushed whole onto the next page or, worse, running
   * off the bottom of this one.
   */
  paragraph(text: string, opts: { size?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 9.5;
    const lead = size * 0.52;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...(opts.color ?? INK));
    const lines: string[] = this.doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      this.need(lead);
      this.doc.text(line, PAGE.margin, this.y);
      this.y += lead;
    }
    this.y += 2;
  }

  /** A labelled bullet: "[HIGH] Title: body", wrapped and page-break safe. */
  bullet(text: string) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(...INK);
    const lines: string[] = this.doc.splitTextToSize(text, CONTENT_W - 5);
    lines.forEach((line, i) => {
      this.need(5);
      if (i === 0) {
        this.doc.setFillColor(...MUSTARD);
        this.doc.circle(PAGE.margin + 1.2, this.y - 1.2, 0.9, "F");
      }
      this.doc.text(line, PAGE.margin + 5, this.y);
      this.y += 5;
    });
    this.y += 1.5;
  }

  /**
   * Table with the shared house style.
   *
   * autoTable handles its own pagination; `margin` keeps it inside the frame on
   * every page it spills onto, and didDrawPage keeps our cursor in sync.
   */
  table(head: string[], body: string[][], columnStyles?: Record<number, object>) {
    this.need(24);
    autoTable(this.doc, {
      startY: this.y,
      head: [head],
      body,
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        overflow: "linebreak",
        textColor: INK,
        lineColor: RULE,
        lineWidth: 0.1,
        valign: "middle",
      },
      headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 249, 245] },
      columnStyles,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.top, bottom: PAGE.h - PAGE.bottom },
      tableWidth: CONTENT_W,
    });
    this.y = (this.doc.lastAutoTable?.finalY ?? this.y) + 6;
  }
}

function addCover(doc: Doc, data: DailyBriefingData, title: string) {
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, PAGE.w, PAGE.h, "F");

  // Inset cream keyline, so the cover reads as a designed page rather than a
  // flat fill.
  doc.setDrawColor(...CREAM);
  doc.setLineWidth(0.6);
  doc.rect(12, 12, PAGE.w - 24, PAGE.h - 24);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(title, PAGE.w / 2, 96, { align: "center", maxWidth: PAGE.w - 50 });

  doc.setDrawColor(...MUSTARD);
  doc.setLineWidth(1.2);
  doc.line(PAGE.w / 2 - 18, 104, PAGE.w / 2 + 18, 104);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...CREAM);
  doc.text("INTELLIGENCE BRIEF", PAGE.w / 2, 114, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(data.meta.reportDateLabel, PAGE.w / 2, 132, { align: "center", maxWidth: PAGE.w - 50 });

  doc.setFontSize(9.5);
  doc.setTextColor(...CREAM);
  doc.text(
    `Generated: ${data.meta.generatedAtLabel || fmtDate(data.meta.generatedAt)}`,
    PAGE.w / 2, 144, { align: "center", maxWidth: PAGE.w - 50 }
  );
  doc.text(`Prepared for: ${data.meta.preparedFor}`, PAGE.w / 2, 152, {
    align: "center", maxWidth: PAGE.w - 50,
  });

  doc.setFontSize(8.5);
  doc.text("Confidential — internal management use only", PAGE.w / 2, 268, { align: "center" });
}

export function downloadDailyBriefingPdf(data: DailyBriefingData, mode: "full" | "executive" = "full") {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  const r = data.report;
  const title = mode === "executive" ? "Executive Venue Summary" : "Daily Venue Brief";

  addCover(doc, data, title);
  doc.addPage();
  const f = new Flow(doc);

  // Status strip.
  f.need(14);
  doc.setFillColor(248, 249, 245);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.roundedRect(PAGE.margin, f.y - 5, CONTENT_W, 11, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...GREEN_DEEP);
  doc.text(`Operational status: ${r.operationalStatusLabel}`, PAGE.margin + 3, f.y + 1.5);
  doc.setTextColor(...INK_SOFT);
  doc.text(`AI confidence: ${r.aiConfidenceScore}%`, PAGE.w - PAGE.margin - 3, f.y + 1.5, {
    align: "right",
  });
  f.gap(14);

  f.heading("Executive Summary");
  f.paragraph(r.executiveSummary);
  f.gap(2);

  if (mode !== "executive") {
    f.heading("AI Narrative");
    f.paragraph(r.aiNarrative);
    f.gap(2);
  }

  f.heading("Key Findings");
  f.table(
    ["Finding", "Value", "Detail"],
    r.keyFindings.map((k) => [
      k.title,
      k.value,
      `${k.detail}${k.changeLabel ? ` · ${k.changeLabel}` : ""}`,
    ]),
    { 0: { cellWidth: 42, fontStyle: "bold" }, 1: { cellWidth: 26 } }
  );

  // Per-module sections. Each carries the figures that mean something for THAT
  // module rather than the same three columns repeated five times, and a module
  // with nothing to report states that instead of leaving a blank block.
  const modules = r.moduleBreakdown || [];
  if (modules.length) {
    f.heading("Monitoring Coverage");
    f.paragraph(
      "Every monitoring type the venue runs, including those that recorded nothing in this period.",
      { size: 8.5, color: INK_SOFT }
    );
    f.table(
      ["Monitoring type", "Events", "Share", "Busiest hour", "Busiest camera", "Change"],
      modules.map((m) => [
        m.label,
        m.hasData ? `${m.count.toLocaleString()} ${m.eventNoun}` : "0",
        m.sharePct == null ? "—" : m.hasData ? `${m.sharePct}%` : "—",
        m.hasData && m.peakLabel ? m.peakLabel : "—",
        m.hasData && m.topCamera ? m.topCamera : "—",
        m.hasData ? m.changeLabel || "—" : "No events recorded",
      ]),
      {
        0: { cellWidth: 44, fontStyle: "bold" },
        1: { cellWidth: 24 },
        2: { cellWidth: 16 },
        5: { cellWidth: 30 },
      }
    );

    for (const m of modules) {
      // Keep the heading with at least its first line of copy.
      f.heading(m.label, 10);
      f.paragraph(m.summary, m.hasData ? {} : { color: INK_SOFT });
      if (m.hasData) {
        const bits = [
          m.peakLabel ? `Busiest hour: ${m.peakLabel}${m.peakCount ? ` (${m.peakCount})` : ""}` : null,
          m.topCamera ? `Busiest camera: ${m.topCamera} (${m.topCameraCount ?? 0})` : null,
          m.cameras != null ? `Cameras reporting: ${m.cameras}` : null,
          m.changeLabel ? `Versus prior period: ${m.changeLabel}` : null,
        ].filter(Boolean) as string[];
        if (bits.length) f.paragraph(bits.join("   ·   "), { size: 8.5, color: INK_SOFT });
      }
      f.gap(1);
    }
  }

  if (mode === "executive") {
    f.heading("Operational Recommendations");
    for (const c of r.recommendations) f.bullet(`[${c.label}] ${c.title}: ${c.body}`);
    decoratePages(doc, data, title);
    doc.save(`daily-venue-brief-${data.meta.from}_${data.meta.to}-executive.pdf`);
    return;
  }

  f.heading("Alert Breakdown");
  f.table(
    ["Alert type", "Count", "Share of alerts", "Change"],
    r.alertBreakdown.map((v) => [
      v.label,
      String(v.count),
      v.count > 0 ? `${v.sharePct}%` : "—",
      v.count > 0 ? v.changeLabel || "—" : "No events recorded",
    ]),
    { 0: { cellWidth: 52, fontStyle: "bold" }, 1: { cellWidth: 22 }, 2: { cellWidth: 32 } }
  );

  f.heading("Monitored Areas");
  if (r.areaRanking.length) {
    f.table(
      ["#", "Monitored area", "Alerts", "Entries", "Risk", "Change"],
      r.areaRanking.map((s) => [
        String(s.rank),
        s.name,
        String(s.alerts),
        s.walkins.toLocaleString(),
        s.riskLevel,
        s.changeLabel || s.trend,
      ]),
      { 0: { cellWidth: 10 }, 2: { cellWidth: 20 }, 3: { cellWidth: 22 }, 4: { cellWidth: 22 } }
    );
  } else {
    f.paragraph("No camera recorded activity for this period.", { color: INK_SOFT });
  }

  f.heading("Operational Recommendations");
  for (const c of r.recommendations) f.bullet(`[${c.label}] ${c.title}: ${c.body}`);

  decoratePages(doc, data, title);
  doc.save(`daily-venue-brief-${data.meta.from}_${data.meta.to}.pdf`);
}
