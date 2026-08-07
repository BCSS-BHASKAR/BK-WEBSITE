import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Chip, Grid, LinearProgress, MenuItem, Paper, Skeleton, Snackbar,
  Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography, Pagination, IconButton,
} from "@mui/material";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PlayCircleFilledRoundedIcon from "@mui/icons-material/PlayCircleFilledRounded";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { api, apiBase } from "../lib/api";
import { pageLayoutSx, contentCardSx } from "../lib/uiSurfaces";
import { MODULE_BY_KEY } from "../lib/inferenceModules";
import { MonitoringMediaViewer } from "../components/monitoring/MonitoringMediaViewer";
import type { FeedbackVerdict, MonitoringRow } from "../components/monitoring/MonitoringEventsTable";
import { tableCellSx, tableHeadSx, thumbSx, filterFieldSx } from "../components/monitoring/monitoringTokens";
import { getAccessToken } from "../auth/tokenStore";
import { useAutoRefreshMs } from "../lib/useAppSettings";
import { RequirePage } from "../lib/permissions";

const MODULE = MODULE_BY_KEY.chef_absence;
const PAGE_SIZE = 20;
const SITE_TZ = "Asia/Kolkata";

// Recessive grid/axis ink; text never wears a series colour.
const INK = "rgba(0,0,0,.45)";
const GRID = "rgba(0,0,0,.08)";

// Categorical hues for "who was in the kitchen". Assigned by identity and in
// fixed order, so a day with no housekeeping never repaints the other two.
// Validated as a 3-slot categorical palette: all checks pass, worst adjacent
// pair 33.6 normal / 24.7 protan.
const PRESENCE = [
  { key: "chef", label: "Chef", colour: "#2a78d6" },
  { key: "nonChef", label: "Non-chef", colour: "#eb6834" },
  { key: "housekeeping", label: "Housekeeping", colour: "#4a3aa7" },
] as const;

// Compliance is a state, not a category, so it uses the reserved status pair
// rather than borrowing a categorical hue.
const STATUS_GOOD = "#1baf7a";
const STATUS_BAD = "#d64545";

type ChefKpis = {
  incidents: number;
  cameras: number;
  latestIncident: string | null;
  intrusions: number;
  latestIntrusion: string | null;
  peopleSeen: number;
  chef: number;
  nonChef: number;
  housekeeping: number;
  capCompliancePct: number | null;
  chefWithCap: number;
  chefWithoutCap: number;
  peakHour: number | null;
  peakHourCount: number;
  clip: {
    minSeconds: number | null; maxSeconds: number | null;
    avgSeconds: number | null; over60s: number; isAbsenceDuration: boolean;
  };
};

type ChefAnalytics = {
  byDay: { day: string; n: number }[];
  byHour: { hour: number; n: number }[];
  byCamera: { cameraKey: string; n: number; latest: string }[];
  presenceByDay: { day: string; chef: number; nonChef: number; housekeeping: number }[];
  capByStatus: { statusChef: string; total: number; withCap: number }[];
  intrusionsByDay: { day: string; n: number }[];
  intrusionsByHour: { hour: number; n: number }[];
};

type ChefRow = MonitoringRow & {
  clipSeconds?: number | null;
  frame_count?: number | null;
  dailySeq?: number | null;
  statusChef?: string | null;
  capGarment?: string | null;
  hasCap?: boolean;
  upperGarment?: string | null;
  lowerGarment?: string | null;
};

