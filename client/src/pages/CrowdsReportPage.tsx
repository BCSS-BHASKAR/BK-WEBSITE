import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Pagination,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { ImageZoomDialog } from "../components/ImageZoomDialog";
import { useReportImageZoom } from "../lib/useReportImageZoom";
import { api } from "../lib/api";
import { contentCardSx, gridCols, pageLayoutSx } from "../lib/uiSurfaces";
import { SITE_LABELS, formatLang } from "../i18n/lang";
import { daysInclusive, defaultLast7Range } from "../lib/dashboardRange";
import { buildCrowdsReportSearch } from "../lib/crowdsReportNav";
import {
  SITE_TIMEZONE,
  dayjsInSite,
  formatChartDayTick,
  formatHourEndTickFromStart,
  formatPeopleReportDisplayTime,
  ymdSite,
} from "../lib/siteTimeZone";
import { CrowdSeverityPieChart } from "../components/charts/CrowdSeverityPieChart";
import {
  AlertTypeStackedChart,
  alertTypePoint,
  type AlertTypeStackedPoint,
} from "../components/charts/AlertTypeStackedChart";
import { RecordsViewToggle, type RecordsViewMode } from "../components/RecordsViewToggle";
import { CrowdsEventsListView, type CrowdListRow } from "../components/CrowdsEventsListView";
import { zoomPayloadFromCrowdRow } from "../lib/eventImageZoom";
import {
  crowdSiteFilterOptions,
  crowdZoneFilterOptions,
  resolveCrowdZoneName,
} from "../lib/reportFilterScopes";
import { receiverImageUrl } from "../lib/receiverImageUrl";
import {
  CROWD_ALERT_TYPES,
  CROWD_ALERT_TYPE_META,
  crowdAlertTypeColor,
  crowdAlertTypeLabel,
  isCrowdAlertType,
  type CrowdAlertType,
} from "../lib/crowdAlertTypes";

type ApiResp = {
  rows: CrowdListRow[];
  total: number;
  page: number;
  pageSize: number;
  cameraMap: Record<string, string>;
  siteNames: string[];
};

type RangeStats = {
  from: string;
  to: string;
  spanDays: number;
  timelineMode?: "hourly" | "daily";
  total: number;
  peakPeople: number;
  peakOccupancy: number;
  bySeverity: { ALERT: number; ALARM: number; CRITICAL: number };
  byAlertType?: Record<CrowdAlertType, number>;
  zones: {
    camera_id: string;
    name: string;
    alerts: number;
    peakPeople: number;
    peakOccupancy: number;
    byAlertType?: Record<CrowdAlertType, number>;
  }[];
  siteNames: string[];
  timeline: {
    label: string;
    total: number;
    peakPeople: number;
    peakOccupancy: number;
    byAlertType?: Record<CrowdAlertType, number>;
  }[];
};

const PAGE_SIZE = 24;
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

// Single-venue deployment: every alert belongs to the same site, so scoping by
// zone/site adds noise. Flip to true to bring both pickers back.
const SHOW_ZONE_AND_SITE_FILTERS = false;

// With one monitored area there is nothing to compare, so the per-area summary
// chip and chart are hidden. Flip to true once more areas report alerts.
const SHOW_AREA_BREAKDOWN = false;

// Same reason: the Zone row on an alert card always reads the same value.
const SHOW_ZONE_ROW = false;

// Keeps the filter bar on one compact row instead of stretching each control.
const filterFieldSx = { width: { xs: "100%", sm: 176 } } as const;

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        px: 1.25,
        py: 0.85,
        borderRadius: "8px",
        bgcolor: "rgba(15,23,42,0.03)",
        border: "1px solid rgba(15,23,42,0.06)",
        minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "1rem", fontWeight: 800, mt: 0.25, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

