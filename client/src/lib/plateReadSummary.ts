

export const SHOW_PLATE_READ_CONFIDENCE_UI = false;

export type PlateReadTrust = "high" | "medium" | "low";

export type PlateReadMetricsBlob = {
  trust?: string;
  factors?: string[];
  risk_flags?: string[];
  quality_band?: string;
  ocr_confidence?: number;
  readable_crop?: boolean;
  accuracy_target?: string;
};

export type PlateReadFields = {
  plate_read_trust?: string | null;
  plate_read_risk_flags?: string[] | null;
  plate_read_metrics?: PlateReadMetricsBlob | null;
  ocr_confidence?: number | null;
};

export type PlateReadSummary = {
  hasData: boolean;
  trust: PlateReadTrust | null;
  trustLabel: string;
  expectedAccuracy: string;
  riskChips: { code: string; label: string }[];
  ocrPct: number | null;
  photoLabel: string;
  reasons: string[];
  showWhy: boolean;
};

const RISK_FLAG_LABELS: Record<string, string> = {
  low_ocr_conf: "Low OCR confidence",
  medium_ocr_conf: "Moderate OCR confidence",
  short_plate: "Short / incomplete plate",
};

const TRUST_LABELS: Record<PlateReadTrust, string> = {
  high: "Reliable read",
  medium: "Review suggested",
  low: "Low confidence — verify",
};

const BAND_LABELS: Record<string, string> = {
  excellent: "Expected accuracy: very high",
  good: "Expected accuracy: high",
  fair: "Expected accuracy: moderate (about 70–85%)",
};

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeTrust(raw: unknown): PlateReadTrust | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return null;
}

function parseRiskFlags(raw: unknown): string[] {
  const arr = parseJson<string[]>(raw);
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => typeof x === "string" && x.trim());
}

function factorForClients(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  const skip =
    /^Winning OCR source:/i.test(s) ||
    /^OCR image chosen:/i.test(s) ||
    /^OCR view scores:/i.test(s);
  return !skip;
}

function readablePhotoLabel(readable: boolean | undefined): string {
  if (readable === true) return "Plate photo: Clear";
  if (readable === false) return "Plate photo: Hard to read";
  return "Plate photo: —";
}

function expectedAccuracyFromMetrics(m: PlateReadMetricsBlob | null, trust: PlateReadTrust | null): string {
  const band = (m?.quality_band ?? "").trim().toLowerCase();
  if (band && BAND_LABELS[band]) return BAND_LABELS[band];
  if (trust === "high") return "Expected accuracy: high";
  if (trust === "medium") return "Expected accuracy: moderate";
  if (trust === "low") return "Expected accuracy: may be limited";
  return "";
}

export function buildPlateReadSummary(row: PlateReadFields): PlateReadSummary | null {
  const metrics = parseJson<PlateReadMetricsBlob>(row.plate_read_metrics);
  const trust =
    normalizeTrust(row.plate_read_trust) ??
    normalizeTrust(metrics?.trust) ??
    null;

  const columnFlags = parseRiskFlags(row.plate_read_risk_flags);
  const metricFlags = Array.isArray(metrics?.risk_flags)
    ? metrics.risk_flags.filter((x) => typeof x === "string")
    : [];
  const flagCodes = [...new Set([...columnFlags, ...metricFlags])];

  const ocrFromMetrics =
    metrics?.ocr_confidence != null && !Number.isNaN(Number(metrics.ocr_confidence))
      ? Math.round(Number(metrics.ocr_confidence))
      : null;
  const ocrPct =
    ocrFromMetrics ??
    (row.ocr_confidence != null && !Number.isNaN(Number(row.ocr_confidence))
      ? Math.round(Number(row.ocr_confidence))
      : null);

  const factors = Array.isArray(metrics?.factors)
    ? metrics.factors.filter((x) => typeof x === "string" && factorForClients(x))
    : [];

  const hasData = Boolean(trust || flagCodes.length || factors.length || metrics);
  if (!hasData) return null;

  const riskChips = flagCodes.map((code) => ({
    code,
    label: RISK_FLAG_LABELS[code] ?? code.replace(/_/g, " "),
  }));

  return {
    hasData: true,
    trust,
    trustLabel: trust ? TRUST_LABELS[trust] : "Confidence unknown",
    expectedAccuracy: expectedAccuracyFromMetrics(metrics, trust),
    riskChips,
    ocrPct,
    photoLabel: readablePhotoLabel(metrics?.readable_crop),
    reasons: factors.slice(0, 5),
    showWhy: trust !== "high" && factors.length > 0,
  };
}

export function trustChipColors(trust: PlateReadTrust | null): {
  bgcolor: string;
  color: string;
  borderColor: string;
} {
  switch (trust) {
    case "high":
      return {
        bgcolor: "rgba(22, 163, 74, 0.12)",
        color: "#166534",
        borderColor: "rgba(22, 163, 74, 0.35)",
      };
    case "medium":
      return {
        bgcolor: "rgba(245, 158, 11, 0.14)",
        color: "#92400e",
        borderColor: "rgba(245, 158, 11, 0.4)",
      };
    case "low":
      return {
        bgcolor: "rgba(220, 38, 38, 0.1)",
        color: "#991b1b",
        borderColor: "rgba(220, 38, 38, 0.35)",
      };
    default:
      return {
        bgcolor: "rgba(100, 116, 139, 0.12)",
        color: "#475569",
        borderColor: "rgba(100, 116, 139, 0.3)",
      };
  }
}
