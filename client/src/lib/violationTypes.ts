import AltRouteIcon from "@mui/icons-material/AltRoute";
import DirectionsWalkIcon from "@mui/icons-material/DirectionsWalk";
import LocalParkingIcon from "@mui/icons-material/LocalParking";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PanToolIcon from "@mui/icons-material/PanTool";
import RouteIcon from "@mui/icons-material/Route";
import SpeedIcon from "@mui/icons-material/Speed";
import SportsMotorsportsIcon from "@mui/icons-material/SportsMotorsports";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import GroupsIcon from "@mui/icons-material/Groups";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { SvgIconComponent } from "@mui/icons-material";
import { SITE_LABELS } from "./siteLabels";

export const VIOLATION_TYPE_ORDER = [
  "SPEED",
  "WRONG_ROUTE",
  "NO_HELMET",
  "TRIPLE_RIDING",
  "HEAVY",
  "LANE_DISCIPLINE",
  "DANGEROUS_DRIVING",
  "MANUAL",
  "WRONG_SIDE",
  "WRONG_PARKING",
  "PEDESTRIAN_OBSTRUCTION",
] as const;

export type ViolationTypeCode = (typeof VIOLATION_TYPE_ORDER)[number];

export const VIOLATION_DASHBOARD_ORDER: ViolationTypeCode[] = [
  "NO_HELMET",
  "TRIPLE_RIDING",
  "WRONG_ROUTE",
  "WRONG_PARKING",
];

export function violationTypesByCount(
  byType: Record<string, number> | undefined,
  types: readonly ViolationTypeCode[] = VIOLATION_DASHBOARD_ORDER
): ViolationTypeCode[] {
  const counts = byType ?? {};
  return [...types].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
}

export const VIOLATION_TYPE_META: Record<
  ViolationTypeCode,
  { label: string; color: string; softBg: string; Icon: SvgIconComponent }
> = {
  SPEED: {
    label: SITE_LABELS.speed,
    color: "#dc2626",
    softBg: "rgba(220,38,38,0.12)",
    Icon: SpeedIcon,
  },
  WRONG_ROUTE: {
    label: SITE_LABELS.wrongRoute,
    color: "#1d4ed8",
    softBg: "rgba(29,78,216,0.12)",
    Icon: RouteIcon,
  },
  NO_HELMET: {
    label: SITE_LABELS.noHelmet,
    color: "#c026d3",
    softBg: "rgba(192,38,211,0.14)",
    Icon: SportsMotorsportsIcon,
  },
  TRIPLE_RIDING: {
    label: SITE_LABELS.tripleRiding,
    color: "#0891b2",
    softBg: "rgba(8,145,178,0.12)",
    Icon: GroupsIcon,
  },
  HEAVY: {
    label: SITE_LABELS.heavyVehicle,
    color: "#64748b",
    softBg: "rgba(100,116,139,0.14)",
    Icon: LocalShippingIcon,
  },
  LANE_DISCIPLINE: {
    label: SITE_LABELS.laneDiscipline,
    color: "#7c3aed",
    softBg: "rgba(124,58,237,0.12)",
    Icon: AltRouteIcon,
  },
  DANGEROUS_DRIVING: {
    label: SITE_LABELS.dangerousDriving,
    color: "#ea580c",
    softBg: "rgba(234,88,12,0.12)",
    Icon: WarningAmberIcon,
  },
  MANUAL: {
    label: SITE_LABELS.manualViolation,
    color: "#475569",
    softBg: "rgba(71,85,105,0.12)",
    Icon: PanToolIcon,
  },
  WRONG_SIDE: {
    label: SITE_LABELS.wrongSide,
    color: "#2563eb",
    softBg: "rgba(37,99,235,0.12)",
    Icon: SwapHorizIcon,
  },
  WRONG_PARKING: {
    label: SITE_LABELS.wrongParking,
    color: "#0d9488",
    softBg: "rgba(13,148,136,0.12)",
    Icon: LocalParkingIcon,
  },
  PEDESTRIAN_OBSTRUCTION: {
    label: SITE_LABELS.pedestrianObstruction,
    color: "#be185d",
    softBg: "rgba(190,24,93,0.12)",
    Icon: DirectionsWalkIcon,
  },
};

export function violationTypeLabel(code: string): string {
  return VIOLATION_TYPE_META[code as ViolationTypeCode]?.label ?? code.replace(/_/g, " ");
}

export function violationTypeMeta(code: string) {
  return VIOLATION_TYPE_META[code as ViolationTypeCode];
}
