
export type WaterflowThresholdTier = {
  key: "alert" | "alarm" | "critical";
  label: string;
  value: number;
  color: string;
};

export const WATERFLOW_THRESHOLDS: WaterflowThresholdTier[] = [
  { key: "alert", label: "Alert", value: 70, color: "#EAB308" },
  { key: "alarm", label: "Alarm", value: 110, color: "#EA580C" },
  { key: "critical", label: "Critical", value: 150, color: "#DC2626" },
];

export function waterflowThresholdMax(tiers: WaterflowThresholdTier[] = WATERFLOW_THRESHOLDS): number {
  return Math.max(...tiers.map((t) => t.value), 1);
}
