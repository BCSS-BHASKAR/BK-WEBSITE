import { useEffect, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import L from "leaflet";
import { MapContainer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { PhilippinesOutlineLayer } from "./PhilippinesOutlineLayer";
import {
  PH_BOUNDS_SW,
  PH_BOUNDS_NE,
  PH_CITY_MARKERS,
  PH_EXTRA_DOTS,
  PH_MAP_CENTER,
  PH_MAP_ZOOM,
  PH_OUTLINE_ATTRIBUTION,
  type PhCityMarker,
} from "./phMapData";

type Props = {

  showHeader?: boolean;

  minHeight?: number | string;

  idPrefix?: string;
};

function FitCityBounds() {
  const map = useMap();

  useEffect(() => {
    map.fitBounds([PH_BOUNDS_SW, PH_BOUNDS_NE], { padding: [20, 20], maxZoom: 13 });
  }, [map]);

  return null;
}

function cityMarkerHtml(city: PhCityMarker, idPrefix: string): string {
  const active = city.status === "active";
  const waiting = !active;
  const labelColor = active ? "#FCA5A5" : "#FDE047";
  const dotSize = active ? 14 : 10;
  const labelRight = city.labelSide === "right";
  const labelPos = labelRight
    ? `left:${dotSize + 6}px;top:50%;transform:translateY(-50%)`
    : `right:${dotSize + 6}px;top:50%;transform:translateY(-50%)`;
  const pulseRing = active
    ? `<span style="position:absolute;inset:-18px;border-radius:50%;border:2px solid rgba(239,68,68,0.35);animation:opsMapPulse 2.5s ease-in-out infinite"></span>
       <span style="position:absolute;inset:-10px;border-radius:50%;background:rgba(239,68,68,0.4);box-shadow:0 0 20px rgba(239,68,68,0.7)"></span>`
    : `<span style="position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(234,179,8,0.4);animation:opsMapPulse 2.8s ease-in-out infinite"></span>
       <span style="position:absolute;inset:-5px;border-radius:50%;background:rgba(234,179,8,0.35);box-shadow:0 0 14px rgba(250,204,21,0.65)"></span>`;
  const coreColor = active ? "#EF4444" : "#EAB308";
  const coreGlow = active
    ? "0 0 10px #fff, 0 0 18px rgba(239,68,68,0.9)"
    : "0 0 8px #fff, 0 0 14px rgba(250,204,21,0.85)";
  const waitTag = waiting
    ? `<span style="display:inline-block;margin-left:4px;font-size:8px;font-weight:800;letter-spacing:0.08em;color:#FBBF24;opacity:0.95">WAIT</span>`
    : "";

  return `
    <div id="${idPrefix}-${city.id}" style="position:relative;width:0;height:0;pointer-events:none">
      <span style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px">
        ${pulseRing}
        <span style="position:absolute;inset:${active ? 3 : 2}px;border-radius:50%;background:${coreColor};box-shadow:${coreGlow}"></span>
        <span style="position:absolute;inset:${active ? 5 : 3}px;border-radius:50%;background:#fff"></span>
      </span>
      <span style="position:absolute;${labelPos};font-size:${active ? 12 : 11}px;font-weight:${active ? 700 : 600};color:${labelColor};letter-spacing:0.03em;text-shadow:0 1px 6px rgba(0,0,0,0.85);font-family:Inter,system-ui,sans-serif;white-space:nowrap">${city.name}${waitTag}</span>
    </div>
  `;
}

function extraDotHtml(): string {
  return `
    <span style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);display:block;width:8px;height:8px;border-radius:50%;background:rgba(234,179,8,0.55);box-shadow:0 0 10px rgba(250,204,21,0.75)">
      <span style="position:absolute;inset:2px;border-radius:50%;background:#fff"></span>
    </span>
  `;
}

export function PhilippinesOperationalMap({
  showHeader = false,
  minHeight = 220,
  idPrefix = "ph",
}: Props) {
  const bounds = useMemo(() => L.latLngBounds(PH_BOUNDS_SW, PH_BOUNDS_NE), []);

  const cityIcons = useMemo(
    () =>
      PH_CITY_MARKERS.map((city) =>
        L.divIcon({
          className: "ph-ops-marker",
          html: cityMarkerHtml(city, idPrefix),
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        })
      ),
    [idPrefix]
  );

  const extraIcons = useMemo(
    () =>
      PH_EXTRA_DOTS.map(() =>
        L.divIcon({
          className: "ph-ops-extra",
          html: `<div style="position:relative;width:0;height:0">${extraDotHtml()}</div>`,
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        })
      ),
    []
  );

  const mapMinH = typeof minHeight === "number" ? minHeight : 220;

  return (
    <Box
      className="ph-ops-map-root"
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight,
        borderRadius: showHeader ? 2 : "8px",
        overflow: "hidden",
        bgcolor: "#050b14",
        background: `
          radial-gradient(ellipse 80% 60% at 50% 42%, rgba(37, 99, 235, 0.1) 0%, transparent 65%),
          linear-gradient(180deg, #0a1628 0%, #050b14 100%)
        `,
        "& .leaflet-container": {
          width: "100%",
          height: "100%",
          minHeight: mapMinH,
          background: "transparent",
          fontFamily: "Inter, system-ui, sans-serif",
        },
        "& .leaflet-control-attribution": {
          fontSize: "9px",
          lineHeight: 1.2,
          bgcolor: "rgba(6, 18, 40, 0.75) !important",
          color: "rgba(148, 163, 184, 0.9) !important",
          backdropFilter: "blur(6px)",
          borderRadius: "4px 0 0 0",
          px: 0.75,
          py: 0.25,
        },
        "& .ph-ops-marker, & .ph-ops-extra": {
          background: "transparent !important",
          border: "none !important",
        },
      }}
    >
      <MapContainer
        center={PH_MAP_CENTER}
        zoom={PH_MAP_ZOOM}
        minZoom={11}
        maxZoom={15}
        maxBounds={bounds}
        maxBoundsViscosity={1}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%", minHeight: mapMinH }}
      >
        <PhilippinesOutlineLayer />
        <FitCityBounds />
        {PH_CITY_MARKERS.map((city, i) => (
          <Marker key={city.id} position={[city.lat, city.lng]} icon={cityIcons[i]} />
        ))}
        {PH_EXTRA_DOTS.map((dot, i) => (
          <Marker key={`extra-${i}`} position={[dot.lat, dot.lng]} icon={extraIcons[i]} />
        ))}
      </MapContainer>

      {}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 500,
          opacity: 0.35,
          backgroundImage: `
            linear-gradient(rgba(30, 100, 180, 0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30, 100, 180, 0.12) 1px, transparent 1px)
          `,
          backgroundSize: "46px 44px",
          boxShadow: "inset 0 0 0 1px rgba(30, 100, 180, 0.25)",
        }}
      />

      {showHeader ? (
        <Box
          sx={{
            position: "absolute",
            top: 10,
            left: 12,
            zIndex: 600,
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            pointerEvents: "none",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.625rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "rgba(226, 232, 240, 0.92)",
              textTransform: "uppercase",
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            }}
          >
            Live Operational Overview
          </Typography>
          <FiberManualRecordIcon sx={{ fontSize: 8, color: "#22C55E" }} />
          <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#4ADE80" }}>Live</Typography>
        </Box>
      ) : null}

      <Typography
        component="span"
        sx={{
          position: "absolute",
          right: 6,
          bottom: 4,
          zIndex: 600,
          fontSize: "9px",
          color: "rgba(148, 163, 184, 0.75)",
          pointerEvents: "none",
        }}
      >
        {PH_OUTLINE_ATTRIBUTION}
      </Typography>
    </Box>
  );
}
