import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
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
  Skeleton,
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
import { buildWalkinsReportSearch } from "../lib/walkinsReportNav";
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
import { CrowdSeverityPieChart } from "../components/charts/CrowdSeverityPieChart";
import {
  WALKIN_GENDERS,
  WALKIN_GENDER_META,
  isWalkinGender,
  type WalkinGender,
} from "../lib/walkinGender";
import { RecordsViewToggle, type RecordsViewMode } from "../components/RecordsViewToggle";
import { WalkinsEventsListView, type WalkinListRow } from "../components/WalkinsEventsListView";
import { zoomPayloadFromWalkinRow } from "../lib/eventImageZoom";
import {
  walkinSiteFilterOptions,
  walkinEntranceFilterOptions,
} from "../lib/reportFilterScopes";
import { receiverImageUrl } from "../lib/receiverImageUrl";

type ApiResp = {
  rows: WalkinListRow[];
  total: number;
  page: number;
  pageSize: number;
  cameraMap: Record<string, string>;
  siteMap: Record<string, string>;
};

type RangeStats = {
  from: string;
  to: string;
  spanDays: number;
  timelineMode?: "hourly" | "daily";
  total: number;
  byHourOfDay: { hour: number; total: number }[];
  peakHour: { hour: number; total: number };
  activeEntrances: number;
  byGender?: Record<WalkinGender, number>;
  cameras: { camera_id: string; name: string; total: number }[];
  siteMap: Record<string, string>;
  timeline: { label: string; total: number }[];
};

const PAGE_SIZE = 24;
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

// Single-venue deployment: every walk-in belongs to the same site, so the picker
// is hidden. Flip to true to bring it back.
const SHOW_SITE_FILTER = false;
const SHOW_GENDER_FILTER = false;
const SHOW_GENDER_DONUT = false;

// Keeps the filter bar on one compact row instead of stretching each control.
const filterFieldSx = { width: { xs: "100%", sm: 176 } } as const;

