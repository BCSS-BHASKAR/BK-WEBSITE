import type { NavigateFunction } from "react-router-dom";

export type CrowdsReportOpenParams = {
  from: string;
  to: string;
  hour?: number;
  cameraId?: string;
  siteName?: string;
  siteId?: number;
  alertType?: string;
};

export function buildCrowdsReportSearch(p: CrowdsReportOpenParams): string {
  const q = new URLSearchParams();
  q.set("from", p.from);
  q.set("to", p.to);
  if (p.hour != null && p.from === p.to) q.set("hour", String(p.hour));
  if (p.cameraId) q.set("cameraId", p.cameraId);
  if (p.siteName) q.set("siteName", p.siteName);
  if (p.siteId != null && p.siteId > 0) q.set("siteId", String(p.siteId));
  if (p.alertType) q.set("alertType", p.alertType);
  return q.toString();
}

export function goCrowdsReport(navigate: NavigateFunction, p: CrowdsReportOpenParams): void {
  navigate({ pathname: "/crowds-report", search: `?${buildCrowdsReportSearch(p)}` });
}
