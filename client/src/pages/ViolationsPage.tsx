import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Pagination,
  Skeleton,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import BoltIcon from "@mui/icons-material/Bolt";
import PolicyIcon from "@mui/icons-material/Policy";
import { api } from "../lib/api";
import { ImageZoomDialog, type ImageZoomPayload } from "../components/ImageZoomDialog";
import { ViolationEventCard, type ViolationEventRow } from "../components/ViolationEventCard";
import { zoomPayloadFromViolationRow } from "../lib/eventImageZoom";
import { defaultTodayRange, daysInclusive } from "../lib/dashboardRange";
import { filterRowJumpToTodaySx, filterRowTextFieldSlotProps } from "../lib/filterRowControls";
import { contentCardSx, gridCols, pageLayoutSx } from "../lib/uiSurfaces";
import { SITE_LABELS } from "../i18n/lang";
import { SITE_TIMEZONE, dayjsInSite, ymdSite } from "../lib/siteTimeZone";
import { VIOLATION_TYPE_META, violationTypeLabel, violationTypesByCount } from "../lib/violationTypes";
import { RecordsViewToggle, type RecordsViewMode } from "../components/RecordsViewToggle";
import { ViolationEventsListView } from "../components/ViolationEventsListView";
import { useCameras } from "../hooks/useCameras";

const PAGE_SIZE = 24;

