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
import FlipIcon from "@mui/icons-material/Flip";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { ImageZoomDialog } from "../components/ImageZoomDialog";
import { useReportImageZoom } from "../lib/useReportImageZoom";
import { api } from "../lib/api";
import { contentCardSx, gridCols, pageLayoutSx } from "../lib/uiSurfaces";
import { SITE_LABELS, formatLang } from "../i18n/lang";
import { daysInclusive } from "../lib/dashboardRange";
import { buildVehicleReportSearch } from "../lib/vehicleReportNav";
import {
  SITE_TIMEZONE,
  dayjsInSite,
  formatChartDayTick,
  formatHourEndTickFromStart,
  formatVehicleEventDisplayTime,
  ymdSite,
} from "../lib/siteTimeZone";
import { TrafficAreaChart } from "../components/charts/TrafficAreaChart";
import { CameraBarChart } from "../components/charts/CameraBarChart";
import { VehicleMixPieChart, VEHICLE_MIX_PIE_COLORS } from "../components/charts/VehicleMixPieChart";
import { useCameras } from "../hooks/useCameras";
import { RecordsViewToggle, type RecordsViewMode } from "../components/RecordsViewToggle";
import { VehicleEventsListView } from "../components/VehicleEventsListView";
import { zoomPayloadFromVehicleRow } from "../lib/eventImageZoom";
import { receiverImageUrl } from "../lib/receiverImageUrl";
import { SHOW_PLATE_READ_CONFIDENCE_UI, type PlateReadFields } from "../lib/plateReadSummary";
import { PlateReadConfidenceCard } from "../components/PlateReadConfidence";

type VehicleEventRow = PlateReadFields & {
  id: number;
  event_id: string;
  camera_id: string;
  vehicle_num: string;
  vehicle_category: number;
  vehicle_type: string;
  full_image_url: string;
  plate_url: string;

  timestamp: number;
  created_at: string;
};

type ApiResp = {
  rows: VehicleEventRow[];
  total: number;
  page: number;
  pageSize: number;
  cameraMap: Record<string, string>;
};

type RangeStats = {
  from: string;
  to: string;
  spanDays: number;
  timelineMode?: "hourly" | "daily";
  total: number;
  byType: {
    CAR: number;
    TRUCK: number;
    BIKE: number;
    MINITRUCK: number;
    BUS: number;
    AUTO: number;
  };
  cameras: { camera_id: string; name: string; total: number }[];
  timeline: { label: string; total: number }[];
};

function AttributeBadge({ attrType }: { attrType: string }) {
  if (!attrType || attrType === "UNKNOWN") return null;
  const display = attrType === "PUBLIC_UTILITY" ? "PUBLIC UTILITY" : attrType;
  const isPrivate = attrType === "PRIVATE";
  const isPublic = attrType === "PUBLIC_UTILITY";
  return (
    <Box
      component="span"
      sx={{
        ml: 0.75,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 20,
        px: 1.1,
        borderRadius: 999,
        fontSize: "10px",
        fontWeight: 800,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        lineHeight: 1,
        border: "1px solid",
        borderColor: "rgba(17, 24, 39, 0.08)",
        ...(isPrivate
          ? { bgcolor: "rgba(29, 53, 87, 0.96)", color: "#fff", borderColor: "rgba(255,255,255,0.15)" }
          : isPublic
            ? { bgcolor: "rgba(245, 158, 11, 0.16)", color: "#92400e", borderColor: "rgba(245, 158, 11, 0.35)" }
            : { bgcolor: "rgba(100,116,139,0.2)", color: "#334155" }),
      }}
    >
      {display}
    </Box>
  );
}

const TYPE_LABELS: Record<keyof RangeStats["byType"], string> = {
  CAR: "Car",
  TRUCK: "Truck",
  BIKE: "Motorcycle",
  MINITRUCK: "Mini-Truck",
  BUS: "Bus",
  AUTO: "Tuk Tuk",
};

const PAGE_SIZE = 24;

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

