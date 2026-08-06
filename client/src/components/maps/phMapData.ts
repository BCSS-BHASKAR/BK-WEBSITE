

import type { LatLngExpression, LatLngTuple, PathOptions } from "leaflet";

export const PH_BOUNDS_SW: LatLngTuple = [14.6874, 121.0957];
export const PH_BOUNDS_NE: LatLngTuple = [14.8348, 121.3612];

export const PH_BOUNDS: [LatLngTuple, LatLngTuple] = [PH_BOUNDS_SW, PH_BOUNDS_NE];

export const PH_MAP_CENTER: LatLngExpression = [14.7325, 121.1453];
export const PH_MAP_ZOOM = 12;

export const PH_OUTLINE_GEOJSON_URL = `${import.meta.env.BASE_URL}rodriguez-outline.geojson`;

export const PH_OUTLINE_ATTRIBUTION = "Rodriguez &copy; OpenStreetMap";

export const PH_OUTLINE_STYLE: PathOptions = {
  fillColor: "#2563EB",
  fillOpacity: 0.32,
  color: "#60A5FA",
  weight: 2,
  opacity: 0.95,
};

export const PH_OUTLINE_GLOW_STYLE: PathOptions = {
  fill: false,
  color: "#3B82F6",
  weight: 5,
  opacity: 0.22,
};

export type PhCityMarkerStatus = "active" | "waiting";

export type PhCityMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;

  status?: PhCityMarkerStatus;
  labelSide?: "left" | "right";
};

export const PH_CITY_MARKERS: PhCityMarker[] = [
  { id: "aeye_1", name: "Highway", lat: 14.736, lng: 121.205, status: "active", labelSide: "right" },
  { id: "aeye_2", name: "Luvers", lat: 14.728, lng: 121.212, status: "waiting", labelSide: "left" },
  { id: "aeye_3", name: "Market", lat: 14.742, lng: 121.198, status: "waiting", labelSide: "right" },
  { id: "aeye_4", name: "Baliwag", lat: 14.751, lng: 121.185, status: "waiting", labelSide: "left" },
  { id: "aeye_5", name: "Chowking", lat: 14.722, lng: 121.228, status: "waiting", labelSide: "right" },
];

export const PH_EXTRA_DOTS: { lat: number; lng: number }[] = [];
