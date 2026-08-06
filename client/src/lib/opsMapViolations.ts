

export type CameraViolationRow = { camera_id: string; name: string; total: number };

export type ViolationActivityTier = "low" | "moderate" | "high";

export const VIOLATION_TIER_META: Record<ViolationActivityTier, { label: string; color: string; glow: string }> = {
  low: { label: "Low activity", color: "#22C55E", glow: "rgba(34, 197, 94, 0.5)" },
  moderate: { label: "Moderate activity", color: "#EAB308", glow: "rgba(234, 179, 8, 0.5)" },
  high: { label: "High activity", color: "#EF4444", glow: "rgba(239, 68, 68, 0.5)" },
};

export function violationCountByCamera(rows: CameraViolationRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = r.camera_id.trim();
    if (!id) continue;
    m.set(id, Number(r.total || 0));
    m.set(id.toUpperCase(), Number(r.total || 0));
    m.set(id.toLowerCase(), Number(r.total || 0));
  }
  return m;
}

export function violationTier(count: number, maxAmongCameras: number): ViolationActivityTier {
  if (maxAmongCameras <= 0 || count <= 0) return "low";
  const ratio = count / maxAmongCameras;
  if (ratio >= 0.67) return "high";
  if (ratio >= 0.34) return "moderate";
  return "low";
}
