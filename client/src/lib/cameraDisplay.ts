
// Historic camera names/ids that still appear in older rows, folded onto the
// current AEYE_4 label. Mirrors LEGACY_CAMERA_ALIASES in server/src/cameras.js.
const LEGACY_CAMERA_NAMES: Record<string, string> = {
  Total: "Kitchen",
  Julieta: "Kitchen",
  Baliwag: "Kitchen",
  Luvers: "Kitchen Entrance",
  // Chowking is the historic name of AEYE_5, which is now the Front Area.
  Chowking: "Front Area",
  Bridge: "Back Door",
};

const CAMERA_ID_ALIASES: Record<string, string> = {
  AEYE_4: "Kitchen",
};

export function heatmapCheckpointDot(): string {
  return "#22C55E";
}

export function locationDotColor(name?: string | null, cameraId?: string | null): string {
  const label = displayCameraName(name, cameraId).toLowerCase();
  // Kitchen is checked before entrance so "Kitchen Entrance" reads as kitchen.
  if (label.includes("front")) return "#7E3F5B";
  if (label.includes("kitchen")) return "#EA580C";
  if (label.includes("entrance")) return "#22C55E";
  if (label.includes("rear") || label.includes("back")) return "#C08529";
  return "#A8968A";
}

export function cameraDotColor(cameraId?: string | null, rowIndex = 0): string {
  void cameraId;
  void rowIndex;
  return heatmapCheckpointDot();
}

export function displayCameraName(name?: string | null, cameraId?: string | null): string {
  const id = cameraId?.trim();
  if (id && CAMERA_ID_ALIASES[id]) return CAMERA_ID_ALIASES[id];

  const label = (name ?? "").trim();
  if (!label && id) return CAMERA_ID_ALIASES[id] ?? id;
  if (!label) return "";

  return LEGACY_CAMERA_NAMES[label] ?? label;
}
