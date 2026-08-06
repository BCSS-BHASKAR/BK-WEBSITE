import { useState } from "react";
import { Box, IconButton, Paper, Typography } from "@mui/material";
import PolicyIcon from "@mui/icons-material/Policy";
import FlipIcon from "@mui/icons-material/Flip";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import type { ImageZoomPayload } from "./ImageZoomDialog";
import { zoomPayloadFromViolationRow } from "../lib/eventImageZoom";
import { receiverImageUrl } from "../lib/receiverImageUrl";
import { formatVehicleEventDisplayTime } from "../lib/siteTimeZone";
import { SITE_LABELS } from "../i18n/lang";
import { violationTypeLabel, violationTypeMeta } from "../lib/violationTypes";

export type ViolationEventRow = {
  id: number;
  violationType: string;
  score: number;
  feedback?: number | null;
  detectedAt: string;
  cameraId: string;
  cameraName: string;
  plate: string | null;
  fullImageUrl: string | null;
  plateUrl: string | null;
};

export function ViolationEventCard({
  row,
  onZoom,
  highlighted = false,
}: {
  row: ViolationEventRow;
  onZoom: (payload: ImageZoomPayload) => void;
  highlighted?: boolean;
}) {
  const meta = violationTypeMeta(row.violationType);
  const TypeIcon = meta?.Icon ?? PolicyIcon;
  const scene = receiverImageUrl(row.fullImageUrl);
  const plate = receiverImageUrl(row.plateUrl);
  const [showPlate, setShowPlate] = useState(false);

  const hasScene = Boolean(scene);
  const hasPlate = Boolean(plate);
  const mainSrc = hasScene ? (showPlate && hasPlate ? plate : scene) : hasPlate ? plate : "";

  const iconShell = {
    position: "absolute" as const,
    top: 10,
    width: 34,
    height: 34,
    padding: 0,
    borderRadius: "10px",
    zIndex: 2,
    bgcolor: "rgba(255,255,255,0.92)",
    color: "primary.main",
    border: "1px solid rgba(15,23,42,0.08)",
    backdropFilter: "blur(8px)",
    boxShadow: "0 6px 18px rgba(2,6,23,0.12)",
    "&:hover": { bgcolor: "#fff", color: "primary.dark" },
  };

  return (
    <Paper
      id={`violation-event-${row.id}`}
      elevation={0}
      variant="outlined"
      className="vsp-event-card"
      sx={{
        overflow: "hidden",
        position: "relative",
        borderRadius: "10px",
        bgcolor: "rgba(255,255,255,0.96)",
        borderColor: highlighted ? "#2563EB" : meta ? `${meta.color}33` : "rgba(15, 23, 42, 0.08)",
        boxShadow: highlighted
          ? "0 0 0 2px rgba(37,99,235,0.35), 0 10px 32px rgba(2, 6, 23, 0.06)"
          : "0 10px 32px rgba(2, 6, 23, 0.06)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease",
        "&:hover": {
          boxShadow: "0 16px 44px rgba(2,6,23,0.1)",
          transform: "translateY(-2px)",
          borderColor: meta ? `${meta.color}55` : "rgba(29, 78, 216, 0.18)",
        },
      }}
    >
      <Box sx={{ position: "relative", bgcolor: "#0b1220" }}>
        {mainSrc ? (
          <img
            src={mainSrc}
            alt="Violation capture"
            style={{ width: "100%", height: 156, objectFit: "cover", display: "block" }}
          />
        ) : (
          <Box
            sx={{
              height: 156,
              display: "grid",
              placeItems: "center",
              bgcolor: "grey.900",
              color: "grey.500",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            No capture image on file
          </Box>
        )}

        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 48,
            background: "linear-gradient(180deg, transparent, rgba(2,6,23,0.55))",
            pointerEvents: "none",
          }}
        />

        <Box
          component="span"
          title={violationTypeLabel(row.violationType)}
          aria-label={violationTypeLabel(row.violationType)}
          sx={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 2,
            width: 34,
            height: 34,
            borderRadius: 1.5,
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(255,255,255,0.94)",
            color: meta?.color ?? "#0f172a",
            border: `2px solid ${meta?.color ?? "#0f172a"}`,
            backdropFilter: "blur(8px)",
            boxShadow: "0 6px 18px rgba(2,6,23,0.28)",
          }}
        >
          <TypeIcon sx={{ fontSize: 20 }} />
        </Box>

        {hasPlate && hasScene ? (
          <IconButton
            onClick={() => setShowPlate((p) => !p)}
            size="small"
            title={showPlate ? "Show scene" : "Show plate crop"}
            sx={{ ...iconShell, right: 52 }}
          >
            <FlipIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : null}

        {mainSrc ? (
          <IconButton
            onClick={() => {
              const payload = zoomPayloadFromViolationRow(row);
              if (payload) onZoom(payload);
            }}
            size="small"
            title="Zoom image"
            sx={{ ...iconShell, right: 10 }}
          >
            <ZoomInIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : null}
      </Box>

      <Box sx={{ p: 2, pt: 1.75 }}>
        <Typography
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
            fontWeight: 800,
            fontSize: "1.05rem",
            letterSpacing: "-0.02em",
            color: "text.primary",
          }}
        >
          {row.plate?.trim() || SITE_LABELS.plateNumberPending}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", display: "block", mt: 0.35 }}>
          License plate
        </Typography>

        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(15,23,42,0.07)" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
              Camera site
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", textAlign: "right" }}>
              {row.cameraName || row.cameraId}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
              Detected at
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", textAlign: "right" }}>
              {row.detectedAt
                ? formatVehicleEventDisplayTime({ created_at: row.detectedAt })
                : "-"}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
