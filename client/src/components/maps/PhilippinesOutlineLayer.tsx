import { useEffect, useState } from "react";
import type { GeoJsonObject } from "geojson";
import { GeoJSON, useMap } from "react-leaflet";
import {
  PH_OUTLINE_GEOJSON_URL,
  PH_OUTLINE_GLOW_STYLE,
  PH_OUTLINE_STYLE,
} from "./phMapData";

export function PhilippinesOutlineLayer() {
  const map = useMap();
  const [data, setData] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(PH_OUTLINE_GEOJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`outline ${r.status}`);
        return r.json() as Promise<GeoJsonObject>;
      })
      .then((geo) => {
        if (!cancelled) setData(geo);
      })
      .catch(() => {

      });
    return () => {
      cancelled = true;
    };
  }, [map]);

  if (!data) return null;

  return (
    <>
      <GeoJSON data={data} style={() => PH_OUTLINE_GLOW_STYLE} />
      <GeoJSON data={data} style={() => PH_OUTLINE_STYLE} />
    </>
  );
}