export function WalkinsReportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = defaultLast7Range();
  const [from, setFrom] = useState(() => initial.from);
  const [to, setTo] = useState(() => initial.to);
  const [cameraId, setCameraId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [gender, setGender] = useState<WalkinGender | "">("");
  const [hour, setHour] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<RecordsViewMode>("list");

  useEffect(() => {
    const f = searchParams.get("from");
    if (f && ymdRe.test(f)) setFrom(f);
    const t = searchParams.get("to");
    if (t && ymdRe.test(t)) setTo(t);
    if (searchParams.has("cameraId")) setCameraId(searchParams.get("cameraId") ?? "");
    if (searchParams.has("siteId")) setSiteId(searchParams.get("siteId") ?? "");
    if (searchParams.has("gender")) {
      const g = searchParams.get("gender") ?? "";
      setGender(isWalkinGender(g) ? g : "");
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
    () => ({ from, to, hour: hourActive ? hour : "", cameraId, siteId, gender }),
    [from, to, hourActive, hour, cameraId, siteId, gender]
  );

  const queriesEnabled = ymdRe.test(from) && ymdRe.test(to) && !rangeInvalid;

  useEffect(() => {
    setPage(1);
  }, [from, to, hourActive, hour, cameraId, siteId, gender]);

  const listParams = {
    from,
    to,
    ...(hourActive ? { hour } : {}),
    cameraId: cameraId || undefined,
    siteId: siteId || undefined,
    gender: gender || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const q = useQuery<ApiResp, Error>({
    queryKey: ["walkins-report-events", listParams],
    queryFn: async () =>
      (await api.get<ApiResp>("/dashboard/walkins-report-events", { params: listParams })).data,
    refetchInterval: 15_000,
    enabled: queriesEnabled,
  });

  const cameraMap = useMemo(() => {
    const scoped = Object.fromEntries(walkinEntranceFilterOptions().map((e) => [e.id, e.name]));
    return { ...scoped, ...(q.data?.cameraMap ?? {}) };
  }, [q.data?.cameraMap]);

  const statsQ = useQuery<RangeStats, Error>({
    queryKey: ["walkins-range-stats", filterKey, spanDays > 1 ? "hourly" : "calendar"],
    queryFn: async () =>
      (
        await api.get<RangeStats>("/dashboard/walkins-range-stats", {
          params: {
            from,
            to,
            ...(hourActive ? { hour } : {}),
            cameraId: cameraId || undefined,
            siteId: siteId || undefined,
            gender: gender || undefined,
            ...(spanDays > 1 ? { timelineResolution: "hourly" as const } : {}),
          },
        })
      ).data,
    refetchInterval: 30_000,
    enabled: queriesEnabled,
  });

  const genderSlices = useMemo(
    () =>
      WALKIN_GENDERS.map((g) => ({
        key: g,
        name: WALKIN_GENDER_META[g].label,
        value: statsQ.data?.byGender?.[g] ?? 0,
        color: WALKIN_GENDER_META[g].color,
      })).filter((s) => s.value > 0),
    [statsQ.data?.byGender]
  );

  const siteFilterOptions = useMemo(() => walkinSiteFilterOptions(), []);

  const cameraFilterOptions = useMemo(() => walkinEntranceFilterOptions(), []);

  const pageCount = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(Math.max(1, pageCount));
  }, [page, pageCount]);

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

  const trafficPoints = useMemo(
    () => (statsQ.data?.timeline ?? []).map((p) => ({ name: p.label, total: p.total })),
    [statsQ.data?.timeline]
  );

  const cameraBarData = useMemo(
    () =>
      (statsQ.data?.cameras ?? [])
        .filter((c) => (c.total ?? 0) > 0)
        .map((c) => ({ name: c.name, total: c.total })),
    [statsQ.data?.cameras]
  );

  const analyticsChipLabel = useMemo(() => {
    if (rangeInvalid) return "Start date must be on or before end date";
    if (!queriesEnabled) return "Enter valid reporting dates";
    if (statsQ.isFetching && !statsQ.data) return "Retrieving…";
    if (!statsQ.data) return "Retrieving…";
    const today = ymdSite();
    const { from: rf, to: rt, total } = statsQ.data;
    const n = `${total.toLocaleString()} walk-ins`;
    const dayLabel = (ymd: string) => (ymd === today ? "Today" : formatChartDayTick(ymd));
    if (hourActive && hour != null && rf === rt) {
      return formatLang(SITE_LABELS.hourSlotReads, {
        count: n,
        hour: formatHourEndTickFromStart(hour, rf),
      }).replace("reads", "walk-ins");
    }
    if (rf === rt) return `${dayLabel(rf)} - ${n}`;
    return `${dayLabel(rf)} to ${dayLabel(rt)} - ${n}`;
  }, [rangeInvalid, queriesEnabled, statsQ.data, statsQ.isFetching, hourActive, hour]);

  const chartsBlocked = !queriesEnabled;
  const listTotal = q.data?.total ?? 0;
  const listRows = q.data?.rows ?? [];

  const toWalkinZoom = useCallback((row: WalkinListRow) => zoomPayloadFromWalkinRow(row), []);
  const imageZoom = useReportImageZoom(listRows, toWalkinZoom);

  return (
    <Box sx={{ ...pageLayoutSx, gap: 2.75 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 2, flexWrap: "wrap" }}>
        <Chip
          icon={<AutoAwesomeIcon />}
          label={SITE_LABELS.walkinsRecordsWorkspace}
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600, textTransform: "none", bgcolor: "rgba(29,78,216,0.06)", borderRadius: 1.5 }}
        />
      </Box>

      <Paper sx={{ p: { xs: 1.75, sm: 2.25 }, ...contentCardSx }}>
        {/* Compact single-row filter bar: inputs keep their natural width and
            Reset is pushed to the far right. */}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            gap: 1.25,
          }}
        >
          <DatePicker
            label="Reporting start"
            format="YYYY-MM-DD"
            value={dayjsInSite(from)}
            onChange={(v) => {
              if (v && v.isValid()) setFrom(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
            }}
            maxDate={dayjsInSite(to)}
            slotProps={{
              textField: {
                size: "small",
                error: rangeInvalid,
                helperText: rangeInvalid ? "Must be on or before the end date" : undefined,
                sx: filterFieldSx,
              },
            }}
          />
          <DatePicker
            label="Reporting end"
            format="YYYY-MM-DD"
            value={dayjsInSite(to)}
            onChange={(v) => {
              if (v && v.isValid()) setTo(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
            }}
            minDate={dayjsInSite(from)}
            slotProps={{
              textField: {
                size: "small",
                error: rangeInvalid,
                helperText: rangeInvalid ? "Must be on or after the start date" : undefined,
                sx: filterFieldSx,
              },
            }}
          />
          <TextField
            size="small"
            select
            label="Entrance"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            sx={filterFieldSx}
          >
            <MenuItem value="">All entrances</MenuItem>
            {cameraFilterOptions.map(({ id, name }) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          {/* Site picker is hidden for this single-venue deployment — the state and
              ?siteId= query param still work. */}
          {SHOW_SITE_FILTER ? (
            <TextField
              size="small"
              select
              label="Site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              sx={filterFieldSx}
            >
              <MenuItem value="">All sites</MenuItem>
              {siteFilterOptions.map(({ id, name }) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          {/* Gender picker is hidden for now — the state, the ?gender= query param
              and the "By gender" donut all still work. */}
          {SHOW_GENDER_FILTER ? (
            <TextField
              size="small"
              select
              label="Gender"
              value={gender}
              onChange={(e) => setGender(isWalkinGender(e.target.value) ? e.target.value : "")}
              sx={filterFieldSx}
            >
              <MenuItem value="">All genders</MenuItem>
              {WALKIN_GENDERS.map((g) => (
                <MenuItem key={g} value={g}>
                  {WALKIN_GENDER_META[g].label}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

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
                  setSiteId("");
                  setGender("");
                  setHour(null);
                  navigate(
                    {
                      pathname: "/walkins-report",
                      search: `?${buildWalkinsReportSearch({ from: today, to: today })}`,
                    },
                    { replace: true }
                  );
                }}
              >
                Reset filters
              </Button>
              {q.isFetching ? <CircularProgress size={18} aria-label="Refreshing walk-in list" /> : null}
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 2.25 }, ...contentCardSx }}>
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="overline" sx={{ fontWeight: 900, color: "text.secondary", letterSpacing: "0.12em" }}>
              {SITE_LABELS.filteredWalkinAnalytics}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              {SITE_LABELS.walkinThroughputGenderEntrance}
            </Typography>
            {hourActive && hour != null ? (
              <Chip
                size="small"
                label={formatHourEndTickFromStart(hour, from)}
                onDelete={() => {
                  setHour(null);
                  navigate(
                    {
                      pathname: "/walkins-report",
                      search: `?${buildWalkinsReportSearch({
                        from,
                        to,
                        cameraId: cameraId || undefined,
                        siteId: siteId ? Number(siteId) : undefined,
                      })}`,
                    },
                    { replace: true }
                  );
                }}
                sx={{ mt: 1, fontWeight: 800 }}
              />
            ) : null}
          </Box>
          <Chip
            label={analyticsChipLabel}
            color={rangeInvalid ? "error" : "secondary"}
            variant="outlined"
            sx={{ fontWeight: 950 }}
          />
        </Box>

        <Box
          sx={{
            mt: 2,
            display: "grid",
            // Columns follow however many charts are visible, so hiding one does
            // not leave a half-empty row. The trend chart takes the wider slot.
            gridTemplateColumns: {
              xs: "1fr",
              lg: SHOW_GENDER_DONUT ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
              xl: SHOW_GENDER_DONUT
                ? "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)"
                : "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr)",
            },
            gap: 2,
            alignItems: "stretch",
          }}
        >
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>{SITE_LABELS.walkinTrend}</Typography>
            {chartsBlocked ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center", px: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  {rangeInvalid
                    ? "Correct the reporting interval so the start date is on or before the end date."
                    : "Select valid reporting dates to load this chart."}
                </Typography>
              </Box>
            ) : statsQ.isLoading ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <TrafficAreaChart
                data={trafficPoints}
                height={220}
                id="walkins-report-range"
                timeScale={statsQ.data?.timelineMode === "hourly" ? "hour" : "day"}
                hourContextYmd={statsQ.data?.timelineMode === "hourly" && from === to ? from : undefined}
              />
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>{SITE_LABELS.walkinsByGender}</Typography>
            {chartsBlocked ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center", px: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  {rangeInvalid
                    ? "Correct the reporting interval so the start date is on or before the end date."
                    : "Select valid reporting dates to load this chart."}
                </Typography>
              </Box>
            ) : statsQ.isLoading ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <CameraBarChart data={hourBarData} height={220} />
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>{SITE_LABELS.walkinsByEntrance}</Typography>
            {chartsBlocked ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center", px: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  {rangeInvalid
                    ? "Correct the reporting interval so the start date is on or before the end date."
                    : "Select valid reporting dates to load this chart."}
                </Typography>
              </Box>
            ) : statsQ.isLoading ? (
              <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <CameraBarChart data={cameraBarData} height={220} />
            )}
          </Paper>
          {/* Gender donut is hidden for now — genderSlices and the server's
              byGender counts are still wired up. */}
          {SHOW_GENDER_DONUT ? (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
              <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>By gender</Typography>
              {chartsBlocked ? (
                <Box sx={{ height: 200, display: "grid", placeItems: "center", px: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                    {rangeInvalid
                      ? "Correct the reporting interval so the start date is on or before the end date."
                      : "Select valid reporting dates to load this chart."}
                  </Typography>
                </Box>
              ) : statsQ.isLoading ? (
                <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                  <CircularProgress size={28} />
                </Box>
              ) : (
                <CrowdSeverityPieChart slices={genderSlices} height={240} emptyLabel="No walk-ins for this selection" />
              )}
            </Paper>
          ) : null}
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
              {SITE_LABELS.walkinEventGrid}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              {SITE_LABELS.walkinCaptureEvents}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ fontWeight: 800, color: "text.secondary" }}>
              {listTotal === 0
                ? "0 walk-in events"
                : `Rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, listTotal)} of ${listTotal.toLocaleString()}`}
            </Typography>
            <RecordsViewToggle value={viewMode} onChange={setViewMode} />
          </Box>
        </Box>

        <Box sx={{ pt: 2 }}>
          {q.isError ? (
            <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
              Unable to load walk-in events.{" "}
              {isAxiosError(q.error) && q.error.response?.data && typeof q.error.response.data === "object"
                ? JSON.stringify(q.error.response.data)
                : q.error instanceof Error
                  ? q.error.message
                  : "Verify sign-in and network connectivity, then retry."}
            </Alert>
          ) : null}
          {rangeInvalid ? (
            <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>
              The reporting start date cannot be after the end date.
            </Alert>
          ) : null}

          {queriesEnabled && q.isFetching && !q.data ? (
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

          {!q.isFetching && queriesEnabled && q.isSuccess && listRows.length === 0 && !q.isError ? (
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
                No walk-ins match the current criteria
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 650, color: "text.secondary", mt: 1, maxWidth: 420, mx: "auto" }}>
                Broaden the reporting window or clear entrance and site filters. Summary charts above still reflect the
                same interval and filters.
              </Typography>
            </Box>
          ) : null}

          {viewMode === "list" ? (
            <WalkinsEventsListView rows={listRows} cameraMap={cameraMap} onZoomAt={imageZoom.openAt} />
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: gridCols(2), md: gridCols(3) },
                gap: { xs: 1.75, md: 2.25 },
                alignItems: "stretch",
              }}
            >
              {listRows.map((r, index) => (
                <Box key={r.id}>
                  <WalkinCard row={r} cameraMap={cameraMap} onZoomAt={() => imageZoom.openAt(index)} />
                </Box>
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
              disabled={q.isLoading || chartsBlocked}
            />
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
        title={SITE_LABELS.walkinCaptureImage}
      />
    </Box>
  );
}

function WalkinCard({
  row,
  cameraMap,
  onZoomAt,
}: {
  row: WalkinListRow;
  cameraMap: Record<string, string>;
  onZoomAt: () => void;
}) {
  const imageUrl = receiverImageUrl(row.image_path);

  const iconShell = {
    position: "absolute" as const,
    top: 10,
    width: 34,
    height: 34,
    padding: 0,
    borderRadius: "10px",
    zIndex: 2,
    bgcolor: "rgba(255,255,255,0.92)",
    color: "primary.main",
    border: "1px solid rgba(15,23,42,0.08)",
    backdropFilter: "blur(8px)",
    boxShadow: "0 6px 18px rgba(2,6,23,0.12)",
    "&:hover": { bgcolor: "#fff", color: "primary.dark" },
  };

  return (
    <Paper
      elevation={0}
      variant="outlined"
      className="vsp-event-card"
      sx={{
        overflow: "hidden",
        position: "relative",
        borderRadius: "10px",
        bgcolor: "rgba(255,255,255,0.96)",
        borderColor: "rgba(15, 23, 42, 0.08)",
        boxShadow: "0 10px 32px rgba(2, 6, 23, 0.06)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease",
        "&:hover": {
          boxShadow: "0 16px 44px rgba(2,6,23,0.1)",
          transform: "translateY(-2px)",
          borderColor: "rgba(29, 78, 216, 0.18)",
        },
      }}
    >
      <Box sx={{ position: "relative", bgcolor: "#0b1220" }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Walk-in capture"
            style={{ width: "100%", height: 156, objectFit: "cover", objectPosition: "top", display: "block" }}
          />
        ) : (
          <Box
            sx={{
              height: 156,
              display: "grid",
              placeItems: "center",
              bgcolor: "grey.900",
              color: "grey.500",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            No capture image on file
          </Box>
        )}

        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 48,
            background: "linear-gradient(180deg, transparent, rgba(2,6,23,0.55))",
            pointerEvents: "none",
          }}
        />

        {imageUrl ? (
          <IconButton
            onClick={() => {
              const payload = zoomPayloadFromWalkinRow(row);
              if (payload) onZoomAt();
            }}
            size="small"
            title="Zoom image"
            sx={{ ...iconShell, right: 10 }}
          >
            <ZoomInIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : null}
      </Box>

      <Box sx={{ p: 2, pt: 1.75 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Typography sx={{ fontWeight: 900, fontSize: "1.05rem", letterSpacing: "-0.02em", color: "text.primary" }}>
            Walk-in #{row.id}
          </Typography>
        </Box>

        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(15,23,42,0.07)" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
              Entrance
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", textAlign: "right" }}>
              {(cameraMap[row.camera_id] ?? row.camera_id) || "—"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
              Site
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", textAlign: "right" }}>
              {row.site_name || `Site ${row.site_id}`}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
              Detected at
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", textAlign: "right" }}>
              {formatPeopleReportDisplayTime(row.trigger_date)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
