import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Box, Chip, CircularProgress, Grid, Paper, Stack, Tooltip, Typography } from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import { api } from "../../lib/api";
import { contentCardSx } from "../../lib/uiSurfaces";
import { MODULE_BY_KEY, type InferenceModuleKey } from "../../lib/inferenceModules";
import { useAutoRefreshMs } from "../../lib/useAppSettings";
import { usePermissions } from "../../lib/permissions";
import { MonitoringMediaViewer } from "../monitoring/MonitoringMediaViewer";
import type { MonitoringRow } from "../monitoring/MonitoringEventsTable";

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
  walkins: "#2a78d6",      // slot 1 blue
  loitering: "#eb6834",    // slot 2 orange
  intrusion: "#1baf7a",    // slot 3 aqua
  after_hours: "#eda100",  // slot 4 yellow
  chef_absence: "#c2408c", // slot 6 magenta
};
const SERVICE_LABEL: Record<string, string> = {
  walkins: "Walk-ins",
  loitering: "Loitering",
  intrusion: "Intrusion",
  after_hours: "After Hours",
  chef_absence: "Chef Absence",
};
// The modules the dashboard reports on. kitchen_unattended is deliberately
// absent: chef_absence is the module that actually records unmanned-station
// incidents at this site, so carrying both showed the same concern twice - once
// under a name that never had any events behind it.
const SERVICES = [
  "walkins", "loitering", "intrusion", "after_hours", "chef_absence",
] as const;

// Everything that warrants attention, i.e. every module except walk-ins.
// Walk-ins are footfall, not something to act on.
const ALERT_SERVICES = ["loitering", "intrusion", "after_hours", "chef_absence"] as const;

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
// fmtBytes was removed with the "Media stored" tile - it had no other caller.

