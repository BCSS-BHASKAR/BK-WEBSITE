import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import VideocamOffRoundedIcon from "@mui/icons-material/VideocamOffRounded";
import { api } from "../lib/api";
import { displayCameraName } from "../lib/cameraDisplay";
import { LiveStreamPlayer } from "../components/LiveStreamPlayer";
import { PageBanner } from "../components/PageBanner";
import { pnp } from "../lib/pnpTheme";
import { gridCols, pageLayoutSx } from "../lib/uiSurfaces";
import { SITE_LABELS } from "../i18n/lang";

type StreamRow = {
  id: string;
  name: string;
  online: boolean;
  checkedAt: number;
  error: string | null;
  checking?: boolean;
};

type StreamListResp = {
  streams: StreamRow[];
  onlineCount: number;
  total: number;
  allOnline: boolean;
};

export function LiveViewPage() {
  const [active, setActive] = useState<StreamRow | null>(null);

  const statusQ = useQuery({
    queryKey: ["streams", "status"],
    queryFn: async () => (await api.get<StreamListResp>("/streams")).data,
    refetchInterval: (query) => {
      const rows = query.state.data?.streams ?? [];
      if (rows.some((s) => s.checking)) return 2_500;
      return 15_000;
    },
  });

  const rows: StreamRow[] = statusQ.data?.streams ?? [];
  const onlineCount = statusQ.data?.onlineCount ?? 0;
  const total = statusQ.data?.total ?? rows.length;
  const allOnline = !!statusQ.data?.allOnline;
  const pending = statusQ.isPending && !statusQ.data;
  const stillChecking = rows.some((s) => s.checking);

  useEffect(() => {
    if (!stillChecking) return;
    const t = window.setTimeout(() => {
      void statusQ.refetch();
    }, 2_000);
    return () => window.clearTimeout(t);
  }, [stillChecking, statusQ]);

  const statusAccent = allOnline ? pnp.success : pnp.danger;
  const statusSoft = allOnline ? pnp.successSoft : pnp.dangerSoft;

  return (
    <Box sx={pageLayoutSx}>
      <PageBanner
        title={SITE_LABELS.liveView}
        subtitle="Live status of every venue camera. Select a tile to open a larger view."
        icon={<VideocamRoundedIcon sx={{ fontSize: 28 }} />}
        trailing={
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                px: 1.5,
                py: 0.85,
                borderRadius: "10px",
                bgcolor: statusSoft,
                border: `1px solid ${allOnline ? "rgba(22, 163, 74, 0.22)" : "rgba(220, 38, 38, 0.22)"}`,
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "9px",
                  bgcolor: "background.paper",
                  border: `1px solid ${allOnline ? "rgba(22, 163, 74, 0.18)" : "rgba(220, 38, 38, 0.18)"}`,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {pending ? (
                  <Skeleton variant="circular" width={14} height={14} />
                ) : (
                  <Box
                    component="span"
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: statusAccent,
                      boxShadow: `0 0 0 3px ${allOnline ? "rgba(34, 197, 94, 0.28)" : "rgba(239, 68, 68, 0.28)"}`,
                      ...(allOnline
                        ? {
                            animation: "livePulse 2s ease-in-out infinite",
                            "@keyframes livePulse": {
                              "0%, 100%": { opacity: 1 },
                              "50%": { opacity: 0.55 },
                            },
                          }
                        : {}),
                    }}
                  />
                )}
              </Box>
              <Box sx={{ minWidth: 0, pr: 0.25 }}>
                {pending ? (
                  <Skeleton width={72} height={22} sx={{ borderRadius: 1 }} />
                ) : (
                  <Typography
                    sx={{
                      fontWeight: 800,
                      fontSize: "1.0625rem",
                      lineHeight: 1.1,
                      letterSpacing: "-0.02em",
                      color: pnp.text,
                    }}
                  >
                    <Box component="span" sx={{ color: statusAccent }}>
                      {onlineCount}
                    </Box>
                    <Box component="span" sx={{ color: pnp.textMuted, mx: 0.35, fontWeight: 600 }}>
                      /
                    </Box>
                    {total}
                  </Typography>
                )}
                <Typography
                  sx={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: pnp.textSecondary,
                    lineHeight: 1.2,
                    mt: 0.15,
                  }}
                >
                  {pending || stillChecking ? "Checking…" : "Cameras online"}
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={() => statusQ.refetch()}
              disabled={statusQ.isFetching}
              size="small"
              aria-label="Refresh stream status"
              sx={{
                width: 36,
                height: 36,
                borderRadius: "9px",
                border: "1px solid rgba(15, 23, 42, 0.1)",
                bgcolor: "background.paper",
                color: pnp.textSecondary,
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                "&:hover": { bgcolor: pnp.primarySoft, color: pnp.primary, borderColor: "rgba(37, 99, 235, 0.25)" },
              }}
            >
              <RefreshRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: gridCols(2),
            lg: gridCols(3),
          },
          gap: 2,
          pb: 4,
        }}
      >
        {pending
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: 3 }} />
            ))
          : rows.map((s) => (
              <Paper
                key={s.id}
                onClick={() => (s.online ? setActive(s) : undefined)}
                sx={{
                  p: 0,
                  borderRadius: 3,
                  overflow: "hidden",
                  cursor: s.online ? "pointer" : "default",
                  position: "relative",
                  transition: "box-shadow 0.18s ease, transform 0.18s ease",
                  "&:hover": s.online
                    ? {
                        boxShadow: "0 18px 40px rgba(23,38,56,0.18)",
                        transform: "translateY(-2px)",
                      }
                    : {},
                }}
              >
                <Box
                  sx={{
                    aspectRatio: "16 / 9",
                    position: "relative",
                    bgcolor: "#0F172A",
                  }}
                >
                  {s.online ? (
                    <LiveStreamPlayer streamId={s.id} compact muted controls={false} />
                  ) : s.checking ? (
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "rgba(255,255,255,0.85)",
                        bgcolor: "#0F172A",
                      }}
                    >
                      <Box sx={{ textAlign: "center" }}>
                        <CircularProgress size={28} sx={{ color: "rgba(255,255,255,0.85)", mb: 1 }} />
                        <Typography sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>Connecting…</Typography>
                      </Box>
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "rgba(255,255,255,0.85)",
                        bgcolor:
                          "radial-gradient(120% 80% at 50% 0%, #4C1D24 0%, #1F0A0E 60%, #07050A 100%)",
                      }}
                    >
                      <Box sx={{ textAlign: "center" }}>
                        <VideocamOffRoundedIcon sx={{ fontSize: 38, mb: 0.5, opacity: 0.85 }} />
                        <Typography sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
                          Offline
                        </Typography>
                        {s.error ? (
                          <Typography variant="caption" sx={{ opacity: 0.7 }}>
                            {s.error.length > 60 ? s.error.slice(0, 57) + "..." : s.error}
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>
                  )}
                  <Chip
                    size="small"
                    icon={
                      <Box
                        component="span"
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          display: "inline-block",
                          bgcolor: s.online ? "#22C55E" : s.checking ? "#F59E0B" : "#EF4444",
                          boxShadow: `0 0 0 3px ${
                            s.online
                              ? "rgba(34,197,94,0.35)"
                              : s.checking
                                ? "rgba(245,158,11,0.35)"
                                : "rgba(239,68,68,0.35)"
                          }`,
                        }}
                      />
                    }
                    label={s.online ? "LIVE" : s.checking ? "CHECK" : "OFFLINE"}
                    sx={{
                      position: "absolute",
                      top: 10,
                      left: 10,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      bgcolor: "rgba(15,23,42,0.72)",
                      color: "#FFFFFF",
                      backdropFilter: "blur(6px)",
                      "& .MuiChip-icon": { ml: 1, mr: -0.25 },
                    }}
                  />
                </Box>
                <Box sx={{ p: 1.75, display: "flex", alignItems: "center", gap: 1.25 }}>
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 1.25,
                      bgcolor: "rgba(95,141,184,0.12)",
                      color: "primary.dark",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <VideocamRoundedIcon sx={{ fontSize: 20 }} />
                  </Box>
                  <Typography sx={{ fontWeight: 800, color: "text.primary", lineHeight: 1.2, flex: 1, minWidth: 0 }}>
                    {displayCameraName(s.name, s.id)}
                  </Typography>
                </Box>
              </Paper>
            ))}
      </Box>

      <Dialog
        open={!!active}
        onClose={() => setActive(null)}
        maxWidth="lg"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: 3, overflow: "hidden", bgcolor: "#0B0F1A" },
          },
        }}
      >
        <DialogContent sx={{ p: 0, position: "relative", bgcolor: "#0B0F1A" }}>
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              p: 1.5,
              zIndex: 2,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1.5,
              background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#FFFFFF" }}>
              <Chip
                size="small"
                icon={
                  <Box
                    component="span"
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      display: "inline-block",
                      bgcolor: "#22C55E",
                      boxShadow: "0 0 0 3px rgba(34,197,94,0.35)",
                    }}
                  />
                }
                label="LIVE"
                sx={{ fontWeight: 900, bgcolor: "rgba(15,23,42,0.55)", color: "#FFFFFF", "& .MuiChip-icon": { ml: 1, mr: -0.25 } }}
              />
              <Typography sx={{ fontWeight: 800, color: "#FFFFFF" }}>{displayCameraName(active?.name, active?.id)}</Typography>
            </Box>
            <IconButton onClick={() => setActive(null)} sx={{ color: "#FFFFFF" }} aria-label="Close">
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Box sx={{ aspectRatio: "16 / 9", width: "100%" }}>
            {active ? <LiveStreamPlayer streamId={active.id} muted controls /> : null}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
