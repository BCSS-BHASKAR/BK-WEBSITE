import { useCallback, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Snackbar, Stack, Typography } from "@mui/material";
import { api, apiBase } from "../lib/api";
import { pageLayoutSx } from "../lib/uiSurfaces";
import { moduleByRouteSlug } from "../lib/inferenceModules";
import { MonitoringKpiRow, type ModuleKpis } from "../components/monitoring/MonitoringKpiRow";
import { MonitoringAnalytics, type ModuleAnalytics } from "../components/monitoring/MonitoringAnalytics";
import {
  MonitoringEventsTable, type FeedbackVerdict, type MonitoringRow,
} from "../components/monitoring/MonitoringEventsTable";
import { MonitoringMediaViewer } from "../components/monitoring/MonitoringMediaViewer";
import {
  EMPTY_FILTERS, MonitoringFilters, type MonitoringFilterState,
} from "../components/monitoring/MonitoringFilters";
import { getAccessToken } from "../auth/tokenStore";
import { useAutoRefreshMs } from "../lib/useAppSettings";

const PAGE_SIZE = 25;

/**
 * One page template, five modules.
 *
 * The module is resolved from the route slug and everything below - which KPI
 * tiles, which filters, which table columns - is driven by that module's
 * declared capabilities. Adding a sixth inference type means adding one entry to
 * lib/inferenceModules.ts, not another page.
 */
export function MonitoringPage() {
  const { module: slug } = useParams<{ module: string }>();
  const mod = moduleByRouteSlug(slug || "");
  const qc = useQueryClient();
  // Interval comes from Settings > General, not a constant.
  const refetchInterval = useAutoRefreshMs();

  const [filters, setFilters] = useState<MonitoringFilterState>({ ...EMPTY_FILTERS });
  const [page, setPage] = useState(1);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (filters.from) p.from = filters.from;
    if (filters.to) p.to = filters.to;
    if (filters.camera) p.camera = filters.camera;
    if (filters.search) p.q = filters.search;
    if (filters.sortBy) { p.sortBy = filters.sortBy; p.sortDir = filters.sortDir; }
    if (filters.minDwell) p.minDwell = filters.minDwell;
    if (filters.minConfidence) p.minConfidence = filters.minConfidence;
    return p;
  }, [filters, page]);

  // Range/camera only - KPIs and analytics ignore paging and sorting.
  const scopeParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filters.from) p.from = filters.from;
    if (filters.to) p.to = filters.to;
    if (filters.camera) p.camera = filters.camera;
    return p;
  }, [filters.from, filters.to, filters.camera]);

  const enabled = Boolean(mod);
  const key = mod?.key ?? "none";

  const kpisQ = useQuery({
    queryKey: ["monitoring", key, "kpis", scopeParams],
    queryFn: async () => (await api.get(`/inference/kpis/${key}`, { params: scopeParams })).data as ModuleKpis,
    enabled,
    refetchInterval,
  });
  const analyticsQ = useQuery({
    queryKey: ["monitoring", key, "analytics", scopeParams],
    queryFn: async () => (await api.get(`/inference/analytics/${key}`, { params: scopeParams })).data as ModuleAnalytics,
    enabled,
  });
  const rowsQ = useQuery({
    queryKey: ["monitoring", key, "rows", params],
    queryFn: async () =>
      (await api.get(`/inference/${mod!.endpoint}`, { params })).data as {
        total: number; rows: MonitoringRow[];
      },
    enabled,
    refetchInterval,
  });
  const camerasQ = useQuery({
    queryKey: ["monitoring", "cameras"],
    queryFn: async () => (await api.get("/inference/cameras")).data as {
      cameras: { service: string; camera_key: string }[];
    },
  });
  const feedbackQ = useQuery({
    queryKey: ["monitoring", key, "feedback"],
    queryFn: async () => (await api.get("/inference/feedback", { params: { module: key } })).data as {
      rows: { detection_id: number; feedback_type: FeedbackVerdict }[];
    },
    enabled,
  });

  const verdicts = useMemo(() => {
    const m = new Map<number, FeedbackVerdict>();
    for (const r of feedbackQ.data?.rows || []) m.set(Number(r.detection_id), r.feedback_type);
    return m;
  }, [feedbackQ.data]);

  const feedbackMutation = useMutation({
    mutationFn: async (vars: { row: MonitoringRow; verdict: "verified" | "false_positive" }) =>
      (await api.post("/inference/feedback", {
        module: key,
        detectionId: vars.row.id,
        cameraId: vars.row.camera_key,
        confidence: vars.row.confidence ?? null,
        feedbackType: vars.verdict,
      })).data,
    onSuccess: (_d, vars) => {
      setToast(
        vars.verdict === "false_positive"
          ? "Marked as false positive — hidden from counts, media retained for retraining."
          : "Marked as verified."
      );
      // A verdict changes the suppressed set, so KPIs, analytics and rows all
      // need refetching together or they would disagree.
      qc.invalidateQueries({ queryKey: ["monitoring", key] });
      qc.invalidateQueries({ queryKey: ["inference"] });
    },
    onError: () => setToast("Could not save feedback."),
  });

  const cameraOptions = useMemo(
    () => (camerasQ.data?.cameras || []).filter((c) => c.service === key),
    [camerasQ.data, key]
  );

  const onExport = useCallback(() => {
    // Export honours the current filters. Uses a token-bearing fetch rather than
    // a bare link because the endpoint is authenticated.
    const qs = new URLSearchParams(
      Object.entries(scopeParams).reduce((a, [k, v]) => ({ ...a, [k]: String(v) }), {})
    ).toString();
    fetch(`${apiBase}/inference/export/${key}.csv${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
    })
      .then((r) => r.blob())
      .then((b) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${key}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setToast("Export failed."));
  }, [key, scopeParams]);

  if (!mod) return <Navigate to="/monitoring/walkins" replace />;

  const rows = rowsQ.data?.rows || [];
  const total = rowsQ.data?.total || 0;

  return (
    <Box sx={pageLayoutSx}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>{mod.label} Monitoring</Typography>
        <Typography variant="body2" color="text.secondary">{mod.blurb}</Typography>
      </Box>

      <MonitoringKpiRow
        module={mod}
        kpis={kpisQ.data}
        loading={kpisQ.isLoading}
        onDrill={() => document.getElementById("monitoring-events")?.scrollIntoView({ behavior: "smooth" })}
      />

      <MonitoringFilters
        module={mod}
        value={filters}
        onChange={(next) => { setFilters(next); setPage(1); }}
        cameras={cameraOptions}
        resultCount={total}
        onExport={onExport}
      />

      <MonitoringAnalytics module={mod} data={analyticsQ.data} loading={analyticsQ.isLoading} />

      <Box id="monitoring-events">
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Detection events</Typography>
        </Stack>
        {rowsQ.isError && <Alert severity="error" sx={{ mb: 1 }}>Could not load detections.</Alert>}
        <MonitoringEventsTable
          module={mod}
          rows={rows}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={rowsQ.isLoading}
          feedbackFor={(r) => verdicts.get(r.id) ?? null}
          onPageChange={setPage}
          onView={(i) => setViewerIndex(i)}
        />
      </Box>

      {viewerIndex !== null && (
        <MonitoringMediaViewer
          open
          module={mod}
          rows={rows}
          index={viewerIndex}
          hasMorePages={total > rows.length}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          verdictFor={(r) => verdicts.get(r.id) ?? null}
          onFeedback={(row, verdict) => feedbackMutation.mutate({ row, verdict })}
          feedbackPending={feedbackMutation.isPending}
        />
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
