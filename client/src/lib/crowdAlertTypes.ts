import { pnp } from "./pnpTheme";

// Mirrors the `crowds.alert_type` ENUM in the database. Keep this in sync with
// CROWD_ALERT_TYPES in server/src/routes/dashboard.js.
//
// Order drives tiles, legends and stack order everywhere: security events first,
// kitchen staffing after.
export const CROWD_ALERT_TYPES = [
  "intrusion",
  "unauthorized_access",
  "camera_tampering",
  "unattended_kitchen",
  "understaffed_kitchen",
] as const;

export type CrowdAlertType = (typeof CROWD_ALERT_TYPES)[number];

type AlertTypeMeta = {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  softColor: string;
};

export const CROWD_ALERT_TYPE_META: Record<CrowdAlertType, AlertTypeMeta> = {
  intrusion: {
    label: "Intrusions",
    shortLabel: "Intrusion",
    description: "Someone entered a restricted area",
    color: pnp.danger,
    softColor: pnp.dangerSoft,
  },
  unauthorized_access: {
    label: "Unauthorized Access",
    shortLabel: "Unauthorized",
    description: "Entry attempt by someone without permission",
    color: pnp.navy,
    softColor: "rgba(74, 18, 32, 0.10)",
  },
  understaffed_kitchen: {
    label: "Understaffed Kitchen",
    shortLabel: "Understaffed",
    description: "Fewer kitchen staff on duty than required",
    color: pnp.primary,
    softColor: pnp.primarySoft,
  },
  unattended_kitchen: {
    label: "Unattended Kitchen",
    shortLabel: "Unattended",
    description: "No staff detected in the kitchen at all",
    color: pnp.warning,
    softColor: pnp.warningSoft,
  },
  camera_tampering: {
    label: "Camera Tampering",
    shortLabel: "Tampering",
    description: "Camera blocked, moved, or defocused",
    color: pnp.purple,
    softColor: pnp.purpleSoft,
  },
};

export function isCrowdAlertType(v: unknown): v is CrowdAlertType {
  return typeof v === "string" && (CROWD_ALERT_TYPES as readonly string[]).includes(v);
}

export function crowdAlertTypeLabel(v: unknown): string {
  return isCrowdAlertType(v) ? CROWD_ALERT_TYPE_META[v].shortLabel : "—";
}

export function crowdAlertTypeDescription(v: unknown): string {
  return isCrowdAlertType(v) ? CROWD_ALERT_TYPE_META[v].description : "AI inference alert";
}

export function crowdAlertTypeColor(v: unknown): { color: string; softColor: string } {
  if (!isCrowdAlertType(v)) return { color: pnp.textMuted, softColor: "rgba(15,23,42,0.06)" };
  const meta = CROWD_ALERT_TYPE_META[v];
  return { color: meta.color, softColor: meta.softColor };
}
