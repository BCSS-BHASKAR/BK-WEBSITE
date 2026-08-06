import { OPS_CAMERA_MARKERS } from "../components/maps/rodriguezMapData";

export type JourneyMapPoint = {
  left: number;
  top: number;
  name: string;
  cameraId: string;
};

export function resolveJourneyMapPosition(siteName: string, cameraId?: string | null): JourneyMapPoint | null {
  const id = String(cameraId || "").trim().toUpperCase();
  const site = String(siteName || "").trim().toLowerCase();
  const cam = OPS_CAMERA_MARKERS.find(
    (m) => m.id.toUpperCase() === id || m.name.toLowerCase() === site
  );
  if (!cam) return null;
  return {
    left: parseFloat(cam.left),
    top: parseFloat(cam.top),
    name: cam.name,
    cameraId: cam.id,
  };
}

export function journeyStopsToMapPoints(
  stops: { siteName: string; cameraId?: string | null; sequence: number }[]
): (JourneyMapPoint & { sequence: number; isFirst: boolean; isLast: boolean })[] {
  const out: (JourneyMapPoint & { sequence: number; isFirst: boolean; isLast: boolean })[] = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const pos = resolveJourneyMapPosition(s.siteName, s.cameraId);
    if (!pos) continue;
    out.push({
      ...pos,
      sequence: s.sequence,
      isFirst: i === 0,
      isLast: i === stops.length - 1,
    });
  }
  return out;
}
