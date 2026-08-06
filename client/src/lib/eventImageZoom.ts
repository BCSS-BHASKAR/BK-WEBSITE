import type { ImageZoomPayload } from "../components/ImageZoomDialog";
import type { ViolationEventRow } from "../components/ViolationEventCard";
import { receiverImageUrl } from "./receiverImageUrl";
import { walkingImageUrl } from "./walkingEnrollApi";

type VehicleLike = {
  full_image_url?: string | null;
  plate_url?: string | null;
};

export function imageUrlsFromVehicleRow(row: VehicleLike) {
  const scene = receiverImageUrl(row.full_image_url);
  const plate = receiverImageUrl(row.plate_url);
  return { scene, plate };
}

export function zoomPayloadFromVehicleRow(row: VehicleLike): ImageZoomPayload | null {
  const { scene, plate } = imageUrlsFromVehicleRow(row);
  const src = scene || plate;
  if (!src) return null;
  return { src, sceneSrc: scene || undefined, plateSrc: plate || undefined };
}

export function imageUrlsFromViolationRow(row: ViolationEventRow) {
  const scene = receiverImageUrl(row.fullImageUrl);
  const plate = receiverImageUrl(row.plateUrl);
  return { scene, plate };
}

export function zoomPayloadFromViolationRow(row: ViolationEventRow): ImageZoomPayload | null {
  const { scene, plate } = imageUrlsFromViolationRow(row);
  const src = scene || plate;
  if (!src) return null;
  return {
    src,
    sceneSrc: scene || undefined,
    plateSrc: plate || undefined,
    violationId: row.id,
    violationType: row.violationType,
    feedback: row.feedback ?? null,
  };
}

export function zoomPayloadFromWalkinRow(row: {
  image_path?: string | null;
  frame_path?: string | null;
}): ImageZoomPayload | null {
  const cropSrc = receiverImageUrl(row.image_path);
  const frameSrc = row.frame_path ? walkingImageUrl(row.frame_path) : "";
  const sceneSrc = frameSrc || cropSrc;
  const plateSrc = frameSrc && cropSrc && frameSrc !== cropSrc ? cropSrc : undefined;
  if (!sceneSrc) return null;
  return {
    src: sceneSrc,
    sceneSrc,
    plateSrc,
    sceneLabel: "Full frame",
    plateLabel: "Person zoom",
  };
}

export function zoomPayloadFromCrowdRow(row: { image_path?: string | null }): ImageZoomPayload | null {
  const src = receiverImageUrl(row.image_path);
  if (!src) return null;
  return { src, sceneSrc: src };
}
