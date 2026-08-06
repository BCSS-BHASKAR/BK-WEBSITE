import { useMemo } from "react";
import { Box, Chip, Typography } from "@mui/material";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { OPS_CAMERA_MARKERS, RODRIGUEZ_MAP_BG } from "../maps/rodriguezMapData";
import { journeyStopsToMapPoints } from "../../lib/journeyMapPositions";

type Stop = {
  sequence: number;
  siteName: string;
  cameraId: string;
  isFirst?: boolean;
  isLast?: boolean;
};

type Props = {
  stops: Stop[];
  route: { coordinates: [number, number][]; distanceKm: number; duration: string; averageSpeedKmh: number | null };
  movementPattern?: string;
  minHeight?: number | string;
};

function JourneyStopPin({
  sequence,
  isFirst,
  isLast,
  name,
}: {
  sequence: number;
  isFirst: boolean;
  isLast: boolean;
  name: string;
}) {
  const bg = isLast
    ? "linear-gradient(180deg, #F59E0B 0%, #D97706 100%)"
    : isFirst
      ? "linear-gradient(180deg, #22C55E 0%, #16A34A 100%)"
      : "linear-gradient(180deg, #3B82F6 0%, #1D4ED8 100%)";

  return (
    <Box
      sx={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.35,
        pointerEvents: "none",
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: bg,
          border: isLast ? "2.5px solid #F59E0B" : "2.5px solid #fff",
          boxShadow: isLast ? "0 0 0 3px rgba(245, 158, 11, 0.35), 0 4px 14px rgba(0,0,0,0.45)" : "0 4px 14px rgba(0,0,0,0.45)",
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
          fontSize: "0.8125rem",
          color: "#fff",
        }}
      >
        {sequence}
      </Box>
      <Box
        sx={{
          px: 0.75,
          py: 0.2,
          borderRadius: 1,
          bgcolor: "rgba(6, 14, 32, 0.82)",
          border: "1px solid rgba(59, 130, 246, 0.35)",
          backdropFilter: "blur(6px)",
        }}
      >
        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 800, color: "#e2e8f0", whiteSpace: "nowrap" }}>
          {name}
          {isFirst ? " · Entry" : isLast ? " · Last" : ""}
        </Typography>
      </Box>
    </Box>
  );
}

function DimCameraPin() {
  return (
    <Box
      sx={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        opacity: 0.35,
        pointerEvents: "none",
      }}
    >
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          bgcolor: "rgba(30, 58, 95, 0.9)",
          border: "1px solid rgba(148, 163, 184, 0.4)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <VideocamOutlinedIcon sx={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }} />
      </Box>
    </Box>
  );
}

