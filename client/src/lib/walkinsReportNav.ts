import type { NavigateFunction } from "react-router-dom";

export type WalkinsReportOpenParams = {
  from: string;
  to: string;
  hour?: number;
  cameraId?: string;
  siteId?: number;
  gender?: string;
};

export function buildWalkinsReportSearch(p: WalkinsReportOpenParams): string {
  const q = new URLSearchParams();
  q.set("from", p.from);
  q.set("to", p.to);
  if (p.hour != null && p.from === p.to) q.set("hour", String(p.hour));
  if (p.cameraId) q.set("cameraId", p.cameraId);
  if (p.siteId != null && p.siteId > 0) q.set("siteId", String(p.siteId));
  if (p.gender) q.set("gender", p.gender);
  return q.toString();
}

export function goWalkinsReport(navigate: NavigateFunction, p: WalkinsReportOpenParams): void {
  navigate({ pathname: "/walkins-report", search: `?${buildWalkinsReportSearch(p)}` });
}
