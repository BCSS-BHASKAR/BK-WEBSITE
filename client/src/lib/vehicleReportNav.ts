import type { NavigateFunction } from "react-router-dom";

export type VehicleReportAttr = "PRIVATE" | "PUBLIC_UTILITY";

export type VehicleReportVehicleType = "CAR" | "TRUCK" | "BIKE" | "MINITRUCK" | "BUS" | "AUTO";

export type VehicleReportOpenParams = {
  from: string;
  to: string;

  hour?: number;
  cameraId?: string;
  plate?: string;
  vehicleType?: VehicleReportVehicleType;
  attr?: VehicleReportAttr;
  direction?: "IN" | "OUT";
};

export function buildVehicleReportSearch(p: VehicleReportOpenParams): string {
  const q = new URLSearchParams();
  q.set("from", p.from);
  q.set("to", p.to);
  if (p.from === p.to && p.hour != null && p.hour >= 0 && p.hour <= 23) {
    q.set("hour", String(p.hour));
  }
  if (p.cameraId) q.set("cameraId", p.cameraId);
  if (p.plate) q.set("plate", p.plate);
  if (p.vehicleType) q.set("vehicleType", p.vehicleType);
  if (p.attr) q.set("attr", p.attr);
  if (p.direction) q.set("direction", p.direction);
  return q.toString();
}

export function goVehicleReport(navigate: NavigateFunction, p: VehicleReportOpenParams): void {
  navigate({ pathname: "/vehicle-report", search: `?${buildVehicleReportSearch(p)}` });
}
