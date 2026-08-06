import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Pagination,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import { api } from "../lib/api";
import { contentCardSx, gridCols, pageLayoutSx } from "../lib/uiSurfaces";
import { daysInclusive, defaultLast7Range } from "../lib/dashboardRange";
import {
  SITE_TIMEZONE,
  dayjsInSite,
  formatChartDayTick,
  formatHourEndTickFromStart,
  formatPeopleReportDisplayTime,
  ymdSite,
} from "../lib/siteTimeZone";
import { TrafficAreaChart } from "../components/charts/TrafficAreaChart";
import { CameraBarChart } from "../components/charts/CameraBarChart";
import { RecordsViewToggle, type RecordsViewMode } from "../components/RecordsViewToggle";
import { CrowdsEventsListView, type CrowdListRow } from "../components/CrowdsEventsListView";
import { ImageZoomDialog } from "../components/ImageZoomDialog";
import { useReportImageZoom } from "../lib/useReportImageZoom";
import { zoomPayloadFromCrowdRow } from "../lib/eventImageZoom";
import { receiverImageUrl } from "../lib/receiverImageUrl";
import { CROWD_ALERT_TYPE_META, crowdAlertTypeColor } from "../lib/crowdAlertTypes";
import { pnp } from "../lib/pnpTheme";

/**
 * Displayed as "Kitchen Unattended". Reports the records the pipeline writes
 * when no staff is detected in the kitchen. They live in `crowds` under a single
 * alert type, so this page is a scoped view of the endpoints the Active Alerts
 * page already uses.
 *
 * The file, component and query keys still say "chef presence" — the module was
 * renamed, the identifiers were left alone to keep the rename to one diff.
 */
const ALERT_TYPE = "unattended_kitchen" as const;
const META = CROWD_ALERT_TYPE_META[ALERT_TYPE];

const PAGE_SIZE = 24;
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const filterFieldSx = { width: { xs: "100%", sm: 176 } } as const;

// The "By time of day" chart already covers this, so the chip is hidden.
// Flip to true to bring it back.
const SHOW_BUSIEST_HOUR = false;

type RangeStats = {
  total: number;
  byHourOfDay?: { hour: number; total: number }[];
  peakHour?: { hour: number; total: number };
  timeline: { label: string; total: number }[];
  timelineMode?: "hourly" | "daily";
};

