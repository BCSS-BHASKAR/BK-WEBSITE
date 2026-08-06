import { Box, Chip, Link, Paper, Skeleton, Typography } from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import VideocamOffRoundedIcon from "@mui/icons-material/VideocamOffRounded";
import { LiveStreamPlayer } from "../LiveStreamPlayer";
import { displayCameraName } from "../../lib/cameraDisplay";
import { contentCardSx } from "../../lib/uiSurfaces";
import { pnp, pnpFont } from "../../lib/pnpTheme";

type Stream = { id: string; name: string; online: boolean };

type Props = {
  streams: Stream[];
  pending?: boolean;
  onSelect?: (id: string) => void;
  onViewAll?: () => void;
};

export function DashboardLiveCameras({ streams, pending, onSelect, onViewAll }: Props) {
  const tiles = streams.slice(0, 4);
  while (tiles.length < 4) tiles.push({ id: `empty-${tiles.length}`, name: "No feed", online: false });

  return (
    <Box sx={{ ...contentCardSx, p: 2, height: "100%", minHeight: 300, minWidth: 0, maxWidth: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Typography sx={pnpFont.cardTitle}>Live Camera Feed</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Chip
          size="small"
          icon={<FiberManualRecordIcon sx={{ fontSize: "8px !important", color: `${pnp.success} !important` }} />}
          label="Live"
          sx={{ height: 22, fontSize: "0.625rem", fontWeight: 700, bgcolor: pnp.successSoft, color: pnp.success, border: "none" }}
        />
        {onViewAll ? (
          <Link component="button" type="button" onClick={onViewAll} sx={{ fontSize: "0.75rem", fontWeight: 600 }}>
            View all
          </Link>
        ) : null}
        </Box>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, flex: 1 }}>
        {tiles.map((s) => (
          <Paper
            key={s.id}
            elevation={0}
            onClick={() => s.online && onSelect?.(s.id)}
            sx={{
              aspectRatio: "16/10",
              borderRadius: "8px",
              overflow: "hidden",
              bgcolor: "#0F172A",
              border: "1px solid rgba(15, 23, 42, 0.12)",
              position: "relative",
              cursor: s.online ? "pointer" : "default",
            }}
          >
            {pending ? (
              <Skeleton variant="rectangular" width="100%" height="100%" />
            ) : s.online ? (
              <LiveStreamPlayer streamId={s.id} compact />
            ) : (
              <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "rgba(148,163,184,0.45)" }}>
                <VideocamOffRoundedIcon sx={{ fontSize: 28 }} />
              </Box>
            )}
            <Typography
              sx={{
                position: "absolute",
                left: 8,
                bottom: 8,
                fontSize: "0.625rem",
                fontWeight: 600,
                color: "#fff",
                bgcolor: "rgba(0,0,0,0.6)",
                px: 0.75,
                py: 0.35,
                borderRadius: "4px",
                maxWidth: "calc(100% - 16px)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayCameraName(s.name, s.id)}
            </Typography>
            {s.online ? (
              <Box
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.35,
                  bgcolor: "rgba(0,0,0,0.5)",
                  px: 0.6,
                  py: 0.25,
                  borderRadius: "4px",
                }}
              >
                <FiberManualRecordIcon sx={{ fontSize: 7, color: pnp.success }} />
                <Typography sx={{ fontSize: "0.5rem", fontWeight: 700, color: "#86EFAC" }}>Live</Typography>
              </Box>
            ) : null}
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