/** Hero/stat tile. A single headline number is a tile, never a one-bar chart. */
function StatTile({ label, value, hint, accent, onClick }: {
  label: string; value: string | number; hint?: string; accent?: string; onClick?: () => void;
}) {
  return (
    <Paper
      onClick={onClick}
      sx={{
        ...contentCardSx, p: 1.75, height: "100%",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 160ms ease",
        ...(onClick ? { "&:hover": { boxShadow: "0 2px 10px rgba(15,23,42,.10)" } } : {}),
      }}
    >
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

/**
 * Stands in for a chart that has nothing to plot.
 *
 * An axis drawn over an all-zero series reads as a measured flat line, which is
 * a different claim from "this module recorded nothing in this period". The
 * modules that are quiet still get their card, so the set of five stays whole.
 */
function NoData({ label = "No events recorded in this period" }: { label?: string }) {
  return (
    <Box
      sx={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 0.75,
        border: "1px dashed rgba(15,23,42,.14)", borderRadius: 1.5,
        px: 1.5, textAlign: "center",
      }}
    >
      <InboxOutlinedIcon sx={{ fontSize: 22, color: "text.disabled" }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

export function InferenceAnalyticsView({ from, to }: { from?: string; to?: string } = {}) {
  const navigate = useNavigate();
  const refetchInterval = useAutoRefreshMs();
  const { can } = usePermissions();
  // Latest captures open in the same viewer the Monitoring pages use.
  const [captureIndex, setCaptureIndex] = useState<number | null>(null);
  const { data: stats, isLoading: lStats } = useQuery({
    queryKey: ["inference", "stats", from, to],
    queryFn: async () =>
      (await api.get("/inference/stats", {
        params: { days: 14, ...(from && to ? { from, to } : {}) },
      })).data as Stats,
    refetchInterval,
  });
  const { data: summary, isLoading: lSum } = useQuery({
    queryKey: ["inference", "summary", from, to],
    queryFn: async () =>
      (await api.get("/inference/summary", { params: from && to ? { from, to } : {} })).data as Summary,
    refetchInterval,
  });
  const { data: recent } = useQuery({
    queryKey: ["inference", "recent"],
    queryFn: async () => (await api.get("/inference/timeline", { params: { pageSize: 12 } })).data,
    refetchInterval,
  });
  // Camera fleet state for the Cameras Online tile. This is the same endpoint
  // the Cameras Online page reads, so the two can never report different
  // counts - the spec asks for that consistency explicitly.
  // /api/streams is guarded by the cameras_online grant, so a user without it
  // gets a 403. Ask only when the grant is held: otherwise the query retries a
  // request that can never succeed, and the tile would print a confident "0 / 0"
  // for a fleet it was simply not allowed to see.
  const canSeeCameras = can("cameras_online");
  const { data: streams, isError: streamsError } = useQuery({
    queryKey: ["streams", "fleet"],
    queryFn: async () => (await api.get("/streams")).data as {
      streams: { id: string; name: string; online: boolean }[];
    },
    enabled: canSeeCameras,
    refetchInterval,
  });
  const { data: facets } = useQuery({
    queryKey: ["inference", "facets"],
    queryFn: async () => (await api.get("/inference/facets")).data as {
      colours: { region: string; name: string; n: number; rgb: number[] | null }[];
    },
  });

  /**
   * byDay only contains days that HAVE data. Plotting those directly drew a
   * two-point diagonal across a 14-day window - a trend that is not there.
   * Build the full day axis for the range and zero-fill so the shape is real.
   */
  const perService = useMemo(() => {
    const present = (stats?.byDay || []).map((r) => String(r.day).slice(0, 10)).sort();
    let start: Date;
    let end: Date;
    if (from && to) {
      start = new Date(`${from}T00:00:00Z`);
      end = new Date(`${to}T00:00:00Z`);
    } else if (present.length) {
      start = new Date(`${present[0]}T00:00:00Z`);
      end = new Date(`${present[present.length - 1]}T00:00:00Z`);
    } else {
      end = new Date();
      start = new Date(end.getTime() - 6 * 86400000);
    }
    const days: string[] = [];
    for (let d = new Date(start); d <= end && days.length < 92; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    const lookup = new Map(
      (stats?.byDay || []).map((r) => [`${String(r.day).slice(0, 10)}|${r.service}`, Number(r.n)])
    );
    return SERVICES.map((svc) => ({
      service: svc,
      total: (stats?.byDay || []).filter((r) => r.service === svc).reduce((a, r) => a + Number(r.n), 0),
      points: days.map((d) => ({
        day: d,
        label: new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
          timeZone: "UTC", day: "2-digit", month: "short",
        }),
        n: lookup.get(`${d}|${svc}`) || 0,
      })),
    }));
  }, [stats, from, to]);

  // Every hour present so the shape of the day is honest, not just hours with data.
  const hourly = useMemo(() => {
    const map = new Map((stats?.byHour || []).map((r) => [Number(r.hour), Number(r.n)]));
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, n: map.get(h) || 0 }));
  }, [stats]);
  const hourlyTotal = useMemo(() => hourly.reduce((a, r) => a + r.n, 0), [hourly]);

  // Headings name the period actually queried rather than a fixed "last 14
  // days", which stayed put while the masthead range control moved underneath
  // it and made every chart look like it covered a fortnight.
  const rangeLabel = useMemo(() => {
    if (!from || !to) return "last 14 days";
    const fmt = (iso: string) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
        timeZone: "UTC", day: "2-digit", month: "short",
      });
    return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  }, [from, to]);

  // Rows for services the dashboard no longer reports are dropped rather than
  // rendered with a blank chip and an uncoloured bar.
  const cameras = useMemo(
    () => (stats?.byCamera || [])
      .filter((r) => SERVICE_LABEL[r.service])
      .sort((a, b) => Number(b.n) - Number(a.n)),
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

  // Every module except walk-ins. Walk-ins are footfall, not something to act
  // on, so folding them in would inflate the alert headline.
  const activeAlerts = ALERT_SERVICES.reduce((a, s) => a + Number(c[s] || 0), 0);

  const online = (streams?.streams || []).filter((s) => s.online).length;
  const totalCams = (streams?.streams || []).length;
  // A dash for "not permitted", "failed" and "none reported" alike - never a
  // zero the page did not actually establish.
  const camerasLabel = !canSeeCameras || streamsError || !totalCams ? "—" : `${online} / ${totalCams}`;

  return (
    <Box>
      {/* KPI row - three operational headlines, not one tile per module.
          "Events captured" and "Media stored" are gone: the first restated the
          sum of the others, and the second reported S3 storage, which is not an
          operational figure. The per-module detail lives in the charts below. */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4, md: 4 }}>
          <StatTile
            label="Walk-ins"
            value={Number(c.walkins || 0)}
            accent={MODULE_BY_KEY.walkins.colour}
            hint={`${Number(last24.get("walkins")?.n || 0)} in last 24h`}
            onClick={() => navigate(MODULE_BY_KEY.walkins.route)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 4 }}>
          <StatTile
            label="Active Alerts"
            value={activeAlerts}
            accent={MODULE_BY_KEY.intrusion.colour}
            hint="across alert modules"
            onClick={() => navigate("/crowds-report")}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 4 }}>
          <StatTile
            label="Cameras Online"
            value={camerasLabel}
            accent={MODULE_BY_KEY.loitering.colour}
            hint="reporting a signal now"
            onClick={() => navigate("/live-view")}
          />
        </Grid>
      </Grid>

      {/* Small multiples: one single-series chart per service. Avoids a 4-series
          stack where hues would compete, and each chart names its own series so
          no legend box is needed. */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {perService.map((s) => (
          <Grid key={s.service} size={{ xs: 12, sm: 6, md: 4 }}>
            <ChartCard
              title={SERVICE_LABEL[s.service]}
              subtitle={s.total === 1 ? "1 event" : `${s.total} events`}
              height={140}
            >
              {s.total === 0 ? (
                <NoData />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {/* Daily counts are discrete per-day events, so bars are the
                      honest form. An interpolated area implied continuous change
                      between two sampled days. */}
                  <BarChart data={s.points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: INK_MUTED }}
                           axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
                    <YAxis allowDecimals={false} width={30} tick={{ fontSize: 10, fill: INK_MUTED }}
                           axisLine={false} tickLine={false} tickMargin={4} />
                    <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                              formatter={(v) => [Number(v ?? 0), SERVICE_LABEL[s.service]] as [number, string]}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="n" fill={SERVICE_COLOUR[s.service]} radius={[3, 3, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Magnitude over an ordered scale -> single-hue sequential bars */}
        <Grid size={{ xs: 12, md: 7 }}>
          <ChartCard title="When events happen" subtitle="All services by hour of day (site time, IST)" height={210}>
            {hourlyTotal === 0 ? (
              <NoData label="No events recorded across any module in this period" />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: INK_MUTED }} axisLine={false} tickLine={false}
                       tickFormatter={(h) => `${String(h).padStart(2, "0")}`} interval={1} />
                <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK_MUTED }}
                       axisLine={false} tickLine={false} tickMargin={4} />
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
            )}
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
              {(recent?.rows || []).slice(0, 12).map((r: any, i: number) => {
                const thumb = r.posterUrl || (String(r.content_type || "").startsWith("image") ? r.mediaUrl : null);
                return (
                  <Grid key={`${r.service}-${r.id}`} size={{ xs: 4, sm: 3 }}>
                    <Box
                      onClick={() => setCaptureIndex(i)}
                      sx={{
                        position: "relative", borderRadius: 1.5, overflow: "hidden",
                        bgcolor: "#0e0e12", height: 74, cursor: "pointer",
                        transition: "transform 140ms ease, box-shadow 140ms ease",
                        "&:hover": { transform: "scale(1.03)", boxShadow: "0 4px 12px rgba(0,0,0,.28)" },
                      }}
                    >
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

      {/* Reuses the Monitoring viewer, so a capture opened from the dashboard
          behaves identically - video plays, Previous/Next steps through the
          latest set, and the feedback controls are the same. */}
      {captureIndex !== null && (recent?.rows || [])[captureIndex] && (
        <MonitoringMediaViewer
          open
          module={MODULE_BY_KEY[((recent!.rows[captureIndex].service) as InferenceModuleKey)] ?? MODULE_BY_KEY.intrusion}
          rows={(recent?.rows || []).slice(0, 12).map((r: any) => ({ ...r, detected_at: r.occurred_at })) as MonitoringRow[]}
          index={captureIndex}
          onIndexChange={setCaptureIndex}
          onClose={() => setCaptureIndex(null)}
          verdictFor={() => null}
          onFeedback={() => {}}
        />
      )}
    </Box>
  );
}
