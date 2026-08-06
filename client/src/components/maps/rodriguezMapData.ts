

export type OpsCameraMarker = {
  id: string;
  name: string;

  left: string;
  top: string;
};

export const RODRIGUEZ_MAP_BG = `${import.meta.env.BASE_URL}rodriguez-ops-map-bg.png`;

export const OPS_CAMERA_MARKERS: OpsCameraMarker[] = [
  { id: "AEYE_4", name: "Baliwag", left: "38%", top: "26%" },
  { id: "AEYE_3", name: "Market", left: "24%", top: "36%" },
  { id: "AEYE_1", name: "Highway", left: "56%", top: "40%" },
  { id: "AEYE_2", name: "Luvers", left: "50%", top: "52%" },
  { id: "AEYE_5", name: "Chowking", left: "62%", top: "70%" },
];
