import { SITE_CONFIG } from "../config/siteConfig";

export function walkinSiteFilterOptions(): { id: string; name: string }[] {
  return (SITE_CONFIG.walkins?.sites ?? []).map((s) => ({
    id: String(s.siteId),
    name: s.name,
  }));
}

export function walkinEntranceFilterOptions(): { id: string; name: string }[] {
  return (SITE_CONFIG.walkins?.entrances ?? []).map((e) => ({
    id: e.cameraId,
    name: e.name,
  }));
}

export function crowdSiteFilterOptions(): string[] {
  return (SITE_CONFIG.crowd?.sites ?? []).map((s) => s.name);
}

export function crowdZoneFilterOptions(): { id: string; name: string }[] {
  return (SITE_CONFIG.crowd?.zones ?? []).map((z) => ({
    id: z.cameraId,
    name: z.name,
  }));
}

export function resolveWalkinSiteName(siteId: number | string | null | undefined): string {
  const id = Number(siteId);
  const hit = SITE_CONFIG.walkins?.sites?.find((s) => s.siteId === id);
  return hit?.name ?? "";
}

export function resolveWalkinEntranceName(cameraId: string): string {
  const hit = SITE_CONFIG.walkins?.entrances?.find((e) => e.cameraId === cameraId);
  return hit?.name ?? cameraId;
}

export function resolveCrowdZoneName(cameraId: string): string {
  const hit = SITE_CONFIG.crowd?.zones?.find((z) => z.cameraId === cameraId);
  return hit?.name ?? cameraId;
}

export function crowdZoneBarData(
  zones: { camera_id: string; name?: string; alerts: number }[]
): { name: string; total: number; cameraId: string }[] {
  return zones
    .filter((z) => (z.alerts ?? 0) > 0)
    .map((z) => ({
      name: resolveCrowdZoneName(z.camera_id) || z.name || z.camera_id,
      total: z.alerts,
      cameraId: z.camera_id,
    }));
}
