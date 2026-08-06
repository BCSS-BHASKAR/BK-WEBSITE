import { OPS_CAMERA_MARKERS } from "../components/maps/rodriguezMapData";

export function listKnownSiteNames(): string[] {
  return OPS_CAMERA_MARKERS.map((c) => c.name);
}