export function JourneyRouteMap({ stops, route, movementPattern, minHeight = 380 }: Props) {
  const mapPoints = useMemo(() => journeyStopsToMapPoints(stops), [stops]);
  const visitedIds = useMemo(() => new Set(mapPoints.map((p) => p.cameraId.toUpperCase())), [mapPoints]);

  const polyline = useMemo(() => {
    if (mapPoints.length < 2) return "";
    return mapPoints.map((p) => `${p.left},${p.top}`).join(" ");
  }, [mapPoints]);

  const mapMinH = typeof minHeight === "number" ? minHeight : 380;

  return (
    <Box
      className="journey-ops-map-root"
      sx={{
        position: "relative",
        width: "100%",
        minHeight: mapMinH,
        borderRadius: "12px",
        overflow: "hidden",
        bgcolor: "#050a12",
        border: "1px solid rgba(30, 100, 180, 0.4)",
        boxShadow: "inset 0 1px 0 rgba(59, 130, 246, 0.15), 0 8px 32px rgba(15, 23, 42, 0.12)",
      }}
    >
      <Box
        component="img"
        src={RODRIGUEZ_MAP_BG}
        alt="Rodriguez operations map"
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(ellipse 85% 75% at 50% 48%, transparent 30%, rgba(5, 10, 18, 0.5) 100%),
            linear-gradient(180deg, rgba(5, 10, 18, 0.15) 0%, transparent 18%, transparent 82%, rgba(5, 10, 18, 0.4) 100%)
          `,
        }}
      />

      {}
      <Box
        className="journey-map-scan"
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          height: "28%",
          pointerEvents: "none",
          zIndex: 2,
          background: "linear-gradient(180deg, transparent, rgba(59, 130, 246, 0.06), transparent)",
          animation: "opsMapScan 6s linear infinite",
          opacity: 0.7,
        }}
      />

      {polyline ? (
        <Box
          component="svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 4, pointerEvents: "none" }}
        >
          <defs>
            <linearGradient id="journeyRouteGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset="50%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
            <filter id="journeyGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <polyline
            points={polyline}
            fill="none"
            stroke="rgba(37, 99, 235, 0.35)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            className="journey-route-line"
            points={polyline}
            fill="none"
            stroke="url(#journeyRouteGrad)"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 2"
            filter="url(#journeyGlow)"
          />
        </Box>
      ) : null}

      {}
      <Box sx={{ position: "absolute", inset: 0, zIndex: 3 }}>
        {OPS_CAMERA_MARKERS.filter((cam) => !visitedIds.has(cam.id.toUpperCase())).map((cam) => (
          <Box key={cam.id} sx={{ position: "absolute", left: cam.left, top: cam.top, width: 0, height: 0 }}>
            <DimCameraPin />
          </Box>
        ))}
      </Box>

      {}
      <Box sx={{ position: "absolute", inset: 0, zIndex: 5 }}>
        {mapPoints.map((p) => (
          <Box key={`${p.sequence}-${p.cameraId}`} sx={{ position: "absolute", left: `${p.left}%`, top: `${p.top}%`, width: 0, height: 0 }}>
            <JourneyStopPin sequence={p.sequence} isFirst={p.isFirst} isLast={p.isLast} name={p.name} />
          </Box>
        ))}
      </Box>

      {}
      <Box
        sx={{
          position: "absolute",
          left: 12,
          top: 12,
          zIndex: 7,
          display: "flex",
          flexWrap: "wrap",
          gap: 0.75,
          alignItems: "center",
          maxWidth: "72%",
        }}
      >
        <Chip
          size="small"
          icon={<RouteOutlinedIcon sx={{ fontSize: "14px !important" }} />}
          label="Live route trace"
          sx={{
            fontWeight: 800,
            bgcolor: "rgba(6, 14, 32, 0.72)",
            color: "#93c5fd",
            border: "1px solid rgba(59, 130, 246, 0.45)",
            backdropFilter: "blur(8px)",
          }}
        />
        {movementPattern ? (
          <Typography
            sx={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              color: "rgba(226, 232, 240, 0.92)",
              px: 1,
              py: 0.35,
              borderRadius: 1,
              bgcolor: "rgba(6, 14, 32, 0.55)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
            }}
          >
            {movementPattern}
          </Typography>
        ) : null}
      </Box>

      {}
      <Box
        sx={{
          position: "absolute",
          right: 10,
          bottom: 72,
          zIndex: 7,
          display: "flex",
          flexDirection: "column",
          gap: 0.4,
          px: 1,
          py: 0.75,
          borderRadius: "8px",
          bgcolor: "rgba(6, 14, 32, 0.62)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          pointerEvents: "none",
        }}
      >
        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, color: "rgba(226,232,240,0.75)", letterSpacing: "0.06em", mb: 0.25 }}>
          Journey
        </Typography>
        {[
          { color: "#22C55E", label: "Entry" },
          { color: "#2563EB", label: "Waypoint" },
          { color: "#F59E0B", label: "Last seen" },
        ].map((row) => (
          <Box key={row.label} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: row.color, boxShadow: `0 0 8px ${row.color}` }} />
            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 600, color: "rgba(226,232,240,0.85)" }}>{row.label}</Typography>
          </Box>
        ))}
      </Box>

      {}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          p: 1.5,
          bgcolor: "rgba(6, 14, 32, 0.88)",
          backdropFilter: "blur(10px)",
          borderTop: "1px solid rgba(59, 130, 246, 0.25)",
          zIndex: 7,
        }}
      >
        {[
          { label: "Distance (est.)", value: `${route.distanceKm} km` },
          { label: "Total time", value: route.duration },
          { label: "Avg speed (est.)", value: route.averageSpeedKmh != null ? `${route.averageSpeedKmh} km/h` : "—" },
        ].map((stat) => (
          <Box key={stat.label}>
            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 800, color: "rgba(148, 163, 184, 0.9)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {stat.label}
            </Typography>
            <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: "#f8fafc", lineHeight: 1.2 }}>{stat.value}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
