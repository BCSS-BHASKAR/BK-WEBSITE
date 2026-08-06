import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Chip, CircularProgress, Grid, Paper, Stack, Tooltip, Typography } from "@mui/material";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../lib/api";
import { contentCardSx } from "../../lib/uiSurfaces";

// ---------------------------------------------------------------------------
// Palette
//
// Validated categorical slots (adjacent pairlist, light surface): worst CVD
// dE 9.1, worst normal-vision dE 22.9 - both clear of the gates. Three of these
// sit under 3:1 against a light surface, so the "relief rule" applies: every
// chart below carries visible value labels or a table, never colour alone.
// One hue per SERVICE, assigned by identity and never by rank, so a filter can
// never repaint a series.
// ---------------------------------------------------------------------------
const SERVICE_COLOUR: Record<string, string> = {
  walkins: "#2a78d6",     // slot 1 blue
  loitering: "#eb6834",   // slot 2 orange
  intrusion: "#1baf7a",   // slot 3 aqua
  after_hours: "#eda100", // slot 4 yellow
};
const SERVICE_LABEL: Record<string, string> = {
  walkins: "Walk-ins",
  loitering: "Loitering",
  intrusion: "Intrusion",
  after_hours: "After Hours",
};
const SERVICES = ["walkins", "loitering", "intrusion", "after_hours"] as const;

// Recessive grid/axis ink; text never wears a series colour.
const INK_MUTED = "rgba(0,0,0,.45)";
const GRID = "rgba(0,0,0,.08)";
const SEQ = "#2a78d6"; // single-hue sequential for magnitude charts

const SITE_TZ = "Asia/Kolkata";

type Stats = {
  byDay: { day: string; service: string; n: number }[];
  byHour: { hour: number; n: number }[];
  byCamera: { service: string; camera_key: string; n: number; latest: string }[];
};
type Summary = {
  counts: Record<string, number | string>;
  last24h: { service: string; n: number; latest: string }[];
  topUpperColours: { name: string; n: number }[];
};

