import { useMemo } from "react";
import { Box, Tooltip } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { OPS_CAMERA_MARKERS, RODRIGUEZ_MAP_BG } from "./rodriguezMapData";
import {
  VIOLATION_TIER_META,
  violationCountByCamera,
  violationTier,
  type CameraViolationRow,
  type ViolationActivityTier,
} from "../../lib/opsMapViolations";

type Props = {
  minHeight?: number | string;
  violationsByCamera?: CameraViolationRow[];
};

function CameraMarker({ tier, name, violationCount }: { tier: ViolationActivityTier; name: string; violationCount: number }) {
  const meta = VIOLATION_TIER_META[tier];
  const tip =
    violationCount > 0 ? `${name} · ${violationCount} violation${violationCount === 1 ? "" : "s"} today` : `${name} · no violations today`;

  return (
    <Tooltip
      title={tip}
      placement="top"
      arrow
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "rgba(15, 23, 42, 0.94)",
            border: "1px solid rgba(148, 163, 184, 0.25)",
            fontSize: "0.6875rem",
            fontWeight: 600,
            py: 0.75,
            px: 1.25,
          },
        },
      }}
    >
      <Box
        className="rodriguez-cam-pin"
        sx={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 44,
          height: 44,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${meta.glow} 0%, transparent 72%)`,
            animation: "opsMapPulse 2.8s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: `2px solid ${meta.color}`,
            boxShadow: `0 0 12px ${meta.color}, 0 0 22px ${meta.glow}`,
            opacity: 0.9,
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "relative",
            zIndex: 2,
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(180deg, #3B82F6 0%, #1D4ED8 55%, #1E40AF 100%)",
            border: "2px solid rgba(255, 255, 255, 0.95)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.4)",
            pointerEvents: "none",
          }}
        >
          <VideocamIcon sx={{ fontSize: 15, color: "#fff" }} />
        </Box>
      </Box>
    </Tooltip>
  );
}

function MapLegend() {
  const tiers: ViolationActivityTier[] = ["low", "moderate", "high"];

  return (
    <Box
      className="rodriguez-map-legend"
      sx={{
        position: "absolute",
        right: 10,
        bottom: 36,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        gap: 0.35,
        px: 1,
        py: 0.75,
        borderRadius: "8px",
        bgcolor: "rgba(6, 14, 32, 0.55)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(59, 130, 246, 0.2)",
        pointerEvents: "none",
      }}
    >
      <Box sx={{ fontSize: "0.5625rem", fontWeight: 700, color: "rgba(226, 232, 240, 0.75)", letterSpacing: "0.06em", mb: 0.25 }}>
        Legend
      </Box>
      {tiers.map((tier) => (
        <Box key={tier} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
          <Box
            sx={{
              width: 14,
              height: 3,
              borderRadius: 2,
              bgcolor: VIOLATION_TIER_META[tier].color,
              boxShadow: `0 0 6px ${VIOLATION_TIER_META[tier].color}`,
              flexShrink: 0,
            }}
          />
          <Box sx={{ fontSize: "0.5625rem", fontWeight: 600, color: "rgba(226, 232, 240, 0.8)", whiteSpace: "nowrap" }}>
            {VIOLATION_TIER_META[tier].label}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export function RodriguezOperationsMap({ minHeight = 300, violationsByCamera = [] }: Props) {
  const countMap = useMemo(() => violationCountByCamera(violationsByCamera), [violationsByCamera]);
  const maxViolations = useMemo(() => {
    let max = 0;
    for (const cam of OPS_CAMERA_MARKERS) {
      const c = countMap.get(cam.id) ?? 0;
      if (c > max) max = c;
    }
    for (const r of violationsByCamera) max = Math.max(max, Number(r.total || 0));
    return max;
  }, [countMap, violationsByCamera]);

  const mapMinH = typeof minHeight === "number" ? minHeight : 300;

  return (
    <Box
      className="rodriguez-ops-map-root"
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: mapMinH,
        borderRadius: "12px",
        overflow: "hidden",
        bgcolor: "#050a12",
        border: "1px solid rgba(30, 100, 180, 0.35)",
        boxShadow: "inset 0 1px 0 rgba(59, 130, 246, 0.12)",
      }}
    >
      <Box
        component="img"
        src={RODRIGUEZ_MAP_BG}
        alt=""
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          display: "block",
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
            radial-gradient(ellipse 90% 80% at 50% 45%, transparent 35%, rgba(5, 10, 18, 0.45) 100%),
            linear-gradient(180deg, rgba(5, 10, 18, 0.2) 0%, transparent 20%, transparent 85%, rgba(5, 10, 18, 0.35) 100%)
          `,
        }}
      />

      <Box sx={{ position: "absolute", inset: 0, zIndex: 3 }}>
        {OPS_CAMERA_MARKERS.map((cam) => {
          const count = countMap.get(cam.id) ?? countMap.get(cam.id.toUpperCase()) ?? 0;
          const tier = violationTier(count, maxViolations);
          return (
            <Box key={cam.id} sx={{ position: "absolute", left: cam.left, top: cam.top, width: 0, height: 0 }}>
              <CameraMarker tier={tier} name={cam.name} violationCount={count} />
            </Box>
          );
        })}
      </Box>

      <MapLegend />

      <Box
        sx={{
          position: "absolute",
          left: 10,
          bottom: 8,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          maxWidth: "55%",
          pointerEvents: "none",
        }}
      >
        <InfoOutlinedIcon sx={{ fontSize: 12, color: "rgba(148, 163, 184, 0.75)", flexShrink: 0 }} />
        <Box sx={{ fontSize: "0.5625rem", fontWeight: 500, color: "rgba(148, 163, 184, 0.8)", lineHeight: 1.35 }}>
          Halo color = today&apos;s violations at each checkpoint.
        </Box>
      </Box>
    </Box>
  );
}
