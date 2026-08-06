import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DailyBriefingData } from "../pages/DailyBriefingPage";
import { SITE_TIMEZONE } from "./siteTimeZone";

// Brand colours for the PDF, matching pnp.navy / pnp.primary.
const NAVY: [number, number, number] = [74, 18, 32];

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { timeZone: SITE_TIMEZONE });
  } catch {
    return iso;
  }
}

function addCover(doc: jsPDF, data: DailyBriefingData, title: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 297, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(title, 105, 85, { align: "center" });
  doc.setFontSize(11);
  doc.text("INTELLIGENCE BRIEF", 105, 98, { align: "center" });
  doc.setFontSize(10);
  doc.text(data.meta.reportDateLabel, 105, 112, { align: "center" });
  doc.text(
    `Generated: ${data.meta.generatedAtLabel || fmtDate(data.meta.generatedAt)}`,
    105,
    122,
    { align: "center" }
  );
  doc.text(data.meta.preparedFor, 105, 132, { align: "center", maxWidth: 170 });
  doc.setFontSize(9);
  doc.setTextColor(214, 191, 165);
  doc.text("Confidential — Internal management use only", 105, 270, { align: "center" });
}

export function downloadDailyBriefingPdf(data: DailyBriefingData, mode: "full" | "executive" = "full") {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const r = data.report;
  const title = mode === "executive" ? "Executive Venue Summary" : "Daily Venue Brief";

  addCover(doc, data, title);
  doc.addPage();
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(`Operational Status: ${r.operationalStatusLabel}  |  AI Confidence: ${r.aiConfidenceScore}%`, 14, 18);

  doc.setFontSize(14);
  doc.text("Executive Summary", 14, 28);
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(r.executiveSummary, 182);
  doc.text(summaryLines, 14, 34);

  let y = 34 + summaryLines.length * 5 + 8;
  if (mode === "executive") {
    doc.setFontSize(14);
    doc.text("Key Findings", 14, y);
    y += 6;
    doc.setFontSize(10);
    for (const f of r.keyFindings) {
      const line = doc.splitTextToSize(
        `• ${f.title}: ${f.value} — ${f.detail}${f.changeLabel ? ` (${f.changeLabel})` : ""}`,
        182
      );
      doc.text(line, 14, y);
      y += line.length * 5 + 2;
    }
    y += 4;
    doc.setFontSize(14);
    doc.text("Operational Recommendations", 14, y);
    y += 6;
    doc.setFontSize(10);
    for (const c of r.recommendations) {
      const line = doc.splitTextToSize(`• [${c.label}] ${c.title}: ${c.body}`, 182);
      doc.text(line, 14, y);
      y += line.length * 5 + 2;
    }
    doc.save(`daily-venue-brief-${data.meta.from}_${data.meta.to}-executive.pdf`);
    return;
  }

  doc.setFontSize(14);
  doc.text("AI Narrative", 14, y);
  y += 6;
  doc.setFontSize(10);
  const narrativeLines = doc.splitTextToSize(r.aiNarrative, 182);
  doc.text(narrativeLines, 14, y);
  y += narrativeLines.length * 5 + 10;

  autoTable(doc, {
    startY: y,
    head: [["Finding", "Value", "Detail"]],
    body: r.keyFindings.map((f) => [f.title, f.value, `${f.detail}${f.changeLabel ? ` · ${f.changeLabel}` : ""}`]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: NAVY },
  });
  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;

  autoTable(doc, {
    startY: y + 8,
    head: [["Rank", "Monitored Area", "Alerts", "Entries", "Risk", "Change"]],
    body: r.areaRanking.map((s) => [
      String(s.rank),
      s.name,
      String(s.alerts),
      s.walkins.toLocaleString(),
      s.riskLevel,
      s.changeLabel || s.trend,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: NAVY },
  });
  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 50;

  doc.addPage();
  doc.setFontSize(14);
  doc.text("Alert Breakdown", 14, 20);
  autoTable(doc, {
    startY: 24,
    head: [["Alert Type", "Count", "Share %"]],
    body: r.alertBreakdown.map((v) => [v.label, String(v.count), `${v.sharePct}%`]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: NAVY },
  });
  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 50;

  // Gender is hidden in the UI for now, so the export does not carry it either.
  // Restore this block alongside SHOW_GENDER_DONUT in WalkinsReportPage.
  // autoTable(doc, {
  //   startY: y + 8,
  //   head: [["Entry Mix", "Count"]],
  //   body: [
  //     ["Male", r.genderMix.male.toLocaleString()],
  //     ["Female", r.genderMix.female.toLocaleString()],
  //     ["Unknown", r.genderMix.unknown.toLocaleString()],
  //     ["Total entries", r.totalWalkins.toLocaleString()],
  //   ],
  //   styles: { fontSize: 9 },
  //   headStyles: { fillColor: NAVY },
  // });
  // y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;

  doc.setFontSize(14);
  doc.text("Operational Recommendations", 14, y + 12);
  let cy = y + 18;
  doc.setFontSize(10);
  for (const c of r.recommendations) {
    const line = doc.splitTextToSize(`[${c.label}] ${c.title}: ${c.body}`, 182);
    doc.text(line, 14, cy);
    cy += line.length * 5 + 3;
  }

  doc.save(`daily-venue-brief-${data.meta.from}_${data.meta.to}.pdf`);
}