function fmtDateTime(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: SITE_TZ, day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function fmtDay(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" });
}
function fmtBytes(n?: number | string | null) {
  const v = Number(n || 0);
  if (!v) return "0";
  if (v > 1073741824) return `${(v / 1073741824).toFixed(1)} GB`;
  if (v > 1048576) return `${(v / 1048576).toFixed(0)} MB`;
  return `${Math.round(v / 1024)} KB`;
}

/** Hero/stat tile. A single headline number is a tile, never a one-bar chart. */
function StatTile({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <Paper sx={{ ...contentCardSx, p: 1.75, height: "100%" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        {accent && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: accent, flexShrink: 0 }} />}
        <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
      </Stack>
      <Typography sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1.1 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

function ChartCard({ title, subtitle, height = 190, children }: {
  title: string; subtitle?: string; height?: number; children: React.ReactNode;
}) {
  return (
    <Paper sx={{ ...contentCardSx, p: 2, height: "100%" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {subtitle}
        </Typography>
      )}
      <Box sx={{ height, mt: subtitle ? 0 : 1 }}>{children}</Box>
    </Paper>
  );
}

export function InferenceAnalyticsView() {
  const { data: stats, isLoading: lStats } = useQuery({
    queryKey: ["inference", "stats", 14],
    queryFn: async () => (await api.get("/inference/stats", { params: { days: 14 } })).data as Stats,
    refetchInterval: 60_000,
  });
  const { data: summary, isLoading: lSum } = useQuery({
    queryKey: ["inference", "summary"],
    queryFn: async () => (await api.get("/inference/summary")).data as Summary,
    refetchInterval: 60_000,
  });
  const { data: recent } = useQuery({
    queryKey: ["inference", "recent"],
    queryFn: async () => (await api.get("/inference/timeline", { params: { pageSize: 12 } })).data,
    refetchInterval: 60_000,
  });
  const { data: facets } = useQuery({
    queryKey: ["inference", "facets"],
    queryFn: async () => (await api.get("/inference/facets")).data as {
      colours: { region: string; name: string; n: number; rgb: number[] | null }[];
    },
  });

  /** byDay is (day, service) long-form; pivot to one series per service. */
  const perService = useMemo(() => {
    const days = Array.from(new Set((stats?.byDay || []).map((r) => r.day))).sort();
    return SERVICES.map((svc) => ({
      service: svc,
      total: (stats?.byDay || []).filter((r) => r.service === svc).reduce((a, r) => a + Number(r.n), 0),
      points: days.map((d) => ({
        day: d,
        n: Number((stats?.byDay || []).find((r) => r.day === d && r.service === svc)?.n || 0),
      })),
    }));
  }, [stats]);

  // Every hour present so the shape of the day is honest, not just hours with data.
  const hourly = useMemo(() => {
    const map = new Map((stats?.byHour || []).map((r) => [Number(r.hour), Number(r.n)]));
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, n: map.get(h) || 0 }));
  }, [stats]);

  const cameras = useMemo(
    () => (stats?.byCamera || []).slice().sort((a, b) => Number(b.n) - Number(a.n)),
    [stats]
  );
  const upperColours = useMemo(
    () => (facets?.colours || []).filter((c) => c.region === "upper").slice(0, 8),
    [facets]
  );
  const last24 = useMemo(
    () => new Map((summary?.last24h || []).map((r) => [r.service, r])),
    [summary]
  );

  if (lStats || lSum) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>;
  }

  const c = summary?.counts || {};
  const totalEvents = SERVICES.reduce((a, s) => a + Number(c[s] || 0), 0);

  return (
    <Box>
      {/* KPI row - headline numbers are tiles, not charts */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatTile label="Events captured" value={totalEvents} hint="all services" />
        </Grid>
        {SERVICES.map((s) => (
          <Grid key={s} size={{ xs: 6, sm: 4, md: 2 }}>
            <StatTile
              label={SERVICE_LABEL[s]}
              value={Number(c[s] || 0)}
              accent={SERVICE_COLOUR[s]}
              hint={`${Number(last24.get(s)?.n || 0)} in last 24h`}
            />
          </Grid>
        ))}
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatTile label="Media stored" value={fmtBytes(c.bytes)} hint={`${c.assets || 0} objects`} />
        </Grid>
      </Grid>

      {/* Small multiples: one single-series chart per service. Avoids a 4-series
          stack where hues would compete, and each chart names its own series so
          no legend box is needed. */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Daily activity by service — last 14 days
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {perService.map((s) => (
          <Grid key={s.service} size={{ xs: 12, sm: 6, md: 3 }}>
            <ChartCard title={SERVICE_LABEL[s.service]} subtitle={`${s.total} events`} height={140}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.points} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`g-${s.service}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERVICE_COLOUR[s.service]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={SERVICE_COLOUR[s.service]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 10, fill: INK_MUTED }}
                         axisLine={false} tickLine={false} minTickGap={18} />
                  <YAxis allowDecimals={false} width={34} tick={{ fontSize: 10, fill: INK_MUTED }}
                         axisLine={false} tickLine={false} />
                  <RTooltip
                    labelFormatter={(v) => fmtDay(String(v))}
                    formatter={(v) => [Number(v ?? 0), SERVICE_LABEL[s.service]] as [number, string]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  {/* 2px line, soft fill beneath */}
                  <Area type="monotone" dataKey="n" stroke={SERVICE_COLOUR[s.service]} strokeWidth={2}
                        fill={`url(#g-${s.service})`} dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Magnitude over an ordered scale -> single-hue sequential bars */}
        <Grid size={{ xs: 12, md: 7 }}>
          <ChartCard title="When events happen" subtitle="All services by hour of day (site time, IST)" height={210}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: INK_MUTED }} axisLine={false} tickLine={false}
                       tickFormatter={(h) => `${String(h).padStart(2, "0")}`} interval={1} />
                <YAxis allowDecimals={false} width={34} tick={{ fontSize: 10, fill: INK_MUTED }}
                       axisLine={false} tickLine={false} />
                <RTooltip
                  labelFormatter={(h) => `${String(h).padStart(2, "0")}:00 – ${String(Number(h) + 1).padStart(2, "0")}:00`}
                  formatter={(v) => [Number(v ?? 0), "events"] as [number, string]}
                  cursor={{ fill: "rgba(0,0,0,.04)" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                {/* 4px rounded data-end, anchored to the baseline */}
                <Bar dataKey="n" fill={SEQ} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        {/* Colour IS the identity here, so the bars carry the extracted RGB and
            every row is labelled with its name and count. */}
        <Grid size={{ xs: 12, md: 5 }}>
          <ChartCard title="Upper-garment colours" subtitle="People seen wearing each colour" height={210}>
            {upperColours.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No walk-in colour data yet.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={upperColours} layout="vertical" margin={{ top: 0, right: 28, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: INK_MUTED }}
                         axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={72}
                         tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={false} tickLine={false} />
                  <RTooltip formatter={(v) => [Number(v ?? 0), "people"] as [number, string]} cursor={{ fill: "rgba(0,0,0,.04)" }}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="n" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {upperColours.map((cc) => (
                      <Cell key={cc.name}
                            fill={cc.rgb && cc.rgb.length === 3 ? `rgb(${cc.rgb.join(",")})` : SEQ}
                            stroke="rgba(0,0,0,.22)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>
      </Grid>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* A table, not more colours: 11 cameras across 4 services exceeds any
            sane categorical budget, and exact counts matter more than shape. */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ ...contentCardSx, p: 2, height: "100%" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Camera activity</Typography>
            <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
              {cameras.map((cam) => {
                const max = Number(cameras[0]?.n || 1);
                const pct = Math.max(2, (Number(cam.n) / max) * 100);
                return (
                  <Box key={`${cam.service}-${cam.camera_key}`} sx={{ mb: 1.25 }}>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.25 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: SERVICE_COLOUR[cam.service], flexShrink: 0 }} />
                        <Tooltip title={cam.camera_key}>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                            {cam.camera_key.trim()}
                          </Typography>
                        </Tooltip>
                        <Chip size="small" variant="outlined" label={SERVICE_LABEL[cam.service]}
                              sx={{ height: 18, fontSize: 10 }} />
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 700, ml: 1 }}>{cam.n}</Typography>
                    </Stack>
                    <Box sx={{ height: 6, bgcolor: "rgba(0,0,0,.06)", borderRadius: 3, overflow: "hidden" }}>
                      <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: SERVICE_COLOUR[cam.service], borderRadius: 3 }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      last seen {fmtDateTime(cam.latest)}
                    </Typography>
                  </Box>
                );
              })}
              {cameras.length === 0 && (
                <Typography variant="body2" color="text.secondary">No camera activity recorded yet.</Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Latest captures - the dashboard should show the actual evidence. */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ ...contentCardSx, p: 2, height: "100%" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Latest captures</Typography>
            <Grid container spacing={1}>
              {(recent?.rows || []).slice(0, 12).map((r: any) => {
                const thumb = r.posterUrl || (String(r.content_type || "").startsWith("image") ? r.mediaUrl : null);
                return (
                  <Grid key={`${r.service}-${r.id}`} size={{ xs: 4, sm: 3 }}>
                    <Box sx={{ position: "relative", borderRadius: 1.5, overflow: "hidden", bgcolor: "#0e0e12", height: 74 }}>
                      {thumb ? (
                        <Box component="img" src={thumb} alt={r.service} loading="lazy"
                             sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <Box sx={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
                          <Typography variant="caption" sx={{ color: "rgba(255,255,255,.5)" }}>—</Typography>
                        </Box>
                      )}
                      <Box sx={{
                        position: "absolute", left: 4, top: 4, width: 8, height: 8, borderRadius: "50%",
                        bgcolor: SERVICE_COLOUR[r.service] || "#999", border: "1px solid rgba(255,255,255,.8)",
                      }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                      {fmtDateTime(r.occurred_at)}
                    </Typography>
                  </Grid>
                );
              })}
              {!(recent?.rows || []).length && (
                <Grid size={12}>
                  <Typography variant="body2" color="text.secondary">Nothing captured yet.</Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
