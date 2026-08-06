import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  Grid,
  IconButton,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import DirectionsWalkOutlinedIcon from "@mui/icons-material/DirectionsWalkOutlined";
import NightsStayOutlinedIcon from "@mui/icons-material/NightsStayOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import ViewTimelineOutlinedIcon from "@mui/icons-material/ViewTimelineOutlined";
import { api } from "../lib/api";
import { contentCardSx, pageLayoutSx } from "../lib/uiSurfaces";

// ---------------------------------------------------------------------------
// Types mirroring server/src/routes/inference.js
// ---------------------------------------------------------------------------

type Colour = { region: "upper" | "lower"; name: string; percentage: number | null; rgb: number[] | null };

type BaseRow = {
  id: number;
  camera_key: string | null;
  mediaUrl?: string;
  content_type?: string | null;
  size_bytes?: number | null;
};

// Each tab returns a different row shape; the grid renders the union, reading
// whichever timestamp/field the active service provides.
type AnyRow = BaseRow & {
  service?: string;
  captured_at?: string;
  started_at?: string;
  occurred_at?: string;
  detected_at?: string;
  tag?: string | null;
  global_id?: number | null;
  dwell_seconds?: number | null;
  track_id?: number;
  upper_garment?: string | null;
  lower_garment?: string | null;
  mode?: string | null;
  colours?: Colour[];
  faceUrl?: string;
};

type ListResponse<T> = { total: number; page: number; pageSize: number; rows: T[] };

const SERVICES = [
  { key: "timeline", label: "Timeline", icon: <ViewTimelineOutlinedIcon fontSize="small" /> },
  { key: "walkins", label: "Walk-ins", icon: <DirectionsWalkOutlinedIcon fontSize="small" /> },
  { key: "loitering", label: "Loitering", icon: <TimerOutlinedIcon fontSize="small" /> },
  { key: "intrusion", label: "Intrusion", icon: <ReportGmailerrorredOutlinedIcon fontSize="small" /> },
  { key: "after-hours", label: "After Hours", icon: <NightsStayOutlinedIcon fontSize="small" /> },
] as const;

const PAGE_SIZE = 48;
const SITE_TZ = "Asia/Kolkata";

