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

// Active Alerts is the cross-module view of everything that warrants attention.
//
// Walk-ins are footfall, not an alert, so they are excluded - the alert modules
// are intrusion, loitering, after-hours and kitchen-unattended. Counts come from
// the same suppressed row set the Monitoring pages and the Dashboard use, so a
// thumbs-down moves all three together and they can never disagree.
//
// This replaces a page that queried the legacy `crowds` table, which has no
// production writer and returns zero rows.

const ALERT_MODULES: InferenceModuleKey[] = ["intrusion", "loitering", "after_hours", "kitchen_unattended"];
const PAGE_SIZE = 25;
const INK = "rgba(0,0,0,.45)";
const GRID = "rgba(0,0,0,.08)";

type TimelineRow = MonitoringRow & { service: string; occurred_at: string };

export function ActiveAlertsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [service, setService] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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

  // One KPI query per alert module - the same endpoint the Monitoring pages use,
  // so the tiles here and there are guaranteed to match.
  const kpiQueries = ALERT_MODULES.map((m) => ({
    key: m,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    q: useQuery({
      queryKey: ["alerts", "kpis", m, scope],
      queryFn: async () => (await api.get(`/inference/kpis/${m}`, { params: scope })).data as { total: number; latest: string | null },
    }),
  }));

  const rowsQ = useQuery({
    queryKey: ["alerts", "rows", service, scope, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE, ...scope };
      if (service) params.service = service;
      const d = (await api.get("/inference/timeline", { params })).data as {
        total: number; rows: TimelineRow[];
      };
      // The timeline includes walk-ins; alerts exclude them.
      return service
        ? d
        : { total: d.total, rows: d.rows.filter((r) => r.service !== "walkins") };
    },
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
    return all.filter((c) => (service ? c.service === service : ALERT_MODULES.includes(c.service as InferenceModuleKey)));
  }, [camerasQ.data, service]);

  const chartData = kpiQueries.map(({ key, q }) => ({
    key,
    label: MODULE_BY_KEY[key].label,
    colour: MODULE_BY_KEY[key].colour,
    n: q.data?.total ?? 0,
  }));
  const totalAlerts = chartData.reduce((a, r) => a + r.n, 0);
  const loading = kpiQueries.some((k) => k.q.isLoading);

  const rows = rowsQ.data?.rows || [];
  // A timeline row can come from any module, so the table's module descriptor is
  // resolved per row rather than fixed for the page.
  const rowModule = (r: TimelineRow) => MODULE_BY_KEY[(r.service as InferenceModuleKey)] ?? MODULE_BY_KEY.intrusion;

  return (
    <Box sx={pageLayoutSx}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Active Alerts</Typography>
        <Typography variant="body2" color="text.secondary">
          Intrusion, loitering, after-hours and kitchen alerts across all connected cameras.
        </Typography>
      </Box>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Paper sx={{ ...contentCardSx, p: 1.75, height: "100%" }}>
            <Typography variant="caption" color="text.secondary">Total alerts</Typography>
            {loading ? <Skeleton width="60%" height={32} /> : (
              <Typography sx={{ fontWeight: 800, fontSize: 26 }}>{totalAlerts}</Typography>
            )}
            <Typography variant="caption" color="text.secondary">in selected range</Typography>
          </Paper>
        </Grid>
        {chartData.map((c) => (
          <Grid key={c.key} size={{ xs: 6, sm: 6, md: 2.4 }}>
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
                <Typography sx={{ fontWeight: 800, fontSize: 26 }}>{c.n}</Typography>
              )}
              <Typography variant="caption" color="text.secondary">open module</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ ...contentCardSx }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          <TextField select label="Alert type" size="small" value={service}
                     onChange={(e) => { setService(e.target.value); setPage(1); setCamera(""); }} sx={filterFieldSx}>
            <MenuItem value="">All alert types</MenuItem>
            {ALERT_MODULES.map((m) => (
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
            {rowsQ.data?.total ?? 0} alerts
          </Typography>
        </Stack>
      </Paper>

      <Paper sx={{ ...contentCardSx }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Alerts by type</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Each bar carries its module's own colour, matching the Monitoring pages.
        </Typography>
        <Box sx={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }}
                     axisLine={false} tickLine={false} tickMargin={4} />
              <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                        formatter={(v) => [Number(v ?? 0), "alerts"] as [number, string]}
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
          module={service ? MODULE_BY_KEY[service as InferenceModuleKey] : MODULE_BY_KEY.intrusion}
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
