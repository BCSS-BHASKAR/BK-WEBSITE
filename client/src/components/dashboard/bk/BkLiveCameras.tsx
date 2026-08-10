import { Box, Skeleton, Typography } from "@mui/material";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import VideocamOffRoundedIcon from "@mui/icons-material/VideocamOffRounded";
import { LiveStreamPlayer } from "../../LiveStreamPlayer";
import { displayCameraName } from "../../../lib/cameraDisplay";
import { bk, bkCardSx, bkPanelTitleSx } from "./bkTokens";

/** One "Walk-ins: 2" style figure in a tile's overlay chip. */
export type CameraMetric = { label: string; value: number; tone: "green" | "red" | "purple" | "orange" };

export type CameraTile = {
  id: string;
  name: string;
  online: boolean;
  /** Empty when this camera could not be matched to any inference activity. */
  metrics: CameraMetric[];
};

const TONE: Record<CameraMetric["tone"], string> = {
  green: bk.green,
  red: bk.red,
  purple: bk.purple,
  orange: bk.orange,
};

function MetricChip({ metrics, onOpen }: { metrics: CameraMetric[]; onOpen?: () => void }) {
  if (!metrics.length) return null;
  return (
    <Box
      sx={{
        position: "absolute",
        right: 8,
        bottom: 8,
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        bgcolor: "rgba(255,255,255,0.95)",
        borderRadius: `${bk.radiusSm}px`,
        boxShadow: "0 2px 8px rgba(0,0,0,.25)",
        px: 1,
        py: 0.5,
        maxWidth: "calc(100% - 16px)",
      }}
    >
      {metrics.map((m) => (
        <Typography
          key={m.label}
          sx={{ fontSize: "0.6875rem", fontWeight: 800, color: TONE[m.tone], lineHeight: 1.2, whiteSpace: "nowrap" }}
        >
          {m.label}: {m.value}
        </Typography>
      ))}
      {onOpen ? (
        <OpenInNewRoundedIcon sx={{ fontSize: 12, color: bk.muted, flexShrink: 0 }} />
      ) : null}
    </Box>
  );
}

type Props = {
  tiles: CameraTile[];
  loading?: boolean;
  onOpen?: (id: string) => void;
};

export function BkLiveCameras({ tiles, loading, onOpen }: Props) {
  // The design is a fixed 2x2. Fewer cameras than that leaves labelled empty
  // slots rather than a ragged grid; more than four are reachable from Live View.
  const slots: (CameraTile | null)[] = [0, 1, 2, 3].map((i) => tiles[i] ?? null);

  return (
    <Box sx={{ ...bkCardSx, p: 2, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            bgcolor: bk.greenBright,
            boxShadow: `0 0 0 3px ${bk.greenSoft}`,
            flexShrink: 0,
          }}
        />
        <Typography sx={bkPanelTitleSx}>Live Camera Overview</Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gridAutoRows: "1fr",
          gap: 1.25,
        }}
      >
        {slots.map((t, i) => {
          const index = String(i + 1).padStart(2, "0");
          const title = t ? displayCameraName(t.name, t.id) : "No feed";
          const clickable = Boolean(t?.online && onOpen);
          return (
            <Box
              key={t?.id ?? `slot-${i}`}
              onClick={clickable ? () => onOpen?.(t!.id) : undefined}
              sx={{
                position: "relative",
                // Holds the design's landscape tile at every width. The grid rows
                // are 1fr so the card can still stretch to match the trend card
                // beside it; the ratio is the floor, not a lock.
                aspectRatio: "16 / 7.6",
                minHeight: 118,
                borderRadius: `${bk.radiusSm}px`,
                overflow: "hidden",
                bgcolor: "#101A12",
                cursor: clickable ? "pointer" : "default",
              }}
            >
              {loading ? (
                <Skeleton variant="rectangular" width="100%" height="100%" sx={{ bgcolor: "rgba(255,255,255,.08)" }} />
              ) : t?.online ? (
                <LiveStreamPlayer streamId={t.id} compact />
              ) : (
                <Box
                  sx={{
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(150deg, #1B2A1D 0%, #0D140E 100%)",
                    color: "rgba(226,232,222,0.35)",
                  }}
                >
                  <VideocamOffRoundedIcon sx={{ fontSize: 26 }} />
                </Box>
              )}

              {/* Scrim behind the caption - the label has to stay readable over a
                  bright frame as well as a dark one. */}
              <Box
                aria-hidden
                sx={{
                  position: "absolute",
                  insetInline: 0,
                  top: 0,
                  height: 44,
                  background: "linear-gradient(180deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,0) 100%)",
                  pointerEvents: "none",
                }}
              />
              <Typography
                sx={{
                  position: "absolute",
                  left: 10,
                  top: 8,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#FFFFFF",
                  textShadow: "0 1px 3px rgba(0,0,0,.5)",
                  maxWidth: "calc(100% - 40px)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <Box component="span" sx={{ opacity: 0.75, mr: 0.75 }}>{index}</Box>
                {title}
              </Typography>

              {t?.online ? (
                <Box
                  aria-label="Online"
                  sx={{
                    position: "absolute",
                    right: 10,
                    top: 11,
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    bgcolor: "#2FD25F",
                    boxShadow: "0 0 0 2px rgba(47,210,95,.3)",
                  }}
                />
              ) : null}

              {t ? <MetricChip metrics={t.metrics} onOpen={clickable ? () => onOpen?.(t.id) : undefined} /> : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
