import { ymdSite } from "./siteTimeZone";
import { buildViolationsSearch, type ViolationsOpenParams } from "./chatNav";

export type ViolationEventLinkParams = {
  violationId: number;
  violationType?: string;
  plate?: string | null;
  detectedAt?: string | null;
  cameraId?: string | null;
};

export function violationEventPath(p: ViolationEventLinkParams): string {
  const date = String(p.detectedAt || "").slice(0, 10) || ymdSite();
  const params: ViolationsOpenParams = {
    from: date,
    to: date,
    violationId: p.violationId,
  };
  if (p.violationType) params.type = p.violationType;
  if (p.cameraId) params.cameraId = p.cameraId;
  const plate = String(p.plate || "").trim();
  if (plate && !plate.toUpperCase().includes("NOT INFER")) params.plate = plate;
  return `/violations?${buildViolationsSearch(params)}`;
}
