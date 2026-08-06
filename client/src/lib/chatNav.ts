import type { VehicleReportOpenParams } from "./vehicleReportNav";
import { buildVehicleReportSearch } from "./vehicleReportNav";

export type ViolationsOpenParams = {
  from: string;
  to: string;
  type?: string;
  cameraId?: string;
  plate?: string;
  violationId?: number;
};

export function buildViolationsSearch(p: ViolationsOpenParams): string {
  const q = new URLSearchParams();
  q.set("from", p.from);
  q.set("to", p.to);
  if (p.type) q.set("type", p.type);
  if (p.cameraId) q.set("cameraId", p.cameraId);
  if (p.plate?.trim()) q.set("plate", p.plate.trim());
  if (p.violationId != null && Number.isFinite(p.violationId) && p.violationId > 0) {
    q.set("violationId", String(Math.floor(p.violationId)));
  }
  return q.toString();
}

export function violationsTo(p: ViolationsOpenParams): { pathname: string; search: string } {
  return { pathname: "/violations", search: `?${buildViolationsSearch(p)}` };
}

export function vehicleReportTo(p: VehicleReportOpenParams): { pathname: string; search: string } {
  return { pathname: "/vehicle-report", search: `?${buildVehicleReportSearch(p)}` };
}

export function watchlistsTo(): { pathname: string } {
  return { pathname: "/watchlists" };
}
