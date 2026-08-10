import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Grid, MenuItem, Paper, Skeleton, Snackbar, Stack, TextField, Typography,
} from "@mui/material";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../lib/api";
import { contentCardSx, pageLayoutSx } from "../lib/uiSurfaces";
import { MODULE_BY_KEY, type InferenceModuleKey } from "../lib/inferenceModules";
import {
  MonitoringEventsTable, type FeedbackVerdict, type MonitoringRow,
} from "../components/monitoring/MonitoringEventsTable";
import { MonitoringMediaViewer } from "../components/monitoring/MonitoringMediaViewer";
import { filterFieldSx } from "../components/monitoring/monitoringTokens";
import { useAutoRefreshMs } from "../lib/useAppSettings";
import { KpiDelta } from "../components/KpiDelta";
import { buildDelta, previousRange, todayRange } from "../lib/rangeCompare";

// Active Alerts is the cross-module view of everything that warrants attention.
//
// Walk-ins ARE shown here, by explicit request, but they are not an alert -
// they are footfall. So they get a card and a bar for context, while "Total
// alerts" deliberately excludes them; adding 57 entries to an alert count would
// misreport how much needed attention. The card and bar are labelled
// "Walk-ins (activity)" so the distinction survives a glance.
//
// Counts come from the same suppressed row set the Monitoring pages and the
// Dashboard use, so a thumbs-down moves all three together and they can never
// disagree.
//
// This replaces a page that queried the legacy `crowds` table, which has no
// production writer and returns zero rows.

// Everything the page tracks, alerts first. chef_absence is included: it is an
// alert module (the cooking station was left unmanned), and omitting it would
// repeat the bug where a new module is invisible everywhere but its own page.
//
// kitchen_unattended is deliberately absent. It asks the same operational
// question as chef_absence - was the line left uncovered - and chef_absence is
// the detector actually recording at this site, so carrying both put a
// permanent zero next to the real figure and split one concern across two
// tiles. The module and its route stay live; it is only dropped from this
// page's tiles, bars and Alert type filter.
const ALERT_MODULES: InferenceModuleKey[] = [
  "intrusion", "loitering", "after_hours", "chef_absence",
];
// Walk-ins are tracked and displayed, but never counted as an alert.
const CONTEXT_MODULES: InferenceModuleKey[] = ["walkins"];
const TRACKED_MODULES: InferenceModuleKey[] = [...ALERT_MODULES, ...CONTEXT_MODULES];
const PAGE_SIZE = 20;
const INK = "rgba(0,0,0,.45)";
const GRID = "rgba(0,0,0,.08)";

type TimelineRow = MonitoringRow & { service: string; occurred_at: string };