/** All capture times are stored as absolute instants; render them in site time. */
function fmt(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("en-GB", {
    timeZone: SITE_TZ,
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

function fmtDwell(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtBytes(n: number | null | undefined): string {
  if (!n) return "";
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/** Colour chip painted with the extracted RGB, labelled with name + share. */
function ColourChip({ colour }: { colour: Colour }) {
  const rgb = colour.rgb && colour.rgb.length === 3 ? colour.rgb : null;
  const bg = rgb ? `rgb(${rgb.join(",")})` : "#999";
  // Pick readable text against the swatch.
  const luma = rgb ? (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 : 0.5;
  return (
    <Chip
      size="small"
      label={`${colour.name}${colour.percentage != null ? ` ${colour.percentage}%` : ""}`}
      sx={{
        bgcolor: bg,
        color: luma > 0.6 ? "rgba(0,0,0,0.82)" : "#fff",
        border: "1px solid rgba(0,0,0,0.18)",
        fontWeight: 600,
        fontSize: 11,
        height: 22,
      }}
    />
  );
}

export function InferenceViewerPage() {
  const [tab, setTab] = useState<string>("timeline");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [camera, setCamera] = useState("");
  const [colour, setColour] = useState("");
  const [garment, setGarment] = useState("");
  const [lightbox, setLightbox] = useState<{ url: string; video: boolean; caption: string } | null>(null);

  const reset = () => setPage(1);

  const { data: summary } = useQuery({
    queryKey: ["inference", "summary"],
    queryFn: async () => (await api.get("/inference/summary")).data,
  });
  const { data: cameras } = useQuery({
    queryKey: ["inference", "cameras"],
    queryFn: async () => (await api.get("/inference/cameras")).data as { cameras: { service: string; camera_key: string }[] },
  });
  const { data: facets } = useQuery({
    queryKey: ["inference", "facets"],
    queryFn: async () => (await api.get("/inference/facets")).data as {
      colours: { region: string; name: string; n: number; rgb: number[] | null }[];
      garments: string[];
    },
  });

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (from) p.from = from;
    if (to) p.to = to;
    if (camera) p.camera = camera;
    if (tab === "walkins") {
      if (colour) { p.colour = colour; p.region = "upper"; }
      if (garment) p.garment = garment;
    }
    return p;
  }, [page, from, to, camera, colour, garment, tab]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inference", tab, params],
    queryFn: async () => (await api.get(`/inference/${tab}`, { params })).data as ListResponse<AnyRow>,
  });

  const cameraOptions = useMemo(() => {
    const all = cameras?.cameras || [];
    const svc = tab === "timeline" ? null : tab === "after-hours" ? "after_hours" : tab;
    return all.filter((c) => !svc || c.service === svc);
  }, [cameras, tab]);

  const upperColours = useMemo(
    () => (facets?.colours || []).filter((c) => c.region === "upper"),
    [facets]
  );

  const rows = data?.rows || [];
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const openMedia = (url: string | undefined, contentType: string | null | undefined, caption: string) => {
    if (!url) return;
    setLightbox({ url, video: String(contentType || "").startsWith("video"), caption });
  };

  return (
    <Box sx={pageLayoutSx}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
        Inference Viewer
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Evidence captured by the on-prem CV services, mirrored from S3. Media is served
        through short-lived signed links — the bucket is never public.
      </Typography>

      {/* Summary tiles */}
      {summary?.counts && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {[
            { label: "Walk-ins", value: summary.counts.walkins },
            { label: "Loitering clips", value: summary.counts.loitering },
            { label: "Intrusions", value: summary.counts.intrusion },
            { label: "After-hours", value: summary.counts.after_hours },
            { label: "Media objects", value: summary.counts.assets },
            { label: "Stored", value: fmtBytes(Number(summary.counts.bytes)) },
          ].map((t) => (
            <Grid key={t.label} size={{ xs: 6, sm: 4, md: 2 }}>
              <Paper sx={{ ...contentCardSx, p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{t.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{t.value ?? "—"}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      <Paper sx={{ ...contentCardSx, mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_e, v) => { setTab(v); reset(); setCamera(""); }}
          variant="scrollable"
          scrollButtons="auto"
        >
          {SERVICES.map((s) => (
            <Tab key={s.key} value={s.key} label={s.label} icon={s.icon} iconPosition="start" sx={{ minHeight: 48 }} />
          ))}
        </Tabs>

        {/* Filters */}
        <Stack direction="row" spacing={1.5} sx={{ p: 2, flexWrap: "wrap", gap: 1.5 }}>
          <TextField
            label="From" type="date" size="small" value={from}
            onChange={(e) => { setFrom(e.target.value); reset(); }}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 150 }}
          />
          <TextField
            label="To" type="date" size="small" value={to}
            onChange={(e) => { setTo(e.target.value); reset(); }}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 150 }}
          />
          <TextField
            select label="Camera" size="small" value={camera}
            onChange={(e) => { setCamera(e.target.value); reset(); }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All cameras</MenuItem>
            {cameraOptions.map((c) => (
              // Camera ids can carry a trailing space; show it explicitly.
              <MenuItem key={`${c.service}:${c.camera_key}`} value={c.camera_key}>
                {c.camera_key.trim()}{c.camera_key !== c.camera_key.trim() ? " ␠" : ""}
              </MenuItem>
            ))}
          </TextField>

          {tab === "walkins" && (
            <>
              <TextField
                select label="Upper colour" size="small" value={colour}
                onChange={(e) => { setColour(e.target.value); reset(); }}
                sx={{ minWidth: 190 }}
              >
                <MenuItem value="">Any colour</MenuItem>
                {upperColours.map((c) => (
                  <MenuItem key={c.name} value={c.name}>
                    <Box component="span" sx={{
                      width: 12, height: 12, borderRadius: "3px", mr: 1, display: "inline-block",
                      border: "1px solid rgba(0,0,0,.2)",
                      bgcolor: c.rgb ? `rgb(${c.rgb.join(",")})` : "#999",
                    }} />
                    {c.name} ({c.n})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select label="Garment" size="small" value={garment}
                onChange={(e) => { setGarment(e.target.value); reset(); }}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">Any garment</MenuItem>
                {(facets?.garments || []).map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </TextField>
            </>
          )}

          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
            {data ? `${data.total} result${data.total === 1 ? "" : "s"}` : ""}
          </Typography>
        </Stack>
      </Paper>

      {isError && <Alert severity="error" sx={{ mb: 2 }}>{(error as Error)?.message || "Failed to load"}</Alert>}
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
      )}
      {!isLoading && rows.length === 0 && (
        <Paper sx={{ ...contentCardSx, p: 4, textAlign: "center" }}>
          <PhotoCameraOutlinedIcon sx={{ fontSize: 40, opacity: 0.35 }} />
          <Typography sx={{ mt: 1 }} color="text.secondary">
            Nothing captured for these filters yet.
          </Typography>
        </Paper>
      )}

      {/* Results */}
      <Grid container spacing={1.5}>
        {rows.map((r: AnyRow) => {
          const ts = r.detected_at || r.started_at || r.occurred_at || r.captured_at;
          const isVideo = String(r.content_type || "").startsWith("video");
          const caption = `${r.camera_key?.trim() || "unknown"} · ${fmt(ts)}`;
          return (
            <Grid key={`${tab}-${r.service || ""}-${r.id}`} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Paper sx={{ ...contentCardSx, p: 0, overflow: "hidden", height: "100%" }}>
                <Box
                  onClick={() => openMedia(r.mediaUrl, r.content_type, caption)}
                  sx={{
                    position: "relative", cursor: r.mediaUrl ? "zoom-in" : "default",
                    bgcolor: "#0e0e12", height: 190,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {r.mediaUrl && !isVideo && (
                    <Box component="img" src={r.mediaUrl} alt={caption} loading="lazy"
                         sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  )}
                  {r.mediaUrl && isVideo && (
                    <Stack spacing={0.5} sx={{ alignItems: "center", color: "rgba(255,255,255,.75)" }}>
                      <TimerOutlinedIcon sx={{ fontSize: 34 }} />
                      <Typography variant="caption">
                        {fmtDwell(r.dwell_seconds)} clip · {fmtBytes(r.size_bytes)}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>click to play</Typography>
                    </Stack>
                  )}
                  {!r.mediaUrl && (
                    <Typography variant="caption" sx={{ color: "rgba(255,255,255,.5)" }}>no media</Typography>
                  )}
                  {tab === "timeline" && (
                    <Chip size="small" label={r.service}
                          sx={{ position: "absolute", top: 8, left: 8, bgcolor: "rgba(0,0,0,.65)", color: "#fff" }} />
                  )}
                </Box>

                <Box sx={{ p: 1.25 }}>
                  <Tooltip title={r.camera_key || ""}>
                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                      {r.camera_key?.trim() || "unknown camera"}
                    </Typography>
                  </Tooltip>
                  <Typography variant="caption" color="text.secondary">{fmt(ts)}</Typography>

                  {tab === "walkins" && (
                    <>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
                        {r.upper_garment && <Chip size="small" variant="outlined" label={`Upper: ${r.upper_garment}`} sx={{ height: 22, fontSize: 11 }} />}
                        {r.lower_garment && <Chip size="small" variant="outlined" label={`Lower: ${r.lower_garment}`} sx={{ height: 22, fontSize: 11 }} />}
                        {r.mode === "upload" && <Chip size="small" color="info" label="upload" sx={{ height: 22, fontSize: 11 }} />}
                      </Stack>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
                        {(r.colours || []).slice(0, 4).map((c: Colour, i: number) => (
                          <ColourChip key={`${c.region}-${c.name}-${i}`} colour={c} />
                        ))}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        track #{r.track_id}
                      </Typography>
                    </>
                  )}
                  {tab === "loitering" && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
                      <Chip size="small" color="warning" label={`dwell ${fmtDwell(r.dwell_seconds)}`} sx={{ height: 22, fontSize: 11 }} />
                      {r.global_id && <Chip size="small" variant="outlined" label={`GID ${r.global_id}`} sx={{ height: 22, fontSize: 11 }} />}
                    </Stack>
                  )}
                  {tab === "after-hours" && r.tag && (
                    <Chip size="small" variant="outlined" label={r.tag} sx={{ mt: 0.75, height: 22, fontSize: 11 }} />
                  )}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {pageCount > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
          <Pagination count={pageCount} page={page} onChange={(_e, v) => setPage(v)} color="primary" />
        </Box>
      )}

      {/* Lightbox / player */}
      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} maxWidth="lg" fullWidth>
        <DialogContent sx={{ p: 0, bgcolor: "#000", position: "relative" }}>
          <IconButton
            onClick={() => setLightbox(null)}
            sx={{ position: "absolute", top: 8, right: 8, zIndex: 2, color: "#fff", bgcolor: "rgba(0,0,0,.5)" }}
          >
            <CloseIcon />
          </IconButton>
          {lightbox?.video ? (
            // Presigned URL supports HTTP range requests, so seeking works.
            <Box component="video" src={lightbox.url} controls autoPlay preload="metadata"
                 sx={{ width: "100%", maxHeight: "80vh", display: "block" }} />
          ) : (
            <Box component="img" src={lightbox?.url} alt={lightbox?.caption || ""}
                 sx={{ width: "100%", maxHeight: "80vh", objectFit: "contain", display: "block" }} />
          )}
          <Typography variant="caption" sx={{ color: "#fff", p: 1.5, display: "block" }}>
            {lightbox?.caption}
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
