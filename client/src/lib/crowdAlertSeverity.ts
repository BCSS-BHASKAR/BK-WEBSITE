export type CrowdAlertSeverity = "ALERT" | "ALARM" | "CRITICAL";

export const CROWD_SEVERITY_THRESHOLDS = {
  alarm: 70,
  critical: 85,
} as const;

export const CROWD_SEVERITY_LABELS: Record<CrowdAlertSeverity, string> = {
  ALERT: "Moderate (<70%)",
  ALARM: "High (70–85%)",
  CRITICAL: "Critical (≥85%)",
};

export const CROWD_SEVERITY_SHORT: Record<CrowdAlertSeverity, string> = {
  ALERT: "Moderate",
  ALARM: "High",
  CRITICAL: "Critical",
};

export const CROWD_SEVERITY_COLORS: Record<CrowdAlertSeverity, string> = {
  ALERT: "#2563EB",
  ALARM: "#F59E0B",
  CRITICAL: "#DC2626",
};

export const CROWD_SEVERITY_ORDER: CrowdAlertSeverity[] = ["ALERT", "ALARM", "CRITICAL"];

export type CrowdSeveritySlice = {
  key: CrowdAlertSeverity;
  name: string;
  value: number;
  color: string;
};

export function crowdSeveritySlices(bySeverity?: Partial<Record<CrowdAlertSeverity, number>>): CrowdSeveritySlice[] {
  if (!bySeverity) return [];
  return CROWD_SEVERITY_ORDER.map((key) => ({
    key,
    name: CROWD_SEVERITY_LABELS[key],
    value: Number(bySeverity[key] ?? 0),
    color: CROWD_SEVERITY_COLORS[key],
  })).filter((s) => s.value > 0);
}

export function crowdAlertSeverity(pct: number): CrowdAlertSeverity {
  if (pct >= CROWD_SEVERITY_THRESHOLDS.critical) return "CRITICAL";
  if (pct >= CROWD_SEVERITY_THRESHOLDS.alarm) return "ALARM";
  return "ALERT";
}