export function ActiveAlertsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const refetchInterval = useAutoRefreshMs();
  const [service, setService] = useState<string>("");
  // Today by default, so the tiles have a preceding period to compare against.
  const [from, setFrom] = useState(() => todayRange().from);
  const [to, setTo] = useState(() => todayRange().to);
  const [camera, setCamera] = useState("");
  const [page, setPage] = useState(1);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const scope = useMemo(() => {
    const p: Record<string, string> = {};
    if (from) p.from = from;
    if (to) p.to = to;
    if (camera) p.camera = camera;
    return p;
  }, [from, to, camera]);

  // One KPI query per tracked module - the same endpoint the Monitoring pages
  // use, so the tiles here and there are guaranteed to match.
  const kpiQueries = TRACKED_MODULES.map((m) => ({
    key: m,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    q: useQuery({
      queryKey: ["alerts", "kpis", m, scope],
      queryFn: async () => (await api.get(`/inference/kpis/${m}`, { params: scope })).data as { total: number; latest: string | null },
    }),
  }));

  /**
   * The same per-module totals over the equal-length window immediately before
   * the selected one. Only the tile deltas read these.
   */
  const prevScope = useMemo(() => {
    const prev = from && to ? previousRange(from, to) : null;
    if (!prev) return null;
    const p: Record<string, string> = { from: prev.from, to: prev.to };
    if (camera) p.camera = camera;
    return p;
  }, [from, to, camera]);

  const prevKpiQueries = TRACKED_MODULES.map((m) => ({
    key: m,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    q: useQuery({
      queryKey: ["alerts", "kpis-prev", m, prevScope],
      queryFn: async () =>
        (await api.get(`/inference/kpis/${m}`, { params: prevScope! })).data as { total: number },
      enabled: Boolean(prevScope),
    }),
  }));
  const prevTotals = new Map(prevKpiQueries.map(({ key, q }) => [key, q.data?.total]));

  const rowsQ = useQuery({
    queryKey: ["alerts", "rows", service, scope, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE, ...scope };
      if (service) params.service = service;
      // Walk-ins are no longer filtered out of the table: they are shown as
      // activity alongside the alerts, and the "Alert type" control still
      // narrows to a single module when one is chosen.
      return (await api.get("/inference/timeline", { params })).data as {
        total: number; rows: TimelineRow[];
      };
    },
    refetchInterval,
  });

  const camerasQ = useQuery({
    queryKey: ["alerts", "cameras"],
    queryFn: async () => (await api.get("/inference/cameras")).data as {
      cameras: { service: string; camera_key: string }[];
    },
  });

  const feedbackQ = useQuery({
    queryKey: ["alerts", "feedback"],
    queryFn: async () => (await api.get("/inference/feedback")).data as {
      rows: { module: string; detection_id: number; feedback_type: FeedbackVerdict }[];
    },
  });

  const verdicts = useMemo(() => {
    const m = new Map<string, FeedbackVerdict>();
    for (const r of feedbackQ.data?.rows || []) m.set(`${r.module}:${r.detection_id}`, r.feedback_type);
    return m;
  }, [feedbackQ.data]);

  const feedbackMutation = useMutation({
    mutationFn: async (v: { row: TimelineRow; verdict: "verified" | "false_positive" }) =>
      (await api.post("/inference/feedback", {
        module: v.row.service, detectionId: v.row.id,
        cameraId: v.row.camera_key, feedbackType: v.verdict,
      })).data,
    onSuccess: (_d, v) => {
      setToast(v.verdict === "false_positive"
        ? "Marked as false positive — removed from alert counts, media retained."
        : "Marked as verified.");
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["monitoring"] });
      qc.invalidateQueries({ queryKey: ["inference"] });
    },
  });

  const cameraOptions = useMemo(() => {
    const all = camerasQ.data?.cameras || [];
    return all.filter((c) => (service ? c.service === service : TRACKED_MODULES.includes(c.service as InferenceModuleKey)));
  }, [camerasQ.data, service]);

  const chartData = kpiQueries.map(({ key, q }) => ({
    key,
    // A failed query used to fall through `?? 0` and print a confident zero -
    // indistinguishable from "no alerts". Carry the error so the tile can say
    // it does not know.
    failed: q.isError,
    // Walk-ins carry their nature in the label so a bar of 57 entries is never
    // read as 57 alerts.
    label: CONTEXT_MODULES.includes(key) ? `${MODULE_BY_KEY[key].label} (activity)` : MODULE_BY_KEY[key].label,
    colour: MODULE_BY_KEY[key].colour,
    isAlert: ALERT_MODULES.includes(key),
    n: q.data?.total ?? 0,
    prev: prevTotals.get(key),
  }));
  // Alerts only. Walk-ins are displayed beside them but are not added in.
  const alertRows = chartData.filter((r) => r.isAlert);
  const anyFailed = alertRows.some((r) => r.failed);
  const totalAlerts = alertRows.reduce((a, r) => a + r.n, 0);
  // Undefined until every module's baseline has loaded, so the delta says
  // "no comparison available" rather than measuring against a partial sum.
  const prevAlertTotal = alertRows.every((r) => r.prev != null)
    ? alertRows.reduce((a, r) => a + Number(r.prev), 0)
    : undefined;
  const loading = kpiQueries.some((k) => k.q.isLoading);

  const rows = rowsQ.data?.rows || [];
  // A timeline row can come from any module, so the table's module descriptor is
  // resolved per row rather than fixed for the page.
  const rowModule = (r: TimelineRow) => MODULE_BY_KEY[(r.service as InferenceModuleKey)] ?? MODULE_BY_KEY.intrusion;

  // The table's column set, restricted to what the timeline view can actually
  // supply for every row regardless of which module produced it.
  const maskedModule = useMemo(() => {
    const base = service ? MODULE_BY_KEY[service as InferenceModuleKey] : MODULE_BY_KEY.intrusion;
    return {
      ...base,
      capabilities: { ...base.capabilities, confidence: false, appearance: false },
    };
  }, [service]);

  return (
    <Box sx={pageLayoutSx}>
      {/* No in-page title block: the shell header already renders "Active
          Alerts" and its description, so repeating them here pushed the KPI
          cards down behind a duplicate heading. */}
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 12 / 7 }}>
          <Paper sx={{ ...contentCardSx, p: 1.75, height: "100%" }}>
            <Typography variant="caption" color="text.secondary">Total alerts</Typography>
            {loading ? <Skeleton width="60%" height={32} /> : (
              <Typography sx={{ fontWeight: 800, fontSize: 26 }}>
                {anyFailed ? "—" : totalAlerts}
              </Typography>
            )}
            {anyFailed ? (
              <Typography variant="caption" color="text.secondary">
                some modules did not load
              </Typography>
            ) : (
              <KpiDelta delta={buildDelta(totalAlerts, prevAlertTotal, from, to)} />
            )}
          </Paper>
        </Grid>
        {/* Seven equal columns: the total plus six modules. Each card carries
            the same height so the row stays on one baseline. */}
        {chartData.map((c) => (
          <Grid key={c.key} size={{ xs: 6, sm: 6, md: 12 / 7 }}>
            <Paper
              onClick={() => navigate(MODULE_BY_KEY[c.key].route)}
              sx={{
                ...contentCardSx, p: 1.75, height: "100%", cursor: "pointer",
                "&:hover": { boxShadow: "0 2px 10px rgba(15,23,42,.10)" },
              }}
            >
              <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: c.colour }} />
                <Typography variant="caption" color="text.secondary" noWrap>{c.label}</Typography>
              </Stack>
              {loading ? <Skeleton width="50%" height={30} /> : (
                <Typography sx={{ fontWeight: 800, fontSize: 26 }}>{c.failed ? "—" : c.n}</Typography>
              )}
              {c.failed ? (
                <Typography variant="caption" color="text.secondary">could not load</Typography>
              ) : (
                <KpiDelta delta={buildDelta(c.n, c.prev, from, to)} />
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ ...contentCardSx }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          <TextField select label="Alert type" size="small" value={service}
                     onChange={(e) => { setService(e.target.value); setPage(1); setCamera(""); }} sx={filterFieldSx}>
            <MenuItem value="">All types</MenuItem>
            {TRACKED_MODULES.map((m) => (
              <MenuItem key={m} value={m}>{MODULE_BY_KEY[m].label}</MenuItem>
            ))}
          </TextField>
          <TextField label="From" type="date" size="small" value={from}
                     onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                     slotProps={{ inputLabel: { shrink: true } }} sx={filterFieldSx} />
          <TextField label="To" type="date" size="small" value={to}
                     onChange={(e) => { setTo(e.target.value); setPage(1); }}
                     slotProps={{ inputLabel: { shrink: true } }} sx={filterFieldSx} />
          <TextField select label="Camera" size="small" value={camera}
                     onChange={(e) => { setCamera(e.target.value); setPage(1); }} sx={filterFieldSx}>
            <MenuItem value="">All cameras</MenuItem>
            {cameraOptions.map((c) => (
              <MenuItem key={`${c.service}:${c.camera_key}`} value={c.camera_key}>{c.camera_key.trim()}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {/* The timeline total includes walk-ins, which are not alerts. */}
            {rowsQ.data?.total ?? 0} records
          </Typography>
        </Stack>
      </Paper>

      <Paper sx={{ ...contentCardSx }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Alerts by type</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Each bar carries its module's own colour, matching the Monitoring pages. Walk-ins are
          shown for context and are not counted in the alert total.
        </Typography>
        <Box sx={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }}
                     axisLine={false} tickLine={false} tickMargin={4} />
              <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                        formatter={(v, _n, p) => [
                          Number(v ?? 0),
                          (p?.payload as { isAlert?: boolean })?.isAlert === false ? "entries" : "alerts",
                        ] as [number, string]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="n" radius={[4, 4, 0, 0]} maxBarSize={54}>
                {chartData.map((c) => <Cell key={c.key} fill={c.colour} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Alert events</Typography>
        {rowsQ.isError && <Alert severity="error" sx={{ mb: 1 }}>Could not load alerts.</Alert>}
        <MonitoringEventsTable
          // Columns come from this module's capabilities, but /inference/timeline
          // only projects camera/time/duration/identity - it carries no
          // confidence and no garment colours. Selecting Walk-ins would
          // otherwise add Confidence and Appearance columns that are empty in
          // every row, so those two are masked off here.
          module={maskedModule}
          // Every row states its own module. Without this the whole table wore
          // the fallback's "Intrusion" chip, mislabelling every loitering,
          // after-hours and chef-absence row on the page.
          moduleForRow={(r) => rowModule(r as TimelineRow)}
          rows={rows.map((r) => ({ ...r, detected_at: r.occurred_at }))}
          total={rowsQ.data?.total ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          loading={rowsQ.isLoading}
          feedbackFor={(r) => verdicts.get(`${(r as TimelineRow).service}:${r.id}`) ?? null}
          onPageChange={setPage}
          onView={(i) => setViewerIndex(i)}
        />
      </Box>

      {viewerIndex !== null && rows[viewerIndex] && (
        <MonitoringMediaViewer
          open
          module={rowModule(rows[viewerIndex])}
          rows={rows.map((r) => ({ ...r, detected_at: r.occurred_at }))}
          index={viewerIndex}
          hasMorePages={(rowsQ.data?.total ?? 0) > rows.length}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          verdictFor={(r) => verdicts.get(`${(r as TimelineRow).service}:${r.id}`) ?? null}
          onFeedback={(row, verdict) => feedbackMutation.mutate({ row: row as TimelineRow, verdict })}
          feedbackPending={feedbackMutation.isPending}
        />
      )}

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}
                message={toast ?? ""} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