type EventsResp = {
  rows: CrowdListRow[];
  total: number;
  page: number;
  pageSize: number;
  cameraMap: Record<string, string>;
};

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
      <Typography
        sx={{
          fontSize: "0.6875rem",
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: "1rem", fontWeight: 800, mt: 0.25, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

export function ChefPresencePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = defaultLast7Range();
  const [from, setFrom] = useState(() => initial.from);
  const [to, setTo] = useState(() => initial.to);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<RecordsViewMode>("list");

  useEffect(() => {
    const f = searchParams.get("from");
    if (f && ymdRe.test(f)) setFrom(f);
    const t = searchParams.get("to");
    if (t && ymdRe.test(t)) setTo(t);
  }, [searchParams]);

  const rangeInvalid = ymdRe.test(from) && ymdRe.test(to) && from > to;
  const queriesEnabled = ymdRe.test(from) && ymdRe.test(to) && !rangeInvalid;
  const spanDays = useMemo(() => daysInclusive(from, to), [from, to]);
  const timelineResolution = spanDays > 1 ? "hourly" : undefined;

  useEffect(() => {
    setPage(1);
  }, [from, to]);

  const statsQ = useQuery<RangeStats, Error>({
    queryKey: ["chef-presence", "stats", from, to, timelineResolution ?? "calendar"],
    queryFn: async () =>
      (
        await api.get<RangeStats>("/dashboard/crowds-range-stats", {
          params: { from, to, alertType: ALERT_TYPE, ...(timelineResolution ? { timelineResolution } : {}) },
        })
      ).data,
    enabled: queriesEnabled,
    refetchInterval: 30_000,
  });

  const eventsQ = useQuery<EventsResp, Error>({
    queryKey: ["chef-presence", "events", from, to, page],
    queryFn: async () =>
      (
        await api.get<EventsResp>("/dashboard/crowds-report-events", {
          params: { from, to, alertType: ALERT_TYPE, page, pageSize: PAGE_SIZE },
        })
      ).data,
    enabled: queriesEnabled,
    refetchInterval: 15_000,
  });

  const statsPending = statsQ.isPending && !statsQ.data;
  const eventsPending = eventsQ.isPending && !eventsQ.data;

  const total = statsQ.data?.total ?? 0;

  const gapTrend = useMemo(
    () => (statsQ.data?.timeline ?? []).map((p) => ({ name: p.label, total: p.total })),
    [statsQ.data?.timeline]
  );

  const hourBarData = useMemo(
    () =>
      (statsQ.data?.byHourOfDay ?? [])
        .filter((slot) => slot.total > 0)
        .map((slot) => ({
          name: formatHourEndTickFromStart(slot.hour, from === to ? from : undefined),
          total: slot.total,
        })),
    [statsQ.data?.byHourOfDay, from, to]
  );

  const busiestHourLabel = useMemo(() => {
    const peak = statsQ.data?.peakHour;
    if (!peak || peak.total <= 0) return "—";
    return `${formatHourEndTickFromStart(peak.hour, from === to ? from : undefined)} (${peak.total})`;
  }, [statsQ.data?.peakHour, from, to]);

  const busiestDayLabel = useMemo(() => {
    const points = statsQ.data?.timeline ?? [];
    if (!points.length || total === 0) return "—";

    // A single-day range comes back as hourly buckets labelled "HH:00" with no
    // date, so there is only one day to report on.
    if (from === to) return `${formatChartDayTick(from)} (${total})`;

    const perDay = new Map<string, number>();
    for (const point of points) {
      const day = /^(\d{4}-\d{2}-\d{2})/.exec(point.label)?.[1];
      if (!day) continue;
      perDay.set(day, (perDay.get(day) ?? 0) + point.total);
    }
    let best: { day: string; total: number } | null = null;
    for (const [day, value] of perDay) {
      if (value > 0 && (!best || value > best.total)) best = { day, total: value };
    }
    return best ? `${formatChartDayTick(best.day)} (${best.total})` : "—";
  }, [statsQ.data?.timeline, total, from, to]);

  const listRows = eventsQ.data?.rows ?? [];
  const listTotal = eventsQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount) setPage(Math.max(1, pageCount));
  }, [page, pageCount]);

  const cameraMap = eventsQ.data?.cameraMap ?? {};
  const toCrowdZoom = useCallback((row: CrowdListRow) => zoomPayloadFromCrowdRow(row), []);
  const imageZoom = useReportImageZoom(listRows, toCrowdZoom);

  const analyticsChipLabel = useMemo(() => {
    if (rangeInvalid) return "Start date must be on or before end date";
    if (!queriesEnabled) return "Enter valid reporting dates";
    if (statsPending) return "Loading…";
    const today = ymdSite();
    const dayLabel = (ymd: string) => (ymd === today ? "Today" : formatChartDayTick(ymd));
    const summary = `${total.toLocaleString()} record${total === 1 ? "" : "s"}`;
    if (from === to) return `${dayLabel(from)} - ${summary}`;
    return `${dayLabel(from)} to ${dayLabel(to)} - ${summary}`;
  }, [rangeInvalid, queriesEnabled, statsPending, total, from, to]);

  const chartsBlocked = !queriesEnabled;

  return (
    <Box sx={{ ...pageLayoutSx, gap: 2.75 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 2, flexWrap: "wrap" }}>
        <Chip
          icon={<AutoAwesomeIcon />}
          label="Kitchen Unattended"
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600, textTransform: "none", bgcolor: "rgba(29,78,216,0.06)", borderRadius: 1.5 }}
        />
      </Box>

      <Paper sx={{ p: { xs: 1.75, sm: 2.25 }, ...contentCardSx }}>
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
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", ml: { md: "auto" } }}>
            <Button
              variant="outlined"
              size="small"
              sx={{ height: 40, px: 2, whiteSpace: "nowrap" }}
              onClick={() => {
                const today = ymdSite();
                setFrom(today);
                setTo(today);
                navigate({ pathname: "/watchlists", search: `?from=${today}&to=${today}` }, { replace: true });
              }}
            >
              Reset filters
            </Button>
            {eventsQ.isFetching && queriesEnabled ? <CircularProgress size={18} aria-label="Refreshing records" /> : null}
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 2.25 }, ...contentCardSx }}>
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="overline" sx={{ fontWeight: 900, color: "text.secondary", letterSpacing: "0.12em" }}>
              Kitchen unattended analytics
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              Unattended kitchen — when and how often
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.75, color: "text.secondary", maxWidth: 720 }}>
              A record is created every time the cameras detect no staff in the kitchen.
            </Typography>
          </Box>
          <Chip label={analyticsChipLabel} color={rangeInvalid ? "error" : "secondary"} variant="outlined" sx={{ fontWeight: 950 }} />
        </Box>

        <Box
          sx={{
            mt: 2,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: SHOW_BUSIEST_HOUR ? "repeat(3, 1fr)" : "repeat(2, 1fr)" },
            gap: 1,
          }}
        >
          {statsPending ? (
            Array.from({ length: SHOW_BUSIEST_HOUR ? 3 : 2 }).map((_, i) => (
              <Box key={i} sx={{ height: 52, borderRadius: "8px", bgcolor: "rgba(15,23,42,0.04)" }} />
            ))
          ) : (
            <>
              <SummaryChip label="Times unattended" value={total.toLocaleString()} />
              {SHOW_BUSIEST_HOUR ? <SummaryChip label="Busiest hour" value={busiestHourLabel} /> : null}
              <SummaryChip label="Worst day" value={busiestDayLabel} />
            </>
          )}
        </Box>

        <Box
          sx={{
            mt: 2,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.5fr) minmax(0, 1fr)" },
            gap: 2,
            alignItems: "stretch",
          }}
        >
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>Unattended trend</Typography>
            {chartsBlocked ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center", px: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  {rangeInvalid
                    ? "Correct the reporting interval so the start date is on or before the end date."
                    : "Select valid reporting dates to load this chart."}
                </Typography>
              </Box>
            ) : statsPending ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <TrafficAreaChart
                data={gapTrend}
                height={240}
                id="chef-presence-trend"
                timeScale={statsQ.data?.timelineMode === "hourly" ? "hour" : "day"}
                hourContextYmd={statsQ.data?.timelineMode === "hourly" && from === to ? from : undefined}
              />
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>By time of day</Typography>
            {chartsBlocked || statsPending ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                <CircularProgress size={28} />
              </Box>
            ) : hourBarData.length ? (
              <CameraBarChart data={hourBarData} height={240} />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                No records for this period
              </Typography>
            )}
          </Paper>
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.25 }, ...contentCardSx }}>
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
              Unattended log
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              Unattended kitchen records
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ fontWeight: 800, color: "text.secondary" }}>
              {listTotal === 0
                ? "0 records"
                : `Rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, listTotal)} of ${listTotal.toLocaleString()}`}
            </Typography>
            <RecordsViewToggle value={viewMode} onChange={setViewMode} />
          </Box>
        </Box>

        <Box sx={{ pt: 2 }}>
          {eventsQ.isError ? (
            <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
              Unable to load unattended kitchen records.
            </Alert>
          ) : null}
          {rangeInvalid ? (
            <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>
              The reporting start date cannot be after the end date.
            </Alert>
          ) : null}

          {queriesEnabled && eventsPending ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={44} sx={{ borderRadius: "8px" }} />
              ))}
            </Box>
          ) : null}

          {!eventsPending && queriesEnabled && listRows.length === 0 && !eventsQ.isError ? (
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
              <Typography variant="subtitle1" sx={{ fontWeight: 900, color: "text.primary" }}>
                The kitchen was never left unattended
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 650, color: "text.secondary", mt: 1, maxWidth: 420, mx: "auto" }}>
                No records in this reporting window. Widen the dates to look further back.
              </Typography>
            </Box>
          ) : null}

          {!eventsPending && listRows.length > 0 ? (
            viewMode === "list" ? (
              <CrowdsEventsListView rows={listRows} cameraMap={cameraMap} onZoomAt={imageZoom.openAt} />
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: gridCols(2), md: gridCols(3) },
                  gap: { xs: 1.75, md: 2.25 },
                  alignItems: "stretch",
                }}
              >
                {listRows.map((row, index) => (
                  <ChefPresenceCard key={row.id} row={row} onZoomAt={() => imageZoom.openAt(index)} />
                ))}
              </Box>
            )
          ) : null}

          {pageCount > 1 ? (
            <Box sx={{ display: "flex", justifyContent: "center", pt: 2.5 }}>
              <Pagination count={pageCount} page={page} onChange={(_, p) => setPage(p)} color="primary" />
            </Box>
          ) : null}
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
        title="Alert capture"
      />
    </Box>
  );
}

function ChefPresenceCard({ row, onZoomAt }: { row: CrowdListRow; onZoomAt: () => void }) {
  const imageUrl = receiverImageUrl(row.image_path);
  const tone = crowdAlertTypeColor(ALERT_TYPE);

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
          <Button
            onClick={onZoomAt}
            size="small"
            title="Zoom image"
            sx={{ position: "absolute", top: 8, right: 8, minWidth: 0, p: 0.75, bgcolor: "rgba(15,23,42,0.6)", color: "#fff" }}
          >
            <ZoomInIcon sx={{ fontSize: 18 }} />
          </Button>
        ) : null}
      </Box>
      <Box sx={{ p: 2, pt: 1.75 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 900, fontSize: "1.05rem" }}>{META.label}</Typography>
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
              color: tone.color,
              bgcolor: tone.softColor,
              border: `1px solid ${tone.color}33`,
            }}
          >
            {META.shortLabel}
          </Box>
        </Box>
        <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700, color: "text.secondary" }}>
          {META.description}
        </Typography>
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(15,23,42,0.07)" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: pnp.textSecondary }}>
              Site
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>
              {row.site_name || "—"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: pnp.textSecondary }}>
              Detected at
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>
              {formatPeopleReportDisplayTime(row.trigger_date)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