function AlertTypeTile({
  type,
  count,
  selected,
  pending,
  onClick,
}: {
  type: CrowdAlertType;
  count: number;
  selected: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  const meta = CROWD_ALERT_TYPE_META[type];
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        appearance: "none",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        p: 1.75,
        borderRadius: "10px",
        bgcolor: selected ? meta.softColor : "background.paper",
        border: "1px solid",
        borderColor: selected ? meta.color : "rgba(15,23,42,0.08)",
        boxShadow: selected ? `0 0 0 1px ${meta.color}` : "0 1px 2px rgba(15,23,42,0.04)",
        transition: "border-color 120ms, background-color 120ms",
        "&:hover": { borderColor: meta.color },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: meta.color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, color: "text.primary" }}>{meta.label}</Typography>
      </Box>
      <Typography sx={{ fontSize: "1.75rem", fontWeight: 900, lineHeight: 1.15, mt: 0.5, color: meta.color }}>
        {pending ? "—" : count.toLocaleString()}
      </Typography>
      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.25, lineHeight: 1.35 }}>
        {meta.description}
      </Typography>
      <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, color: selected ? meta.color : "text.secondary", mt: 0.75 }}>
        {selected ? "Filtering by this — tap to clear" : "Tap to filter"}
      </Typography>
    </Box>
  );
}