export function ViolationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initial = defaultTodayRange();
  const [from, setFrom] = useState<string>(searchParams.get("from") ?? initial.from);
  const [to, setTo] = useState<string>(searchParams.get("to") ?? initial.to);
  const [type, setType] = useState<string>(searchParams.get("type") ?? "");
  const [cameraId, setCameraId] = useState<string>(searchParams.get("cameraId") ?? "");
  const [plate, setPlate] = useState<string>(searchParams.get("plate") ?? "");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<ImageZoomPayload | null>(null);
  const [viewMode, setViewMode] = useState<RecordsViewMode>("list");
  const focusViolationId = searchParams.get("violationId") || "";

  const spanDays = useMemo(() => daysInclusive(from, to), [from, to]);

  useEffect(() => {
    const urlFrom = searchParams.get("from");
    const urlTo = searchParams.get("to");
    const urlType = searchParams.get("type") ?? "";
    const urlCamera = searchParams.get("cameraId") ?? "";
    const urlPlate = searchParams.get("plate") ?? "";
    const urlViolationId = searchParams.get("violationId") ?? "";
    if (urlFrom) setFrom(urlFrom);
    if (urlTo) setTo(urlTo);
    setType(urlType);
    setCameraId(urlCamera);
    setPlate(urlPlate);
    if (urlViolationId) setPage(1);

  }, [searchParams]);

  useEffect(() => {
    const p = new URLSearchParams();
    p.set("from", from);
    p.set("to", to);
    if (type) p.set("type", type);
    if (cameraId) p.set("cameraId", cameraId);
    if (plate.trim()) p.set("plate", plate.trim());
    if (focusViolationId) p.set("violationId", focusViolationId);
    setSearchParams(p, { replace: true });
  }, [from, to, type, cameraId, plate, focusViolationId, setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [from, to, type, cameraId, plate]);

  const qParams = useMemo(() => {
    const params: Record<string, string | number> = { from, to, page, pageSize: PAGE_SIZE };
    if (focusViolationId) params.violationId = focusViolationId;
    if (type) params.type = type;
    if (cameraId) params.cameraId = cameraId;
    if (plate.trim()) params.plate = plate.trim();
    return params;
  }, [from, to, type, cameraId, plate, page, focusViolationId]);

  const summaryParams = useMemo(() => {
    const params: Record<string, string> = { from, to };
    if (cameraId) params.cameraId = cameraId;
    if (plate.trim()) params.plate = plate.trim();
    return params;
  }, [from, to, cameraId, plate]);

  const camerasQ = useCameras();
  const cameraFilterOptions = useMemo(
    () =>
      Object.entries(camerasQ.data?.cameraMap ?? {})
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [camerasQ.data?.cameraMap]
  );
  const selectedCameraName = cameraId ? (camerasQ.data?.cameraMap?.[cameraId] ?? cameraId) : "";

  const summaryQ = useQuery({
    queryKey: ["dashboard", "violations-summary", summaryParams],
    queryFn: async ({ signal }) =>
      (
        await api.get<{ total: number; byType: Record<string, number> }>("/dashboard/violations-summary", {
          params: summaryParams,
          signal,
        })
      ).data,
    placeholderData: keepPreviousData,
    refetchInterval: 10000,
  });

  const violationsQ = useQuery({
    queryKey: ["dashboard", "violations", from, to, type, cameraId, plate, page, focusViolationId],
    queryFn: async ({ signal }) =>
      (await api.get<{ total: number; rows: ViolationEventRow[] }>("/dashboard/violations", { params: qParams, signal })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 10000,
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ violationId, feedback }: { violationId: number; feedback: 0 | 1 }) =>
      (await api.post(`/dashboard/violations/${violationId}/feedback`, { feedback })).data,
    onSuccess: () => {
      // Refresh list + counts so thumbs-down rows drop out and totals stay in sync.
      queryClient.invalidateQueries({ queryKey: ["dashboard", "violations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "violations-summary"] });
    },
  });

  const handleFeedback = (violationId: number, feedback: 0 | 1) => {
    // Thumbs down = false positive: hide it by closing the viewer; the refetch removes the row.
    if (feedback === 0) setZoom(null);
    feedbackMutation.mutate({ violationId, feedback });
  };

  const listRows = violationsQ.data?.rows ?? [];
  const listTotal = violationsQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  useEffect(() => {
    if (!focusViolationId || !listRows.length) return;
    const id = Number(focusViolationId);
    if (!Number.isFinite(id)) return;
    const row = listRows.find((r) => r.id === id);
    if (!row) return;
    const payload = zoomPayloadFromViolationRow(row);
    if (payload) setZoom(payload);
    requestAnimationFrame(() => {
      document.getElementById(`violation-event-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusViolationId, listRows]);

  const typeLabel = type ? violationTypeLabel(type) : "All types";

  const typesByCount = useMemo(
    () => violationTypesByCount(summaryQ.data?.byType),
    [summaryQ.data?.byType]
  );

  const today = ymdSite();
  const alreadyToday = from === today && to === today;

  return (
    <Box sx={{ ...pageLayoutSx, gap: 2.75 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 2, flexWrap: "wrap" }}>
        <Chip
          icon={<PolicyIcon />}
          label={`${type ? typeLabel : "All types"}${selectedCameraName ? ` · ${selectedCameraName}` : ""}${plate.trim() ? ` · ${plate.trim()}` : ""} · ${spanDays} day${spanDays === 1 ? "" : "s"}`}
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600, textTransform: "none", bgcolor: "rgba(29,78,216,0.06)", borderRadius: 1.5 }}
        />
      </Box>

      <Paper elevation={0} sx={{ ...contentCardSx, p: { xs: 2, sm: 2.25 } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: gridCols(2), lg: gridCols(5) },
            gap: 2,
            alignItems: "end",
          }}
        >
          <DatePicker
            label={SITE_LABELS.reportingStart}
            format="YYYY-MM-DD"
            value={dayjsInSite(from)}
            onChange={(v) => {
              if (v?.isValid()) setFrom(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
            }}
            maxDate={dayjsInSite(to)}
            slotProps={{ textField: filterRowTextFieldSlotProps }}
          />
          <DatePicker
            label={SITE_LABELS.reportingEnd}
            format="YYYY-MM-DD"
            value={dayjsInSite(to)}
            onChange={(v) => {
              if (v?.isValid()) setTo(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
            }}
            minDate={dayjsInSite(from)}
            slotProps={{ textField: filterRowTextFieldSlotProps }}
          />
          <TextField
            select
            label="Camera site"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            {...filterRowTextFieldSlotProps}
          >
            <MenuItem value="">All camera sites</MenuItem>
            {cameraFilterOptions.map(({ id, name }) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={SITE_LABELS.platePartialMatch}
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="e.g. ABC123"
            {...filterRowTextFieldSlotProps}
          />
          <Button
            fullWidth
            variant="contained"
            disableElevation
            disabled={alreadyToday}
            startIcon={<BoltIcon sx={{ fontSize: 18 }} />}
            onClick={() => {
              const d = defaultTodayRange();
              setFrom(d.from);
              setTo(d.to);
              setType("");
              setCameraId("");
              setPlate("");
            }}
            sx={filterRowJumpToTodaySx(alreadyToday)}
          >
            {SITE_LABELS.jumpToToday}
          </Button>
        </Box>

        <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Chip
            label={`All · ${(summaryQ.data?.total ?? 0).toLocaleString()}`}
            onClick={() => setType("")}
            color={!type ? "primary" : "default"}
            variant={!type ? "filled" : "outlined"}
            sx={{ fontWeight: 900, cursor: "pointer" }}
          />
          {typesByCount.map((t) => {
            const meta = VIOLATION_TYPE_META[t];
            const count = summaryQ.data?.byType?.[t] ?? 0;
            const selected = type === t;
            return (
              <Chip
                key={t}
                icon={<meta.Icon sx={{ fontSize: "16px !important" }} />}
                label={`${meta.label} · ${summaryQ.isLoading ? "-" : count.toLocaleString()}`}
                onClick={() => setType(selected ? "" : t)}
                variant={selected ? "filled" : "outlined"}
                sx={{
                  fontWeight: 900,
                  cursor: "pointer",
                  bgcolor: selected ? meta.softBg : undefined,
                  color: selected ? meta.color : undefined,
                  borderColor: selected ? meta.color : undefined,
                }}
              />
            );
          })}
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ ...contentCardSx, p: { xs: 2, sm: 2.25 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            flexWrap: "wrap",
            pb: 2,
            borderBottom: "1px solid rgba(15,23,42,0.07)",
          }}
        >
          <Box>
            <Typography variant="overline" sx={{ fontWeight: 900, color: "text.secondary", letterSpacing: "0.12em" }}>
              {SITE_LABELS.trafficViolations}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              {SITE_LABELS.violationEvents}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ fontWeight: 800, color: "text.secondary" }}>
              {violationsQ.isLoading
                ? "Loading…"
                : listTotal === 0
                  ? "0 violation events"
                  : `Rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, listTotal)} of ${listTotal.toLocaleString()}`}
            </Typography>
            <RecordsViewToggle value={viewMode} onChange={setViewMode} />
          </Box>
        </Box>

        <Box sx={{ pt: 2 }}>
          {violationsQ.isError ? (
            <Alert severity="warning" variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
              Unable to load violations. Restart the API server after backend changes, then hard-refresh.
            </Alert>
          ) : null}

          {violationsQ.isLoading && !violationsQ.data ? (
            viewMode === "list" ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={44} sx={{ borderRadius: "8px" }} />
                ))}
              </Box>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: gridCols(2), md: gridCols(3) },
                  gap: 2,
                }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <Box key={i}>
                    <Skeleton variant="rounded" height={152} sx={{ borderRadius: "10px" }} />
                    <Skeleton sx={{ mt: 1 }} />
                    <Skeleton width="60%" />
                  </Box>
                ))}
              </Box>
            )
          ) : null}

          {!violationsQ.isLoading && listRows.length === 0 && !violationsQ.isError ? (
            <Box
              sx={{
                py: 5,
                px: 2,
                textAlign: "center",
                borderRadius: "10px",
                bgcolor: "rgba(15,23,42,0.03)",
                border: "1px dashed rgba(15,23,42,0.12)",
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                No violations match the current criteria
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 650, color: "text.secondary", mt: 1, maxWidth: 420, mx: "auto" }}>
                Broaden the reporting window or clear the violation type filter.
              </Typography>
            </Box>
          ) : null}

          {viewMode === "list" ? (
            <ViolationEventsListView rows={listRows} onZoom={setZoom} />
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: gridCols(2), md: gridCols(3) },
                gap: { xs: 1.75, md: 2.25 },
                alignItems: "stretch",
              }}
            >
              {listRows.map((r) => (
                <ViolationEventCard
                  key={r.id}
                  row={r}
                  onZoom={setZoom}
                  highlighted={focusViolationId !== "" && Number(focusViolationId) === r.id}
                />
              ))}
            </Box>
          )}

          <Box sx={{ display: "flex", justifyContent: "center", pt: 2.5 }}>
            <Pagination
              count={pageCount}
              page={page}
              onChange={(_, p) => setPage(p)}
              color="primary"
              shape="rounded"
              showFirstButton
              showLastButton
              disabled={violationsQ.isLoading}
            />
          </Box>
        </Box>
      </Paper>

      {(() => {
        const zoomIndex = zoom?.violationId ? listRows.findIndex((r) => r.id === zoom.violationId) : -1;
        const zoomPrevRow = zoomIndex > 0 ? listRows[zoomIndex - 1] : null;
        const zoomNextRow = zoomIndex !== -1 && zoomIndex < listRows.length - 1 ? listRows[zoomIndex + 1] : null;

        return (
          <ImageZoomDialog
            open={!!zoom}
            payload={zoom}
            onClose={() => setZoom(null)}
            title="Violation capture"
            onFeedback={handleFeedback}
            feedbackPending={feedbackMutation.isPending}
            onPrev={zoomPrevRow ? () => setZoom(zoomPayloadFromViolationRow(zoomPrevRow)) : undefined}
            onNext={zoomNextRow ? () => setZoom(zoomPayloadFromViolationRow(zoomNextRow)) : undefined}
          />
        );
      })()}
    </Box>
  );
}