function fmtWhen(ts: string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: SITE_TZ, day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
/**
 * Compact timestamp for a KPI tile.
 *
 * fmtWhen's "07 Aug, 04:31" wraps in a tile sized for a short number, which
 * makes that one card taller than the five beside it. Dropping the separator
 * keeps the row on a single baseline.
 */
function fmtWhenShort(ts: string | null | undefined) {
  return fmtWhen(ts).replace(", ", " ");
}
function fmtHour(h: number | null) {
  return h == null ? "—" : `${String(h).padStart(2, "0")}:00`;
}
function fmtDay(day: string) {
  return new Date(day).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" });
}

function Panel({ title, subtitle, height = 200, children }: {
  title: string; subtitle?: string; height?: number; children: React.ReactNode;
}) {
  return (
    <Paper sx={{ ...contentCardSx, height: "100%" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {subtitle}
        </Typography>
      )}
      <Box sx={{ height, mt: 1 }}>{children}</Box>
    </Paper>
  );
}

/** One KPI tile. `accent` overrides the module hue for status-bearing figures. */
function Kpi({ label, value, hint, accent, loading }: {
  label: string; value: string | number; hint?: string; accent?: string; loading?: boolean;
}) {
  return (
    <Paper sx={{ ...contentCardSx, p: 1.75, height: "100%" }}>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 0.5 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: accent || MODULE.colour, flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
      </Stack>
      {loading
        ? <Skeleton width="60%" height={32} />
        : <Typography sx={{ fontWeight: 800, fontSize: 24, lineHeight: 1.15 }}>{value}</Typography>}
      {hint && !loading && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

/**
 * Chef Absence.
 *
 * This module reports on the kitchen as a operation - is the station covered,
 * who is in it, are they in uniform - rather than presenting another gallery of
 * clips. The three evidence streams (absence clips, kitchen entries, people
 * seen) sit under the KPIs as tabs, so the numbers lead and the footage backs
 * them up.
 *
 * WHAT IS DELIBERATELY MISSING: absence duration. The detector is documented as
 * recording only after 60 s of an empty kitchen, but 150 of the 151 clips it
 * has produced are shorter than that, because the writer tags every clip 15 fps
 * while storing only the frames its detection loop emitted. Clip length is
 * therefore shown as "clip length" in the evidence table and nowhere else - no
 * KPI, no chart, and no total is built on it.
 */
export function ChefAbsencePage() {
  const qc = useQueryClient();
  const refetchInterval = useAutoRefreshMs();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [camera, setCamera] = useState("");
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(1);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [capFilter, setCapFilter] = useState<"" | "1">("");
  const [statusFilter, setStatusFilter] = useState("");

  const scope = useMemo(() => {
    const p: Record<string, string> = {};
    if (from) p.from = from;
    if (to) p.to = to;
    if (camera) p.camera = camera;
    return p;
  }, [from, to, camera]);

  const kpisQ = useQuery({
    queryKey: ["chef", "kpis", scope],
    queryFn: async () => (await api.get("/inference/chef-absence/kpis", { params: scope })).data as ChefKpis,
    refetchInterval,
  });
  const analyticsQ = useQuery({
    queryKey: ["chef", "analytics", scope],
    queryFn: async () => (await api.get("/inference/chef-absence/analytics", { params: scope })).data as ChefAnalytics,
  });
  const camerasQ = useQuery({
    queryKey: ["monitoring", "cameras"],
    queryFn: async () => (await api.get("/inference/cameras")).data as {
      cameras: { service: string; camera_key: string }[];
    },
  });

  // Which stream the evidence tab is showing. Only one is fetched at a time.
  const streams = ["", "/intrusions", "/detections"] as const;
  const rowParams = useMemo(() => {
    const p: Record<string, string | number> = { ...scope, page, pageSize: PAGE_SIZE };
    if (tab === 2) {
      if (statusFilter) p.status = statusFilter;
      if (capFilter) p.noCap = capFilter;
    }
    // Intrusion snapshots carry no camera id, so a camera filter would silently
    // empty the tab rather than narrowing it.
    if (tab === 1) delete p.camera;
    return p;
  }, [scope, page, tab, statusFilter, capFilter]);

  const rowsQ = useQuery({
    queryKey: ["chef", "rows", tab, rowParams],
    queryFn: async () =>
      (await api.get(`/inference/chef-absence${streams[tab]}`, { params: rowParams })).data as {
        total: number; rows: ChefRow[];
      },
    refetchInterval,
  });

  const feedbackModule = tab === 0 ? "chef_absence" : tab === 1 ? "chef_intrusion" : "chef_detection";

  // The viewer titles each item from the module's eventNoun, but this page
  // shows three different kinds of record. Without this, a person crop opens
  // captioned "Absence incident".
  const viewerModule = useMemo(
    () => ({
      ...MODULE,
      eventNoun: tab === 0 ? "Absence incident" : tab === 1 ? "Kitchen entry" : "Person sighting",
    }),
    [tab]
  );
  const feedbackQ = useQuery({
    queryKey: ["chef", "feedback", feedbackModule],
    queryFn: async () => (await api.get("/inference/feedback", { params: { module: feedbackModule } })).data as {
      rows: { detection_id: number; feedback_type: FeedbackVerdict }[];
    },
  });
  const verdicts = useMemo(() => {
    const m = new Map<number, FeedbackVerdict>();
    for (const r of feedbackQ.data?.rows || []) m.set(Number(r.detection_id), r.feedback_type);
    return m;
  }, [feedbackQ.data]);

  const feedbackMutation = useMutation({
    mutationFn: async (vars: { row: ChefRow; verdict: "verified" | "false_positive" }) =>
      (await api.post("/inference/feedback", {
        module: feedbackModule,
        detectionId: vars.row.id,
        cameraId: vars.row.camera_key,
        feedbackType: vars.verdict,
      })).data,
    onSuccess: (_d, vars) => {
      setToast(
        vars.verdict === "false_positive"
          ? "Marked as false positive — hidden from counts, media retained for retraining."
          : "Marked as verified."
      );
      qc.invalidateQueries({ queryKey: ["chef"] });
    },
    onError: () => setToast("Could not save feedback."),
  });

  const onExport = useCallback(() => {
    const qs = new URLSearchParams(scope).toString();
    fetch(`${apiBase}/inference/export/chef_absence.csv${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
    })
      .then((r) => r.blob())
      .then((b) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chef-absence-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setToast("Export failed."));
  }, [scope]);

  const k = kpisQ.data;
  const a = analyticsQ.data;
  const rows = rowsQ.data?.rows || [];
  const total = rowsQ.data?.total || 0;

  const cameraOptions = useMemo(
    () => (camerasQ.data?.cameras || []).filter((c) => c.service === "chef_absence"),
    [camerasQ.data]
  );

  // Absences and kitchen entries are counted in different units and differ by
  // an order of magnitude (151 vs ~1900), so they get a panel each. Sharing one
  // axis flattens the absences into the baseline; a second axis would be worse.
  const absenceByHour = useMemo(() => {
    const m = new Map((a?.byHour || []).map((r) => [Number(r.hour), Number(r.n)]));
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, n: m.get(h) || 0 }));
  }, [a]);
  const entriesByHour = useMemo(() => {
    const m = new Map((a?.intrusionsByHour || []).map((r) => [Number(r.hour), Number(r.n)]));
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, n: m.get(h) || 0 }));
  }, [a]);

  const daily = useMemo(
    () => (a?.byDay || []).map((r) => ({ label: fmtDay(r.day), n: Number(r.n) })),
    [a]
  );
  const presence = useMemo(
    () => (a?.presenceByDay || []).map((r) => ({
      label: fmtDay(r.day),
      chef: Number(r.chef), nonChef: Number(r.nonChef), housekeeping: Number(r.housekeeping),
    })),
    [a]
  );

  const dirty = Boolean(from || to || camera);

  return (
    <RequirePage page="monitoring_chef_absence" label="Chef Absence">
      <Box sx={pageLayoutSx}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Chef Absence</Typography>
          <Typography variant="body2" color="text.secondary">{MODULE.blurb}</Typography>
        </Box>

        {/* Stated on the page, not buried in a commit message: the one number a
            reader would reasonably expect here is the one the data cannot support. */}
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          <strong>Absence duration is not reported.</strong> The recorder saves a clip when the
          kitchen empties, but tags every clip 15&nbsp;fps while writing only the frames its
          detector produced — so clip length measures the recording, not how long the station was
          unmanned (150 of 151 clips come out under the 60&nbsp;s the detector is meant to require).
          Incident counts, timings and uniform compliance below are unaffected.
        </Alert>

        <Grid container spacing={1.5}>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Kpi label="Absence incidents" value={k?.incidents ?? 0} hint="station left unmanned"
                 loading={kpisQ.isLoading} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Kpi label="Kitchen entries" value={k?.intrusions ?? 0} hint="snapshots captured"
                 loading={kpisQ.isLoading} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Kpi
              label="Cap compliance"
              value={k?.capCompliancePct == null ? "—" : `${k.capCompliancePct}%`}
              hint={k ? `${k.chefWithCap}/${k.chef} chefs with headwear` : undefined}
              // Status colour, not the module hue: this tile reports a state.
              accent={k?.capCompliancePct == null ? undefined : k.capCompliancePct >= 90 ? STATUS_GOOD : STATUS_BAD}
              loading={kpisQ.isLoading}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Kpi label="People in kitchen" value={k?.peopleSeen ?? 0}
                 hint={k ? `${k.chef} chef · ${k.nonChef} non-chef` : undefined} loading={kpisQ.isLoading} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Kpi label="Peak absence hour" value={fmtHour(k?.peakHour ?? null)}
                 hint={k ? `${k.peakHourCount} incidents` : undefined} loading={kpisQ.isLoading} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Kpi label="Latest incident" value={fmtWhenShort(k?.latestIncident)} loading={kpisQ.isLoading} />
          </Grid>
        </Grid>

        <Paper sx={{ ...contentCardSx }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}>
            <TextField label="From" type="date" size="small" sx={filterFieldSx}
                       slotProps={{ inputLabel: { shrink: true } }} value={from}
                       onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <TextField label="To" type="date" size="small" sx={filterFieldSx}
                       slotProps={{ inputLabel: { shrink: true } }} value={to}
                       onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            <TextField label="Camera" select size="small" sx={filterFieldSx} value={camera}
                       onChange={(e) => { setCamera(e.target.value); setPage(1); }}>
              <MenuItem value="">All cameras</MenuItem>
              {cameraOptions.map((c) => (
                <MenuItem key={c.camera_key} value={c.camera_key}>{c.camera_key.trim()}</MenuItem>
              ))}
            </TextField>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption" color="text.secondary">
              {total.toLocaleString()} record{total === 1 ? "" : "s"}
            </Typography>
            <Chip size="small" label="Export CSV" onClick={onExport} variant="outlined" />
            {dirty && (
              <Chip size="small" icon={<RestartAltIcon />} label="Reset"
                    onClick={() => { setFrom(""); setTo(""); setCamera(""); setPage(1); }} variant="outlined" />
            )}
          </Stack>
        </Paper>

        {analyticsQ.isLoading ? (
          <Grid container spacing={1.5}>
            {[0, 1, 2, 3].map((i) => (
              <Grid key={i} size={{ xs: 12, md: 6 }}>
                <Paper sx={{ ...contentCardSx }}><Skeleton height={220} /></Paper>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Panel title="Absence incidents per day" subtitle="How often the station was left unmanned">
                <ResponsiveContainer width="100%" height="100%">
                  {/* A trend line needs a run of days to be a trend. With only a
                      few, two points joined by a slope invent a direction the
                      data has not earned - so bars until the series is long
                      enough for the shape to mean something. */}
                  {daily.length <= 10 ? (
                    <BarChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
                      <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                                formatter={(v) => [Number(v ?? 0), "incidents"] as [number, string]}
                                contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="n" fill={MODULE.colour} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  ) : (
                    <AreaChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ga-chef" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={MODULE.colour} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={MODULE.colour} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} minTickGap={16} />
                      <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
                      <RTooltip formatter={(v) => [Number(v ?? 0), "incidents"] as [number, string]}
                                contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Area type="monotone" dataKey="n" stroke={MODULE.colour} strokeWidth={2}
                            fill="url(#ga-chef)" dot={false} activeDot={{ r: 4 }} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Panel title="Who was in the kitchen" subtitle="Sightings per day by classification">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={presence} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
                    <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    {/* Three series, so a legend is always present - identity is
                        never carried by colour alone. */}
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    {PRESENCE.map((s, i) => (
                      <Bar key={s.key} dataKey={s.key} name={s.label} stackId="p" fill={s.colour}
                           maxBarSize={40}
                           // 2px surface gap between stacked segments; only the
                           // topmost segment gets the rounded data-end.
                           stroke="#fff" strokeWidth={1}
                           radius={i === PRESENCE.length - 1 ? [4, 4, 0, 0] : undefined} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Panel title="Absences by hour of day" subtitle="When the station is left unmanned (site time, IST)">
                <ResponsiveContainer width="100%" height="100%">
                  {/* Single series, so the title names it and no legend is needed. */}
                  <BarChart data={absenceByHour} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false}
                           interval={1} tickFormatter={(h) => String(h).padStart(2, "0")} />
                    <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
                    <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                              labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                              formatter={(v) => [Number(v ?? 0), "incidents"] as [number, string]}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="n" fill={MODULE.colour} radius={[4, 4, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Panel title="Kitchen entries by hour" subtitle="Snapshots captured on entry (site time, IST)">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entriesByHour} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false}
                           interval={1} tickFormatter={(h) => String(h).padStart(2, "0")} />
                    <YAxis allowDecimals={false} width={38} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
                    <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                              labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                              formatter={(v) => [Number(v ?? 0), "entries"] as [number, string]}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="n" fill="#0f9bbd" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </Grid>

            <Grid size={12}>
              <Panel title="Uniform compliance" subtitle="Share of sightings with headwear detected, by role" height={230}>
                <Box sx={{ height: "100%", overflowY: "auto", pr: 0.5 }}>
                  {(a?.capByStatus || []).length === 0 && (
                    <Typography variant="body2" color="text.secondary">No sightings in range.</Typography>
                  )}
                  {(a?.capByStatus || []).map((r) => {
                    const totalN = Number(r.total) || 0;
                    const withCap = Number(r.withCap) || 0;
                    const pct = totalN ? (withCap / totalN) * 100 : 0;
                    return (
                      <Box key={r.statusChef} sx={{ mb: 1.5 }}>
                        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, textTransform: "capitalize" }}>
                            {r.statusChef}
                          </Typography>
                          {/* Direct label - the number is never left to the bar alone. */}
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {pct.toFixed(0)}%
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                              {withCap}/{totalN}
                            </Typography>
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate" value={pct}
                          sx={{
                            height: 8, borderRadius: 4, mt: 0.5,
                            bgcolor: "rgba(0,0,0,.06)",
                            "& .MuiLinearProgress-bar": {
                              borderRadius: 4,
                              bgcolor: pct >= 90 ? STATUS_GOOD : STATUS_BAD,
                            },
                          }}
                        />
                      </Box>
                    );
                  })}
                  {(a?.byCamera || []).length > 0 && (
                    <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${GRID}` }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                        Absence incidents by camera
                      </Typography>
                      {(a?.byCamera || []).map((c) => {
                        const top = Number(a!.byCamera[0].n) || 1;
                        const pct = Math.max(2, (Number(c.n) / top) * 100);
                        return (
                          <Box key={c.cameraKey} sx={{ mb: 0.85 }}>
                            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                              <Tooltip title={c.cameraKey}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: "70%" }}>
                                  {c.cameraKey.trim()}
                                </Typography>
                              </Tooltip>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.n}</Typography>
                            </Stack>
                            <Box sx={{ height: 6, bgcolor: "rgba(0,0,0,.06)", borderRadius: 3, overflow: "hidden" }}>
                              <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: MODULE.colour, borderRadius: 3 }} />
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Panel>
            </Grid>
          </Grid>
        )}

        <Box>
          <Paper sx={{ ...contentCardSx, p: 0, overflow: "hidden" }}>
            <Tabs
              value={tab}
              onChange={(_e, v) => { setTab(v); setPage(1); setStatusFilter(""); setCapFilter(""); }}
              sx={{ px: 1, borderBottom: `1px solid ${GRID}` }}
            >
              <Tab label={`Absence clips${k ? ` (${k.incidents})` : ""}`} sx={{ fontWeight: 700, textTransform: "none" }} />
              <Tab label={`Kitchen entries${k ? ` (${k.intrusions})` : ""}`} sx={{ fontWeight: 700, textTransform: "none" }} />
              <Tab label={`People seen${k ? ` (${k.peopleSeen})` : ""}`} sx={{ fontWeight: 700, textTransform: "none" }} />
            </Tabs>

            {tab === 2 && (
              <Stack direction="row" spacing={1} sx={{ p: 1.5, pb: 0.5, flexWrap: "wrap" }}>
                <TextField label="Role" select size="small" sx={filterFieldSx} value={statusFilter}
                           onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                  <MenuItem value="">All roles</MenuItem>
                  <MenuItem value="chef">Chef</MenuItem>
                  <MenuItem value="non-chef">Non-chef</MenuItem>
                  <MenuItem value="housekeeping">Housekeeping</MenuItem>
                </TextField>
                <Chip
                  size="small" variant={capFilter ? "filled" : "outlined"}
                  color={capFilter ? "error" : "default"}
                  label="No headwear only"
                  onClick={() => { setCapFilter(capFilter ? "" : "1"); setPage(1); }}
                />
              </Stack>
            )}

            {tab === 1 && (
              <Box sx={{ px: 1.5, pt: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Entry snapshots carry no camera id in the source data, so the camera filter does not apply here.
                </Typography>
              </Box>
            )}

            {rowsQ.isError && <Alert severity="error" sx={{ m: 1.5 }}>Could not load records.</Alert>}

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableHeadSx}>Evidence</TableCell>
                    <TableCell sx={tableHeadSx}>When</TableCell>
                    {tab !== 1 && <TableCell sx={tableHeadSx}>Camera</TableCell>}
                    {tab === 0 && <TableCell sx={tableHeadSx} align="right">Clip length</TableCell>}
                    {tab === 1 && <TableCell sx={tableHeadSx} align="right">Sequence</TableCell>}
                    {tab === 2 && <TableCell sx={tableHeadSx}>Role</TableCell>}
                    {tab === 2 && <TableCell sx={tableHeadSx}>Headwear</TableCell>}
                    {tab === 2 && <TableCell sx={tableHeadSx}>Garments</TableCell>}
                    <TableCell sx={tableHeadSx} align="right">View</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rowsQ.isLoading && Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7} sx={tableCellSx}><Skeleton height={28} /></TableCell>
                    </TableRow>
                  ))}
                  {!rowsQ.isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ ...tableCellSx, textAlign: "center", py: 5 }}>
                        <InboxOutlinedIcon sx={{ fontSize: 32, color: "text.disabled" }} />
                        <Typography variant="body2" color="text.secondary">No records in this range.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {!rowsQ.isLoading && rows.map((r, i) => {
                    const when = r.started_at || r.occurred_at || r.detected_at;
                    return (
                      <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setViewerIndex(i)}>
                        <TableCell sx={tableCellSx}>
                          <Box sx={{ position: "relative", width: 56, height: 40 }}>
                            {r.posterUrl || (!r.isVideo && r.mediaUrl)
                              ? <Box
                                  component="img" src={r.posterUrl || r.mediaUrl} alt="" sx={thumbSx} loading="lazy"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                                />
                              : <Box sx={{ ...thumbSx }} />}
                            {r.isVideo && (
                              <PlayCircleFilledRoundedIcon
                                sx={{ position: "absolute", inset: 0, m: "auto", fontSize: 20, color: "#fff",
                                      filter: "drop-shadow(0 1px 3px rgba(0,0,0,.6))" }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={tableCellSx}>{fmtWhen(when)}</TableCell>
                        {tab !== 1 && (
                          <TableCell sx={tableCellSx}>{(r.camera_key || "—").trim() || "—"}</TableCell>
                        )}
                        {tab === 0 && (
                          <TableCell sx={tableCellSx} align="right">
                            <Tooltip title="Length of the recording — not how long the station was unmanned">
                              <span>{r.clipSeconds == null ? "—" : `${Number(r.clipSeconds).toFixed(1)}s`}</span>
                            </Tooltip>
                          </TableCell>
                        )}
                        {tab === 1 && (
                          <TableCell sx={tableCellSx} align="right">{r.dailySeq ?? "—"}</TableCell>
                        )}
                        {tab === 2 && (
                          <TableCell sx={tableCellSx}>
                            <Chip
                              size="small" label={r.statusChef || "unknown"}
                              sx={{
                                textTransform: "capitalize", fontWeight: 700, height: 22,
                                bgcolor: `${PRESENCE.find((p) =>
                                  (p.key === "nonChef" ? "non-chef" : p.key) === r.statusChef)?.colour || INK}18`,
                              }}
                            />
                          </TableCell>
                        )}
                        {tab === 2 && (
                          <TableCell sx={tableCellSx}>
                            {r.hasCap
                              ? <Chip size="small" label={r.capGarment || "yes"} sx={{ height: 22, bgcolor: `${STATUS_GOOD}1f`, fontWeight: 700 }} />
                              : <Chip size="small" label="none" sx={{ height: 22, bgcolor: `${STATUS_BAD}1f`, fontWeight: 700 }} />}
                          </TableCell>
                        )}
                        {tab === 2 && (
                          <TableCell sx={tableCellSx}>
                            <Typography variant="caption" color="text.secondary">
                              {[r.upperGarment, r.lowerGarment].filter(Boolean).join(" · ") || "—"}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell sx={tableCellSx} align="right">
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setViewerIndex(i); }}>
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {total > PAGE_SIZE && (
              <Stack sx={{ alignItems: "center", py: 1.5 }}>
                <Pagination
                  count={Math.ceil(total / PAGE_SIZE)} page={page} size="small"
                  onChange={(_e, p) => setPage(p)}
                />
              </Stack>
            )}
          </Paper>
        </Box>

        {viewerIndex !== null && (
          <MonitoringMediaViewer
            open
            module={viewerModule}
            rows={rows}
            index={viewerIndex}
            hasMorePages={total > rows.length}
            onIndexChange={setViewerIndex}
            onClose={() => setViewerIndex(null)}
            verdictFor={(r) => verdicts.get(r.id) ?? null}
            onFeedback={(row, verdict) => feedbackMutation.mutate({ row: row as ChefRow, verdict })}
            feedbackPending={feedbackMutation.isPending}
          />
        )}

        <Snackbar
          open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}
          message={toast ?? ""} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </Box>
    </RequirePage>
  );
}