export function CrowdsReportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = defaultLast7Range();
  const [from, setFrom] = useState(() => initial.from);
  const [to, setTo] = useState(() => initial.to);
  const [cameraId, setCameraId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [alertType, setAlertType] = useState<CrowdAlertType | "">("");
  const [hour, setHour] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<RecordsViewMode>("list");

  useEffect(() => {
    const f = searchParams.get("from");
    if (f && ymdRe.test(f)) setFrom(f);
    const t = searchParams.get("to");
    if (t && ymdRe.test(t)) setTo(t);
    if (searchParams.has("cameraId")) setCameraId(searchParams.get("cameraId") ?? "");
    if (searchParams.has("siteName")) setSiteName(searchParams.get("siteName") ?? "");
    if (searchParams.has("alertType")) {
      const at = searchParams.get("alertType") ?? "";
      setAlertType(isCrowdAlertType(at) ? at : "");
    }
    const hRaw = searchParams.get("hour");
    if (hRaw != null && hRaw !== "") {
      const n = Number.parseInt(hRaw, 10);
      setHour(Number.isInteger(n) && n >= 0 && n <= 23 ? n : null);
    } else {
      setHour(null);
    }
  }, [searchParams]);

  const rangeInvalid = ymdRe.test(from) && ymdRe.test(to) && from > to;
  const spanDays = useMemo(() => daysInclusive(from, to), [from, to]);
  const hourActive = hour != null && from === to && !rangeInvalid;

  useEffect(() => {
    if (from !== to && hour != null) setHour(null);
  }, [from, to, hour]);

  const filterKey = useMemo(
    () => ({ from, to, hour: hourActive ? hour : "", cameraId, siteName, alertType }),
    [from, to, hourActive, hour, cameraId, siteName, alertType]
  );
  const queriesEnabled = ymdRe.test(from) && ymdRe.test(to) && !rangeInvalid;

  useEffect(() => {
    setPage(1);
  }, [from, to, hourActive, hour, cameraId, siteName, alertType]);

  const listParams = {
    from,
    to,
    ...(hourActive ? { hour } : {}),
    cameraId: cameraId || undefined,
    siteName: siteName || undefined,
    alertType: alertType || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const q = useQuery<ApiResp, Error>({
    queryKey: ["crowds-report-events", listParams],
    queryFn: async () =>
      (await api.get<ApiResp>("/dashboard/crowds-report-events", { params: listParams })).data,
    refetchInterval: 15_000,
    enabled: queriesEnabled,
  });

  const statsQ = useQuery<RangeStats, Error>({
    queryKey: ["crowds-range-stats", filterKey, spanDays > 1 ? "hourly" : "calendar"],
    queryFn: async () =>
      (
        await api.get<RangeStats>("/dashboard/crowds-range-stats", {
          params: {
            from,
            to,
            ...(hourActive ? { hour } : {}),
            cameraId: cameraId || undefined,
            siteName: siteName || undefined,
            alertType: alertType || undefined,
            ...(spanDays > 1 ? { timelineResolution: "hourly" as const } : {}),
          },
        })
      ).data,
    refetchInterval: 30_000,
    enabled: queriesEnabled,
  });

  const cameraMap = useMemo(() => {
    const fromApi = q.data?.cameraMap ?? {};
    const scoped = Object.fromEntries(crowdZoneFilterOptions().map((z) => [z.id, z.name]));
    return { ...scoped, ...fromApi };
  }, [q.data?.cameraMap]);

  const siteFilterOptions = useMemo(() => crowdSiteFilterOptions(), []);

  const zoneFilterOptions = useMemo(() => crowdZoneFilterOptions(), []);

  const pageCount = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount) setPage(Math.max(1, pageCount));
  }, [page, pageCount]);

  const alertTypeSlices = useMemo(
    () =>
      CROWD_ALERT_TYPES.map((t) => ({
        key: t,
        name: CROWD_ALERT_TYPE_META[t].label,
        value: statsQ.data?.byAlertType?.[t] ?? 0,
        color: CROWD_ALERT_TYPE_META[t].color,
      })).filter((s) => s.value > 0),
    [statsQ.data?.byAlertType]
  );

  const leadingAlertType = useMemo(() => {
    const counts = statsQ.data?.byAlertType;
    if (!counts) return null;
    let best: { type: CrowdAlertType; count: number } | null = null;
    for (const t of CROWD_ALERT_TYPES) {
      const c = counts[t] ?? 0;
      if (c > 0 && (!best || c > best.count)) best = { type: t, count: c };
    }
    return best;
  }, [statsQ.data?.byAlertType]);

  const busiestArea = useMemo(() => {
    const zones = statsQ.data?.zones ?? [];
    return zones.reduce<(typeof zones)[number] | null>((a, z) => (!a || z.alerts > a.alerts ? z : a), null);
  }, [statsQ.data?.zones]);

  const alertTrend = useMemo<AlertTypeStackedPoint[]>(
    () => (statsQ.data?.timeline ?? []).map((p) => alertTypePoint(p.label, p.byAlertType)),
    [statsQ.data?.timeline]
  );

  const zoneBarData = useMemo<AlertTypeStackedPoint[]>(
    () =>
      (statsQ.data?.zones ?? [])
        .filter((z) => z.alerts > 0)
        .map((z) => alertTypePoint(resolveCrowdZoneName(z.camera_id) || z.name || z.camera_id, z.byAlertType)),
    [statsQ.data?.zones]
  );

  const analyticsChipLabel = useMemo(() => {
    if (rangeInvalid) return "Start date must be on or before end date";
    if (!queriesEnabled) return "Enter valid reporting dates";
    if (statsQ.isFetching && !statsQ.data) return SITE_LABELS.retrieving;
    if (!statsQ.data) return SITE_LABELS.retrieving;
    const today = ymdSite();
    const { from: rf, to: rt, total } = statsQ.data;
    const summary = formatLang(SITE_LABELS.overcrowdingAlertsSummary, {
      count: total.toLocaleString(),
      leading: leadingAlertType ? CROWD_ALERT_TYPE_META[leadingAlertType.type].shortLabel : "—",
    });
    const dayLabel = (ymd: string) => (ymd === today ? "Today" : formatChartDayTick(ymd));
    if (hourActive && hour != null && rf === rt) {
      return `${summary} · ${formatHourEndTickFromStart(hour, rf)}`;
    }
    if (rf === rt) return `${dayLabel(rf)} - ${summary}`;
    return `${dayLabel(rf)} to ${dayLabel(rt)} - ${summary}`;
  }, [rangeInvalid, queriesEnabled, statsQ.data, statsQ.isFetching, hourActive, hour, leadingAlertType]);

  const chartsBlocked = !queriesEnabled;
  const hasAlertData = (statsQ.data?.total ?? 0) > 0;
  const listTotal = q.data?.total ?? 0;
  const listRows = q.data?.rows ?? [];
  const toCrowdZoom = useCallback((row: CrowdListRow) => zoomPayloadFromCrowdRow(row), []);
  const imageZoom = useReportImageZoom(listRows, toCrowdZoom);

  return (
    <Box sx={{ ...pageLayoutSx, gap: 2.75 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 2, flexWrap: "wrap" }}>
        <Chip
          icon={<AutoAwesomeIcon />}
          label={SITE_LABELS.crowdsRecordsWorkspace}
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600, textTransform: "none", bgcolor: "rgba(29,78,216,0.06)", borderRadius: 1.5 }}
        />
      </Box>

      <Paper sx={{ p: { xs: 1.75, sm: 2.25 }, ...contentCardSx }}>
        {/* Compact single-row filter bar: inputs keep their natural width and
            Reset is pushed to the far right. */}
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.25 }}>
          <DatePicker
            label="Reporting start"
            format="YYYY-MM-DD"
            value={dayjsInSite(from)}
            onChange={(v) => {
              if (v && v.isValid()) setFrom(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
            }}
            maxDate={dayjsInSite(to)}
            slotProps={{ textField: { size: "small", error: rangeInvalid, sx: filterFieldSx } }}
          />
          <DatePicker
            label="Reporting end"
            format="YYYY-MM-DD"
            value={dayjsInSite(to)}
            onChange={(v) => {
              if (v && v.isValid()) setTo(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
            }}
            minDate={dayjsInSite(from)}
            slotProps={{ textField: { size: "small", error: rangeInvalid, sx: filterFieldSx } }}
          />
          {/* Zone and Site pickers are hidden for this venue — the whole site is
              one scope. The state and query params still work, so a URL like
              ?cameraId=Overview keeps filtering. */}
          {SHOW_ZONE_AND_SITE_FILTERS ? (
            <>
              <TextField
                size="small"
                select
                label="Zone"
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                sx={filterFieldSx}
              >
                <MenuItem value="">All zones</MenuItem>
                {zoneFilterOptions.map(({ id, name }) => (
                  <MenuItem key={id} value={id}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                select
                label="Site"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                sx={filterFieldSx}
              >
                <MenuItem value="">All sites</MenuItem>
                {siteFilterOptions.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </>
          ) : null}
          <TextField
            size="small"
            select
            label="Alert type"
            value={alertType}
            onChange={(e) => setAlertType(isCrowdAlertType(e.target.value) ? e.target.value : "")}
            sx={filterFieldSx}
          >
            <MenuItem value="">All alert types</MenuItem>
            {CROWD_ALERT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {CROWD_ALERT_TYPE_META[t].label}
              </MenuItem>
            ))}
          </TextField>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", ml: { md: "auto" } }}>
              <Button
                variant="outlined"
                size="small"
                sx={{ height: 40, px: 2, whiteSpace: "nowrap" }}
                onClick={() => {
                  const today = ymdSite();
                  setFrom(today);
                  setTo(today);
                  setCameraId("");
                  setSiteName("");
                  setAlertType("");
                  setHour(null);
                  navigate(
                    { pathname: "/crowds-report", search: `?${buildCrowdsReportSearch({ from: today, to: today })}` },
                    { replace: true }
                  );
                }}
              >
                Reset filters
              </Button>
              {q.isFetching ? <CircularProgress size={18} aria-label={SITE_LABELS.overcrowdingRefreshing} /> : null}
          </Box>
        </Box>
      </Paper>

      {}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: `repeat(${CROWD_ALERT_TYPES.length}, minmax(0, 1fr))`,
          },
          gap: 1.5,
        }}
      >
        {CROWD_ALERT_TYPES.map((t) => (
          <AlertTypeTile
            key={t}
            type={t}
            count={statsQ.data?.byAlertType?.[t] ?? 0}
            selected={alertType === t}
            pending={statsQ.isLoading}
            onClick={() => setAlertType((prev) => (prev === t ? "" : t))}
          />
        ))}
      </Box>

      <Paper sx={{ p: { xs: 2, sm: 2.25 }, ...contentCardSx }}>
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="overline" sx={{ fontWeight: 900, color: "text.secondary", letterSpacing: "0.12em" }}>
              {SITE_LABELS.filteredOvercrowdingAnalytics}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              {SITE_LABELS.overcrowdingAlertBreakdown}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.75, color: "text.secondary", maxWidth: 720 }}>
              Each record is a single AI inference alert raised by one of the venue cameras — a security event, or a kitchen staffing problem.
            </Typography>
          </Box>
          <Chip label={analyticsChipLabel} color={rangeInvalid ? "error" : "secondary"} variant="outlined" sx={{ fontWeight: 950 }} />
        </Box>

        <Box
          sx={{
            mt: 2,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: SHOW_AREA_BREAKDOWN ? "repeat(3, 1fr)" : "repeat(2, 1fr)" },
            gap: 1,
          }}
        >
          {statsQ.isLoading ? (
            Array.from({ length: SHOW_AREA_BREAKDOWN ? 3 : 2 }).map((_, i) => (
              <Box key={i} sx={{ height: 52, borderRadius: "8px", bgcolor: "rgba(15,23,42,0.04)" }} />
            ))
          ) : (
            <>
              <SummaryChip label="Alerts" value={(statsQ.data?.total ?? 0).toLocaleString()} />
              <SummaryChip
                label="Most frequent alert"
                value={
                  leadingAlertType
                    ? `${CROWD_ALERT_TYPE_META[leadingAlertType.type].shortLabel} · ${leadingAlertType.count.toLocaleString()}`
                    : "—"
                }
              />
              {SHOW_AREA_BREAKDOWN ? (
                <SummaryChip
                  label="Busiest area"
                  value={busiestArea ? `${busiestArea.name} · ${busiestArea.alerts.toLocaleString()}` : "—"}
                />
              ) : null}
            </>
          )}
        </Box>

        <Box
          sx={{
            mt: 2,
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: SHOW_AREA_BREAKDOWN ? "1fr" : "minmax(0, 1.5fr) minmax(0, 1fr)",
              xl: SHOW_AREA_BREAKDOWN
                ? "minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr)"
                : "minmax(0, 1.5fr) minmax(0, 1fr)",
            },
            gap: 2,
            alignItems: "stretch",
          }}
        >
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1 }}>{SITE_LABELS.overcrowdingAlertTrend}</Typography>
            {chartsBlocked || statsQ.isLoading ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                {chartsBlocked ? (
                  <Typography variant="body2" color="text.secondary">
                    Select valid reporting dates.
                  </Typography>
                ) : (
                  <CircularProgress size={28} />
                )}
              </Box>
            ) : hasAlertData ? (
              <AlertTypeStackedChart
                data={alertTrend}
                variant="area"
                height={220}
                timeScale={statsQ.data?.timelineMode === "hourly" ? "hour" : "day"}
                hourContextYmd={statsQ.data?.timelineMode === "hourly" && from === to ? from : undefined}
                emptyLabel={SITE_LABELS.overcrowdingNoAlerts}
              />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                {SITE_LABELS.overcrowdingNoAlerts}
              </Typography>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1 }}>{SITE_LABELS.overcrowdingBySeverity}</Typography>
            {chartsBlocked || statsQ.isLoading ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                <CircularProgress size={28} />
              </Box>
            ) : alertTypeSlices.length ? (
              <CrowdSeverityPieChart slices={alertTypeSlices} height={240} emptyLabel="No alerts for this selection" />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                {SITE_LABELS.overcrowdingNoAlerts}
              </Typography>
            )}
          </Paper>
          {SHOW_AREA_BREAKDOWN ? (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
              <Typography sx={{ fontWeight: 900, mb: 1 }}>{SITE_LABELS.overcrowdingAlertsByZone}</Typography>
              {chartsBlocked || statsQ.isLoading ? (
                <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                  <CircularProgress size={28} />
                </Box>
              ) : zoneBarData.length ? (
                <AlertTypeStackedChart
                  data={zoneBarData}
                  variant="bar"
                  height={220}
                  emptyLabel={SITE_LABELS.overcrowdingNoAlerts}
                />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                  {SITE_LABELS.overcrowdingNoAlerts}
                </Typography>
              )}
            </Paper>
          ) : null}
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.25 }, ...contentCardSx }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap", pb: 2, borderBottom: "1px solid rgba(15,23,42,0.07)" }}>
          <Box>
            <Typography variant="overline" sx={{ fontWeight: 900, color: "text.secondary", letterSpacing: "0.12em" }}>
              {SITE_LABELS.overcrowdingAlertGrid}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              {SITE_LABELS.overcrowdingAlertEvents}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ fontWeight: 800, color: "text.secondary" }}>
              {listTotal === 0
                ? "0 alerts"
                : `Rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, listTotal)} of ${listTotal.toLocaleString()}`}
            </Typography>
            <RecordsViewToggle value={viewMode} onChange={setViewMode} />
          </Box>
        </Box>

        <Box sx={{ pt: 2 }}>
          {q.isError ? (
            <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
              Unable to load alerts.
            </Alert>
          ) : null}
          {rangeInvalid ? (
            <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>
              The reporting start date cannot be after the end date.
            </Alert>
          ) : null}

          {viewMode === "list" ? (
            <CrowdsEventsListView rows={listRows} cameraMap={cameraMap} onZoomAt={imageZoom.openAt} />
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: gridCols(2), md: gridCols(3) }, gap: { xs: 1.75, md: 2.25 } }}>
              {listRows.map((r, index) => (
                <OvercrowdingAlertCard key={r.id} row={r} cameraMap={cameraMap} onZoomAt={() => imageZoom.openAt(index)} />
              ))}
            </Box>
          )}

          <Box sx={{ display: "flex", justifyContent: "center", pt: 2.5 }}>
            <Pagination count={pageCount} page={page} onChange={(_, p) => setPage(p)} color="primary" shape="rounded" showFirstButton showLastButton />
          </Box>
        </Box>
      </Paper>

      <ImageZoomDialog
        open={imageZoom.open}
        payload={imageZoom.payload}
        onClose={imageZoom.close}
        onPrevious={imageZoom.goPrevious}
        onNext={imageZoom.goNext}
        hasPrevious={imageZoom.hasPrevious}
        hasNext={imageZoom.hasNext}
        title={SITE_LABELS.overcrowdingAlertImage}
      />
    </Box>
  );
}