type VehicleTypeFilter = "" | "CAR" | "TRUCK" | "BIKE" | "MINITRUCK" | "BUS" | "AUTO";

export function VehicleReportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [from, setFrom] = useState(() => ymdSite());
  const [to, setTo] = useState(() => ymdSite());
  const [cameraId, setCameraId] = useState("");
  const [direction, setDirection] = useState<"" | "IN" | "OUT">("");
  const [vehicleType, setVehicleType] = useState<VehicleTypeFilter>("");
  const [plate, setPlate] = useState("");
  const [attr, setAttr] = useState<"" | "PRIVATE" | "PUBLIC_UTILITY">("");
  const [hour, setHour] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<RecordsViewMode>("list");

  useEffect(() => {
    const f = searchParams.get("from");
    if (f && ymdRe.test(f)) setFrom(f);
    const t = searchParams.get("to");
    if (t && ymdRe.test(t)) setTo(t);
    if (searchParams.has("cameraId")) setCameraId(searchParams.get("cameraId") ?? "");
    if (searchParams.has("direction")) {
      const d = (searchParams.get("direction") ?? "").toUpperCase();
      setDirection(d === "IN" || d === "OUT" ? (d as "IN" | "OUT") : "");
    }
    if (searchParams.has("vehicleType")) {
      const vt = (searchParams.get("vehicleType") ?? "").toUpperCase();
      const allowed: VehicleTypeFilter[] = ["", "CAR", "TRUCK", "BIKE", "MINITRUCK", "BUS", "AUTO"];
      setVehicleType(vt === "" ? "" : allowed.includes(vt as VehicleTypeFilter) ? (vt as VehicleTypeFilter) : "");
    }
    if (searchParams.has("plate")) setPlate(searchParams.get("plate") ?? "");
    if (searchParams.has("attr")) {
      const raw = searchParams.get("attr") ?? "";
      const a = raw.toUpperCase();
      if (a === "PRIVATE" || a === "PUBLIC_UTILITY") setAttr(a);
      else setAttr("");
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
    () => ({ from, to, hour: hourActive ? hour : "", cameraId, direction, vehicleType, plate, attr }),
    [from, to, hourActive, hour, cameraId, direction, vehicleType, plate, attr]
  );

  const queriesEnabled = ymdRe.test(from) && ymdRe.test(to) && !rangeInvalid;

  useEffect(() => {
    setPage(1);
  }, [from, to, hourActive, hour, cameraId, direction, vehicleType, plate, attr]);

  const listParams = {
    from,
    to,
    ...(hourActive ? { hour } : {}),
    cameraId: cameraId || undefined,
    direction: direction || undefined,
    vehicleType: vehicleType || undefined,
    plate: plate || undefined,
    attr: attr || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const q = useQuery<ApiResp, Error>({
    queryKey: ["vehicle-report-events", listParams],
    queryFn: async () =>
      (await api.get<ApiResp>("/dashboard/vehicle-report-events", { params: listParams })).data,
    refetchInterval: 15_000,
    enabled: queriesEnabled,
  });

  const camerasQ = useCameras();
  const cameraMap = useMemo(
    () => ({ ...(camerasQ.data?.cameraMap ?? {}), ...(q.data?.cameraMap ?? {}) }),
    [camerasQ.data?.cameraMap, q.data?.cameraMap]
  );
  const cameraFilterOptions = useMemo(
    () =>
      Object.entries(cameraMap)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [cameraMap]
  );

  const statsQ = useQuery<RangeStats, Error>({
    queryKey: ["range-stats", filterKey, spanDays > 1 ? "hourly" : "calendar"],
    queryFn: async () =>
      (
        await api.get<RangeStats>("/dashboard/range-stats", {
          params: {
            from,
            to,
            ...(hourActive ? { hour } : {}),
            cameraId: cameraId || undefined,
            direction: direction || undefined,
            vehicleType: vehicleType || undefined,
            plate: plate || undefined,
            attr: attr || undefined,
            ...(spanDays > 1 ? { timelineResolution: "hourly" as const } : {}),
          },
        })
      ).data,
    refetchInterval: 30_000,
    enabled: queriesEnabled,
  });

  const pageCount = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(Math.max(1, pageCount));
  }, [page, pageCount]);

  const mixSlices = useMemo(() => {
    const b = statsQ.data?.byType;
    if (!b) return [];
    return (Object.keys(b) as (keyof typeof b)[]).map((k) => ({
      name: TYPE_LABELS[k] ?? k,
      value: b[k] ?? 0,
    }));
  }, [statsQ.data?.byType]);

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
    const n = `${total.toLocaleString()} plate reads`;
    const dayLabel = (ymd: string) => (ymd === today ? "Today" : formatChartDayTick(ymd));
    if (hourActive && hour != null && rf === rt) {
      return formatLang(SITE_LABELS.hourSlotReads, {
        count: n,
        hour: formatHourEndTickFromStart(hour, rf),
      });
    }
    if (rf === rt) return `${dayLabel(rf)} - ${n}`;
    return `${dayLabel(rf)} to ${dayLabel(rt)} - ${n}`;
  }, [rangeInvalid, queriesEnabled, statsQ.data, statsQ.isFetching, hourActive, hour]);

  const chartsBlocked = !queriesEnabled;

  const listTotal = q.data?.total ?? 0;
  const listRows = q.data?.rows ?? [];

  const toVehicleZoom = useCallback((row: VehicleEventRow) => zoomPayloadFromVehicleRow(row), []);
  const imageZoom = useReportImageZoom(listRows, toVehicleZoom);

  return (
    <Box sx={{ ...pageLayoutSx, gap: 2.75 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 2, flexWrap: "wrap" }}>
        <Chip
          icon={<AutoAwesomeIcon />}
          label={SITE_LABELS.anprRecordsWorkspace}
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600, textTransform: "none", bgcolor: "rgba(29,78,216,0.06)", borderRadius: 1.5 }}
        />
      </Box>

      <Paper
        sx={{
          p: { xs: 1.75, sm: 2.25 },
          ...contentCardSx,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: gridCols(2), md: gridCols(12) },
            gap: 1.5,
          }}
        >
          <Box sx={{ gridColumn: { md: "span 3" } }}>
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
                  fullWidth: true,
                  error: rangeInvalid,
                  helperText: rangeInvalid ? "Must be on or before the end date" : undefined,
                },
              }}
            />
          </Box>
          <Box sx={{ gridColumn: { md: "span 3" } }}>
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
                  fullWidth: true,
                  error: rangeInvalid,
                  helperText: rangeInvalid ? "Must be on or after the start date" : undefined,
                },
              }}
            />
          </Box>
          <Box sx={{ gridColumn: { md: "span 2" } }}>
            <TextField fullWidth select label="Camera site" value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
              <MenuItem value="">All camera sites</MenuItem>
              {cameraFilterOptions.map(({ id, name }) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ gridColumn: { md: "span 2" } }}>
            <TextField fullWidth select label="Lane direction" value={direction} onChange={(e) => setDirection(e.target.value as "" | "IN" | "OUT")}>
              <MenuItem value="">Any direction</MenuItem>
              <MenuItem value="IN">Inbound (front aspect)</MenuItem>
              <MenuItem value="OUT">Outbound (rear aspect)</MenuItem>
            </TextField>
          </Box>
          <Box sx={{ gridColumn: { md: "span 2" } }}>
            <TextField fullWidth select label="Vehicle class" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleTypeFilter)}>
              <MenuItem value="">All classes</MenuItem>
              <MenuItem value="CAR">Car</MenuItem>
              <MenuItem value="TRUCK">Truck</MenuItem>
              <MenuItem value="BIKE">Motorcycle</MenuItem>
              <MenuItem value="MINITRUCK">Mini-Truck</MenuItem>
              <MenuItem value="BUS">Bus</MenuItem>
              <MenuItem value="AUTO">Tuk Tuk</MenuItem>
            </TextField>
          </Box>

          <Box sx={{ gridColumn: { md: "span 5" } }}>
            <TextField fullWidth label="Plate (partial match)" value={plate} onChange={(e) => setPlate(e.target.value)} />
          </Box>
          <Box sx={{ gridColumn: { md: "span 3" } }}>
            <TextField fullWidth select label="Registration attribute" value={attr} onChange={(e) => setAttr(e.target.value as "" | "PRIVATE" | "PUBLIC_UTILITY")}>
              <MenuItem value="">Any attribute</MenuItem>
              <MenuItem value="PRIVATE">Private</MenuItem>
              <MenuItem value="PUBLIC_UTILITY">Public Utility</MenuItem>
            </TextField>
          </Box>
          <Box sx={{ gridColumn: { md: "span 4" } }}>
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", alignItems: "center", height: "100%", flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                onClick={() => {
                  const today = ymdSite();
                  setFrom(today);
                  setTo(today);
                  setCameraId("");
                  setDirection("");
                  setVehicleType("");
                  setPlate("");
                  setAttr("");
                  setHour(null);
                  navigate(
                    {
                      pathname: "/vehicle-report",
                      search: `?${buildVehicleReportSearch({ from: today, to: today })}`,
                    },
                    { replace: true }
                  );
                }}
              >
                Reset filters
              </Button>
              {q.isFetching ? <CircularProgress size={18} aria-label="Refreshing read list" /> : null}
            </Box>
          </Box>
        </Box>
      </Paper>

      <Paper
        sx={{
          p: { xs: 2, sm: 2.25 },
          ...contentCardSx,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="overline" sx={{ fontWeight: 900, color: "text.secondary", letterSpacing: "0.12em" }}>
              {SITE_LABELS.filteredReadAnalytics}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              {SITE_LABELS.throughputClassMixSiteShare}
            </Typography>
            {hourActive && hour != null ? (
              <Chip
                size="small"
                label={formatHourEndTickFromStart(hour, from)}
                onDelete={() => {
                  setHour(null);
                  navigate(
                    {
                      pathname: "/vehicle-report",
                      search: `?${buildVehicleReportSearch({
                        from,
                        to,
                        cameraId: cameraId || undefined,
                        plate: plate || undefined,
                        vehicleType: vehicleType || undefined,
                        attr: attr || undefined,
                        direction: direction || undefined,
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
            gridTemplateColumns: { xs: "1fr", lg: "1fr", xl: "minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr)" },
            gap: 2,
            alignItems: "stretch",
          }}
        >
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>{SITE_LABELS.plateReadTrend}</Typography>
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
                id="report-range"
                timeScale={statsQ.data?.timelineMode === "hourly" ? "hour" : "day"}
                hourContextYmd={
                  statsQ.data?.timelineMode === "hourly" && from === to ? from : undefined
                }
              />
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>{SITE_LABELS.readsByVehicleClassShort}</Typography>
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
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                <VehicleMixPieChart slices={mixSlices} height={220} />
                {mixSlices.some((s) => s.value > 0) ? (
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 1.25,
                      rowGap: 1,
                      justifyContent: "center",
                      alignItems: "center",
                      mt: 1,
                      pt: 1.5,
                      borderTop: "1px solid rgba(15,23,42,0.08)",
                    }}
                  >
                    {mixSlices
                      .filter((s) => s.value > 0)
                      .map((s, i) => (
                        <Box key={s.name} sx={{ display: "inline-flex", alignItems: "center", gap: 0.65 }}>
                          <Box
                            component="span"
                            aria-hidden
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              bgcolor: VEHICLE_MIX_PIE_COLORS[i % VEHICLE_MIX_PIE_COLORS.length],
                              flexShrink: 0,
                              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
                            }}
                          />
                          <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", lineHeight: 1.2 }}>
                            {s.name}
                          </Typography>
                        </Box>
                      ))}
                  </Box>
                ) : null}
              </Box>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.72)", borderColor: "rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em" }}>{SITE_LABELS.readsByCameraSite}</Typography>
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
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.25 },
          ...contentCardSx,
        }}
      >
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
              {SITE_LABELS.readGrid}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              {SITE_LABELS.plateReadEvents}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ fontWeight: 800, color: "text.secondary" }}>
              {listTotal === 0
                ? "0 read events"
                : `Rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, listTotal)} of ${listTotal.toLocaleString()}`}
            </Typography>
            <RecordsViewToggle value={viewMode} onChange={setViewMode} />
          </Box>
        </Box>

        <Box sx={{ pt: 2 }}>
          {q.isError ? (
            <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
              Unable to load read events.{" "}
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
                No reads match the current criteria
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 650, color: "text.secondary", mt: 1, maxWidth: 420, mx: "auto" }}>
                Broaden the reporting window or clear plate and site filters. Summary charts above still reflect the same
                interval and filters.
              </Typography>
            </Box>
          ) : null}

          {viewMode === "list" ? (
            <VehicleEventsListView rows={listRows} cameraMap={cameraMap} onZoomAt={imageZoom.openAt} />
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
                  <VehicleCard row={r} cameraMap={cameraMap} onZoomAt={() => imageZoom.openAt(index)} />
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
        title={SITE_LABELS.plateCaptureImage}
      />
    </Box>
  );
}

function VehicleCard({
  row,
  cameraMap,
  onZoomAt,
}: {
  row: VehicleEventRow;
  cameraMap: Record<string, string>;
  onZoomAt: () => void;
}) {
  const scene = receiverImageUrl(row.full_image_url);
  const plate = receiverImageUrl(row.plate_url);
  const [showPlate, setShowPlate] = useState(false);

  const rawAttr = (row.vehicle_type || "").trim().toUpperCase();
  const attrType = rawAttr === "ELECTRIC" ? "PRIVATE" : rawAttr;

  const vehicleType = categoryToType(row.vehicle_category);

  const hasScene = Boolean(scene);
  const hasPlate = Boolean(plate);
  const mainSrc = hasScene ? (showPlate && hasPlate ? plate : scene) : hasPlate ? plate : "";

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
        {mainSrc ? (
          <img
            src={mainSrc}
            alt="Plate read image"
            style={{ width: "100%", height: 156, objectFit: "cover", display: "block" }}
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
            No scene image on file
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

        {hasPlate && hasScene ? (
          <IconButton
            onClick={() => setShowPlate((p) => !p)}
            size="small"
            title={showPlate ? "Show scene" : "Show plate crop"}
            sx={{ ...iconShell, right: 52 }}
          >
            <FlipIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : null}

        {mainSrc ? (
          <IconButton
            onClick={() => {
              const payload = zoomPayloadFromVehicleRow(row);
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
        <Typography
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
            fontWeight: 800,
            fontSize: "1.05rem",
            letterSpacing: "-0.02em",
            color: "text.primary",
          }}
        >
          {row.vehicle_num || "-"}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", display: "block", mt: 0.35 }}>
          License plate
        </Typography>

        {SHOW_PLATE_READ_CONFIDENCE_UI ? <PlateReadConfidenceCard row={row} /> : null}

        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(15,23,42,0.07)" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
              Vehicle class
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary" }}>
                {vehicleType}
              </Typography>
              <AttributeBadge attrType={attrType} />
            </Box>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
              Camera site
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", textAlign: "right" }}>
              {cameraMap[row.camera_id] ?? row.camera_id}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
              Read timestamp
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", textAlign: "right" }}>
              {formatVehicleEventDisplayTime(row)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

function categoryToType(cat: number) {
  const map: Record<number, string> = {
    1: "CAR",
    2: "CAR",
    3: "TRUCK",
    4: "TRUCK",
    5: "BIKE",
    6: "BIKE",
    7: "MINITRUCK",
    8: "MINITRUCK",
    9: "BUS",
    10: "BUS",
    11: "TUKTUK",
    12: "TUKTUK",
  };
  return map[Number(cat)] ?? String(cat ?? "");
}