function OvercrowdingAlertCard({
  row,
  cameraMap,
  onZoomAt,
}: {
  row: CrowdListRow;
  cameraMap: Record<string, string>;
  onZoomAt: () => void;
}) {
  const imageUrl = receiverImageUrl(row.image_path);
  const iconShell = {
    position: "absolute" as const,
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    padding: 0,
    borderRadius: "10px",
    zIndex: 2,
    bgcolor: "rgba(255,255,255,0.92)",
    color: "primary.main",
    border: "1px solid rgba(15,23,42,0.08)",
  };

  return (
    <Paper elevation={0} variant="outlined" sx={{ overflow: "hidden", borderRadius: "10px" }}>
      <Box sx={{ position: "relative", bgcolor: "#0b1220" }}>
        {imageUrl ? (
          <img src={imageUrl} alt="Alert capture" style={{ width: "100%", height: 156, objectFit: "cover", display: "block" }} />
        ) : (
          <Box sx={{ height: 156, display: "grid", placeItems: "center", color: "grey.500", fontWeight: 700 }}>
            No capture image
          </Box>
        )}
        {imageUrl ? (
          <IconButton onClick={onZoomAt} size="small" title="Zoom image" sx={iconShell}>
            <ZoomInIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : null}
      </Box>
      <Box sx={{ p: 2, pt: 1.75 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 900, fontSize: "1.05rem" }}>
            {isCrowdAlertType(row.alert_type) ? CROWD_ALERT_TYPE_META[row.alert_type].shortLabel : "Alert"}
          </Typography>
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              height: 20,
              px: 1.1,
              borderRadius: 999,
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: crowdAlertTypeColor(row.alert_type).color,
              bgcolor: crowdAlertTypeColor(row.alert_type).softColor,
              border: `1px solid ${crowdAlertTypeColor(row.alert_type).color}33`,
            }}
          >
            {crowdAlertTypeLabel(row.alert_type)}
          </Box>
        </Box>
        <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700, color: "text.secondary" }}>
          {isCrowdAlertType(row.alert_type) ? CROWD_ALERT_TYPE_META[row.alert_type].description : "AI inference alert"}
        </Typography>
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(15,23,42,0.07)" }}>
          {/* Zone is hidden for this single-area venue — see SHOW_ZONE_ROW. */}
          {SHOW_ZONE_ROW ? (
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>Zone</Typography>
              <Typography variant="caption" sx={{ fontWeight: 800 }}>{(cameraMap[row.camera_id] ?? resolveCrowdZoneName(row.camera_id)) || "—"}</Typography>
            </Box>
          ) : null}
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: SHOW_ZONE_ROW ? 1 : 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>Site</Typography>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>{row.site_name || "—"}</Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>Alerted at</Typography>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>{formatPeopleReportDisplayTime(row.trigger_date)}</Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
