import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import DirectionsCarFilledOutlinedIcon from "@mui/icons-material/DirectionsCarFilledOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { api } from "../lib/api";
import { useShellHeader } from "../context/ShellHeaderContext";
import { MastheadDashboardToolbar } from "../components/MastheadDashboardToolbar";
import { ImageZoomDialog, type ImageZoomPayload } from "../components/ImageZoomDialog";
import { zoomPayloadFromVehicleRow } from "../lib/eventImageZoom";
import { JourneyRouteMap } from "../components/journey/JourneyRouteMap";
import { contentCardSx, pageLayoutSx, statTileSx } from "../lib/uiSurfaces";
import { pnp } from "../lib/pnpTheme";
import { violationTypeLabel, violationTypeMeta } from "../lib/violationTypes";
import {
  type DatePreset,
  defaultTodayRange,
  journeyQueryRange,
  journeyRangeFromStops,
} from "../lib/dashboardRange";
import { receiverImageUrl } from "../lib/receiverImageUrl";

const RECENT_KEY = "vsp-journey-recent-plates";

export type VehicleJourneyData = {
  plate: string;
  from: string | null;
  to: string | null;
  summary: {
    plate: string;
    firstSeen: string;
    firstSeenSite: string;
    lastSeen: string;
    lastSeenSite: string;
    totalHits: number;
    journeyDuration: string;
    sitesVisited: number;
    averageInterval: string;
  };
  route: { coordinates: [number, number][]; distanceKm: number; duration: string; averageSpeedKmh: number | null };
  stops: {
    sequence: number;
    id: number;
    detectedAt: string;
    detectedAtDisplay: string;
    timeShort: string;
    timelineAt: string;
    siteName: string;
    siteLabel?: string;
    cameraId: string;
    lat: number | null;
    lng: number | null;
    plate: string;
    vehicleClass: string;
    direction: string;
    confidence: number | null;
    fullImageUrl: string | null;
    plateUrl: string | null;
    violation: { id: number; violationType: string } | null;
    elapsedFromPrevious: string | null;
    isFirst: boolean;
    isLast: boolean;
  }[];
  sitesOverview: { siteName: string; firstSeenShort: string; sequence: number }[];
  currentStatus: {
    plate: string;
    vehicleClass: string;
    lastSeenLocation: string;
    lastSeenTime: string;
    direction: string;
    watchlistStatus: string;
    watchlistHit: boolean;
    violationCount: number;
    active: boolean;
    imageUrl: string | null;
  } | null;
  ai: {
    totalDetections: number;
    movementPattern: string;
    journeyDuration: string;
    averageInterval: string;
    violationsEncountered: number;
    violationSummary: string;
    riskLevel: string;
    narrative: string;
  };
};

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function pushRecent(plate: string) {
  const p = plate.trim().toUpperCase();
  if (!p) return;
  const next = [p, ...readRecent().filter((x) => x !== p)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function SummaryTile({
  icon,
  label,
  value,
  sub,
  accent = "#2563EB",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Paper
      sx={{
        ...statTileSx,
        height: "100%",
        background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
        "&:hover": { boxShadow: "0 8px 24px rgba(37, 99, 235, 0.1)", transform: "translateY(-1px)" },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 2,
          display: "grid",
          placeItems: "center",
          mb: 1,
          color: accent,
          bgcolor: `${accent}14`,
          border: `1px solid ${accent}33`,
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, color: pnp.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.35, fontWeight: 900, fontSize: "0.9375rem", lineHeight: 1.25, color: "#0f172a" }}>{value}</Typography>
      {sub ? <Typography sx={{ mt: 0.25, fontSize: "0.75rem", color: pnp.textSecondary, fontWeight: 600 }}>{sub}</Typography> : null}
    </Paper>
  );
}

function riskChipSx(level: string) {
  const l = level.toLowerCase();
  if (l === "high") return { bgcolor: "rgba(220,38,38,0.12)", color: "#b91c1c" };
  if (l === "medium") return { bgcolor: "rgba(245,158,11,0.15)", color: "#b45309" };
  return { bgcolor: "rgba(22,163,74,0.12)", color: "#15803d" };
}

export function VehicleJourneyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setRightSlot } = useShellHeader();
  const [preset, setPreset] = useState<DatePreset>("custom");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [plateInput, setPlateInput] = useState(searchParams.get("plate") || "");
  const [searchPlate, setSearchPlate] = useState(searchParams.get("plate") || "");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [zoom, setZoom] = useState<ImageZoomPayload | null>(null);

  const queryRange = useMemo(
    () => journeyQueryRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const journeyQ = useQuery({
    queryKey: ["vehicle-journey", searchPlate, queryRange?.from ?? "all", queryRange?.to ?? "all"],
    queryFn: async ({ signal }) => {
      const params: Record<string, string> = { plate: searchPlate };
      if (queryRange) {
        params.from = queryRange.from;
        params.to = queryRange.to;
      }
      return (await api.get<VehicleJourneyData>("/dashboard/vehicle-journey", { params, signal })).data;
    },
    enabled: Boolean(searchPlate.trim().length >= 3),
  });

  const data = journeyQ.data;
  const hasData = Boolean(data && data.stops?.length);
  const parsedRange = useMemo(
    () => (data?.stops?.length ? journeyRangeFromStops(data.stops) : null),
    [data?.stops]
  );
  const resolvedFrom = queryRange?.from ?? parsedRange?.from ?? null;
  const resolvedTo = queryRange?.to ?? parsedRange?.to ?? null;

  const runSearch = useCallback(
    (p: string) => {
      const plate = p.trim().toUpperCase();
      if (plate.length < 3) return;
      const plateChanged = plate !== searchPlate;
      if (plateChanged) {
        setPreset("custom");
        setCustomFrom("");
        setCustomTo("");
      }
      setSearchPlate(plate);
      setPlateInput(plate);
      pushRecent(plate);
      setRecent(readRecent());
      const params = new URLSearchParams();
      params.set("plate", plate);
      if (!plateChanged && queryRange) {
        params.set("from", queryRange.from);
        params.set("to", queryRange.to);
      }
      setSearchParams(params, { replace: true });
    },
    [queryRange, searchPlate, setSearchParams]
  );

  const resetToToday = useCallback(() => {
    const t = defaultTodayRange();
    setPreset("today");
    setCustomFrom(t.from);
    setCustomTo(t.to);
  }, []);

  useEffect(() => {
    setRightSlot(
      <MastheadDashboardToolbar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        resolvedFrom={resolvedFrom}
        resolvedTo={resolvedTo}
        onResetToToday={resetToToday}
        emptyRangeLabel="All available data"
      />
    );
    return () => setRightSlot(null);
  }, [preset, customFrom, customTo, resolvedFrom, resolvedTo, resetToToday, setRightSlot]);

  useEffect(() => {
    const urlPlate = searchParams.get("plate");
    const urlFrom = searchParams.get("from");
    const urlTo = searchParams.get("to");
    if (urlPlate) {
      const normalized = urlPlate.toUpperCase();
      if (normalized !== searchPlate) {
        setPlateInput(normalized);
        setSearchPlate(normalized);
      }
    }
    if (urlFrom && urlTo) {
      setPreset("custom");
      setCustomFrom(urlFrom);
      setCustomTo(urlTo);
    }
  }, [searchParams, searchPlate]);

  const exportReport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `active-alerts-${data.plate}-${data.from ?? "all"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const movementText = useMemo(() => data?.ai.movementPattern || "—", [data]);

  return (
    <Box sx={pageLayoutSx}>
      <Paper
        sx={{
          ...contentCardSx,
          p: 2,
          background: "linear-gradient(135deg, rgba(184,134,11,0.07) 0%, #ffffff 45%, #ffffff 100%)",
          border: "1px solid rgba(184, 134, 11, 0.16)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <DirectionsCarFilledOutlinedIcon sx={{ color: pnp.primary }} />
          <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem" }}>Search active alerts</Typography>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, alignItems: "flex-end" }}>
          <TextField
            label="Subject ID"
            size="small"
            value={plateInput}
            onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(plateInput);
            }}
            sx={{ minWidth: { xs: "100%", sm: 220 }, flex: { sm: 1 } }}
          />
          <Button variant="contained" startIcon={<SearchIcon />} onClick={() => runSearch(plateInput)} sx={{ fontWeight: 800, px: 3, height: 40 }}>
            Search
          </Button>
        </Box>
        {recent.length ? (
          <Box sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: pnp.textSecondary }}>Recent:</Typography>
            {recent.map((p) => (
              <Chip key={p} size="small" label={p} onClick={() => runSearch(p)} sx={{ fontWeight: 700, cursor: "pointer" }} />
            ))}
          </Box>
        ) : null}
      </Paper>

      {journeyQ.isError ? <Alert severity="error">Failed to load alert analysis.</Alert> : null}
      {searchPlate && journeyQ.isSuccess && !hasData ? (
        <Alert severity="info">
          No camera detections found for {searchPlate}
          {queryRange ? " in the selected period." : " in available records."}
        </Alert>
      ) : null}

      {hasData && data ? (
        <>
          <Paper
            sx={{
              ...contentCardSx,
              p: { xs: 1.75, sm: 2 },
              background: "linear-gradient(90deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%)",
              color: "#fff",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box>
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, letterSpacing: "0.12em", opacity: 0.75, textTransform: "uppercase" }}>
                Intelligence trace
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: { xs: "1.35rem", sm: "1.6rem" }, letterSpacing: "0.04em" }}>{data.plate}</Typography>
              <Typography sx={{ mt: 0.5, fontSize: "0.875rem", fontWeight: 600, opacity: 0.9 }}>{movementText}</Typography>
            </Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              <Chip
                icon={<AutoAwesomeOutlinedIcon sx={{ color: "inherit !important" }} />}
                label={`${data.ai.riskLevel} risk`}
                sx={{ fontWeight: 800, bgcolor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
              />
              <Chip
                label={`${data.summary.totalHits} detections`}
                sx={{ fontWeight: 800, bgcolor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
              />
              <Chip
                label={data.summary.journeyDuration}
                sx={{ fontWeight: 800, bgcolor: "rgba(245,158,11,0.25)", color: "#fde68a", border: "1px solid rgba(245,158,11,0.4)" }}
              />
            </Box>
          </Paper>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" }, gap: 1.25 }}>
            <SummaryTile icon={<PlaceOutlinedIcon fontSize="small" />} label="Subject" value={data.plate} accent="#C08529" />
            <SummaryTile icon={<CalendarTodayOutlinedIcon fontSize="small" />} label="First seen" value={data.summary.firstSeen} sub={`at ${data.summary.firstSeenSite}`} accent="#16a34a" />
            <SummaryTile icon={<CalendarTodayOutlinedIcon fontSize="small" />} label="Last seen" value={data.summary.lastSeen} sub={`at ${data.summary.lastSeenSite}`} accent="#f59e0b" />
            <SummaryTile icon={<VideocamOutlinedIcon fontSize="small" />} label="Camera hits" value={String(data.summary.totalHits)} sub="Detections" accent="#7c3aed" />
            <SummaryTile icon={<AccessTimeOutlinedIcon fontSize="small" />} label="Dwell time" value={data.summary.journeyDuration} accent="#0891b2" />
            <SummaryTile icon={<MapOutlinedIcon fontSize="small" />} label="Areas visited" value={String(data.summary.sitesVisited)} sub={`Avg ${data.summary.averageInterval}`} accent="#dc2626" />
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "1.1fr 1.2fr 0.9fr" },
              gap: 2,
              alignItems: "stretch",
            }}
          >
            <Paper sx={{ ...contentCardSx, p: 2, borderTop: "3px solid", borderColor: pnp.primary }}>
              <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", mb: 1.5 }}>Alert Timeline</Typography>
              <Stack spacing={0}>
                {data.stops.map((s, idx) => (
                  <Box key={s.id}>
                    <Box sx={{ display: "flex", gap: 1.5 }}>
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: 28 }}>
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            bgcolor: s.isLast ? pnp.primary : "#0f172a",
                            color: "#fff",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 900,
                            fontSize: "0.75rem",
                          }}
                        >
                          {s.sequence}
                        </Box>
                        {idx < data.stops.length - 1 ? (
                          <Box
                            sx={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              minHeight: 40,
                              my: 0.5,
                              gap: 0.35,
                            }}
                          >
                            <Box
                              sx={{
                                flex: 1,
                                width: 3,
                                borderRadius: 2,
                                background: "linear-gradient(180deg, #2563EB 0%, #93C5FD 100%)",
                                opacity: 0.55,
                              }}
                            />
                            {data.stops[idx + 1]?.elapsedFromPrevious ? (
                              <Typography
                                sx={{
                                  fontSize: "0.6875rem",
                                  fontWeight: 800,
                                  color: pnp.primary,
                                  whiteSpace: "nowrap",
                                  lineHeight: 1,
                                }}
                              >
                                {data.stops[idx + 1].elapsedFromPrevious}
                              </Typography>
                            ) : null}
                            <Box
                              sx={{
                                flex: 1,
                                width: 3,
                                borderRadius: 2,
                                background: "linear-gradient(180deg, #93C5FD 0%, #2563EB 100%)",
                                opacity: 0.55,
                              }}
                            />
                          </Box>
                        ) : null}
                      </Box>
                      <Box sx={{ flex: 1, pb: idx < data.stops.length - 1 ? 2 : 0 }}>
                        <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", lineHeight: 1.35 }}>
                          {s.timelineAt || s.detectedAtDisplay}
                        </Typography>
                        <Typography sx={{ fontWeight: 800, fontSize: "0.875rem", color: "#0f172a" }}>
                          {s.siteLabel || s.siteName}
                        </Typography>
                        {s.violation ? (
                          <Chip
                            size="small"
                            label={violationTypeLabel(s.violation.violationType)}
                            sx={{
                              mt: 0.75,
                              fontWeight: 800,
                              bgcolor: violationTypeMeta(s.violation.violationType as never)?.softBg,
                              color: violationTypeMeta(s.violation.violationType as never)?.color,
                            }}
                          />
                        ) : (
                          <Chip size="small" label="No violation" color="success" variant="outlined" sx={{ mt: 0.75, fontWeight: 800 }} />
                        )}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Paper>

            <Paper sx={{ ...contentCardSx, p: 0, overflow: "hidden" }}>
              <Box sx={{ px: 2, pt: 2, pb: 1 }}>
                <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem" }}>Alert locations</Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, fontWeight: 600 }}>
                  Where alerts were raised across monitored camera areas
                </Typography>
              </Box>
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                <JourneyRouteMap stops={data.stops} route={data.route} movementPattern={movementText} minHeight={400} />
              </Box>
            </Paper>

            <Stack spacing={2}>
              <Paper sx={{ ...contentCardSx, p: 2, borderTop: "3px solid", borderColor: "#16a34a" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 900, fontSize: "1.1rem" }}>{data.currentStatus?.plate}</Typography>
                    <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, fontWeight: 600 }}>
                      {data.currentStatus?.vehicleClass}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={data.currentStatus?.active ? "Active" : "Inactive"}
                    color={data.currentStatus?.active ? "success" : "default"}
                    sx={{ fontWeight: 800 }}
                  />
                </Box>
                {data.currentStatus?.imageUrl ? (
                  <Box
                    sx={{
                      position: "relative",
                      mb: 1.5,
                      borderRadius: 2,
                      overflow: "hidden",
                      border: "1px solid rgba(15,23,42,0.1)",
                      boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
                    }}
                  >
                    <Box
                      component="img"
                      src={receiverImageUrl(data.currentStatus.imageUrl)}
                      alt="Subject"
                      sx={{ width: "100%", height: 140, objectFit: "cover", display: "block", bgcolor: "#0b1220" }}
                    />
                    <Box
                      sx={{
                        position: "absolute",
                        left: 8,
                        bottom: 8,
                        px: 1,
                        py: 0.35,
                        borderRadius: 1,
                        bgcolor: "rgba(6,14,32,0.75)",
                        backdropFilter: "blur(6px)",
                      }}
                    >
                      <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, color: "#e2e8f0" }}>Latest capture</Typography>
                    </Box>
                  </Box>
                ) : null}
                <Stack spacing={1}>
                  {[
                    ["Last seen location", data.currentStatus?.lastSeenLocation],
                    ["Last seen time", data.currentStatus?.lastSeenTime],
                    ["Direction", data.currentStatus?.direction],
                    [
                      "Watchlist",
                      data.currentStatus?.watchlistHit ? (
                        <Chip size="small" color="warning" label="Match" sx={{ fontWeight: 800 }} />
                      ) : (
                        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                          <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: "#16a34a" }} />
                          Clear
                        </Box>
                      ),
                    ],
                    [
                      "Violations",
                      <Box key="v" component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                        {data.currentStatus?.violationCount ? (
                          <WarningAmberOutlinedIcon sx={{ fontSize: 16, color: "#dc2626" }} />
                        ) : null}
                        {data.currentStatus?.violationCount ?? 0}
                      </Box>,
                    ],
                  ].map(([k, v]) => (
                    <Box key={String(k)} sx={{ display: "flex", justifyContent: "space-between", gap: 1, fontSize: "0.8125rem" }}>
                      <Typography sx={{ color: pnp.textSecondary, fontWeight: 700 }}>{k}</Typography>
                      <Typography sx={{ fontWeight: 800, textAlign: "right" }}>{v}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>

              <Paper
                sx={{
                  ...contentCardSx,
                  p: 2,
                  background: "linear-gradient(160deg, rgba(139,92,246,0.08) 0%, #ffffff 55%)",
                  border: "1px solid rgba(139, 92, 246, 0.15)",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
                  <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem" }}>AI Alert Analysis</Typography>
                  <Chip size="small" label="Beta" sx={{ fontWeight: 800, bgcolor: "rgba(139,92,246,0.12)", color: "#6d28d9" }} />
                </Box>
                <Stack spacing={0.75} sx={{ mb: 1.5 }}>
                  {[
                    ["Total detections", data.ai.totalDetections],
                    ["Movement pattern", data.ai.movementPattern],
                    ["Dwell time", data.ai.journeyDuration],
                    ["Average interval", data.ai.averageInterval],
                    ["Alerts raised", data.ai.violationsEncountered],
                  ].map(([k, v]) => (
                    <Box key={String(k)} sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                      <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, fontWeight: 700 }}>{k}</Typography>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, textAlign: "right" }}>{v}</Typography>
                    </Box>
                  ))}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, fontWeight: 700 }}>Risk level</Typography>
                    <Chip size="small" label={`${data.ai.riskLevel} risk`} sx={{ fontWeight: 800, ...riskChipSx(data.ai.riskLevel) }} />
                  </Box>
                </Stack>
                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", p: 1.25, borderRadius: 2, bgcolor: "rgba(37,99,235,0.05)" }}>
                  <PsychologyOutlinedIcon sx={{ color: pnp.primary, fontSize: 20 }} />
                  <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.65, color: "#334155", fontWeight: 500 }}>{data.ai.narrative}</Typography>
                </Box>
              </Paper>
            </Stack>
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2.2fr 0.8fr" }, gap: 2 }}>
            <Paper sx={{ ...contentCardSx, p: 2 }}>
              <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", mb: 1.5 }}>Detection events</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, mb: 1.5 }}>
                Supporting evidence — chronological camera records
              </Typography>
              <TableContainer sx={{ borderRadius: 2, border: "1px solid rgba(15,23,42,0.08)" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {["#", "Timestamp", "Camera area", "Subject", "Type", "Direction", "Confidence", "Alert", ""].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 900, fontSize: "0.6875rem", whiteSpace: "nowrap" }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.stops.map((s) => (
                      <TableRow key={s.id} hover>
                        <TableCell>{s.sequence}</TableCell>
                        <TableCell sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>{s.detectedAtDisplay}</TableCell>
                        <TableCell>
                          <Typography sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>{s.siteName}</Typography>
                          <Typography sx={{ fontSize: "0.6875rem", color: pnp.textSecondary }}>{s.cameraId}</Typography>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>{s.plate}</TableCell>
                        <TableCell sx={{ fontSize: "0.8125rem" }}>{s.vehicleClass}</TableCell>
                        <TableCell>{s.direction}</TableCell>
                        <TableCell>
                          {s.confidence != null ? (
                            <Chip size="small" label={`${Math.round(s.confidence * (s.confidence <= 1 ? 100 : 1))}%`} sx={{ fontWeight: 800 }} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {s.violation ? (
                            <Chip size="small" label={violationTypeLabel(s.violation.violationType)} color="warning" sx={{ fontWeight: 800 }} />
                          ) : (
                            <Chip size="small" label="None" variant="outlined" sx={{ fontWeight: 800 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="View capture">
                            <IconButton
                              size="small"
                              onClick={() => {
                                const payload = zoomPayloadFromVehicleRow({
                                  full_image_url: s.fullImageUrl || undefined,
                                  plate_url: s.plateUrl || undefined,
                                });
                                if (payload) setZoom(payload);
                              }}
                            >
                              <VisibilityOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Stack spacing={2}>
              <Paper sx={{ ...contentCardSx, p: 2 }}>
                <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", mb: 1.5 }}>Sites visited</Typography>
                <Stack spacing={1.25}>
                  {data.sitesOverview.map((site, i) => (
                      <Box key={site.siteName} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            bgcolor: pnp.primary,
                            color: "#fff",
                            fontWeight: 900,
                            fontSize: "0.75rem",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          {site.sequence}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontWeight: 800, fontSize: "0.8125rem" }}>{site.siteName}</Typography>
                          <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }}>
                            {i === 0 ? "First seen" : "Visited"} · {site.firstSeenShort}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                </Stack>
              </Paper>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={exportReport}
                sx={{ fontWeight: 800, py: 1.25, borderRadius: 2, bgcolor: "rgba(184,134,11,0.05)" }}
              >
                Export alert report
              </Button>
            </Stack>
          </Box>
        </>
      ) : null}

      {!searchPlate ? (
        <Paper
          sx={{
            ...contentCardSx,
            p: 4,
            textAlign: "center",
            background: "linear-gradient(180deg, rgba(184,134,11,0.05) 0%, #fff 40%)",
          }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              mx: "auto",
              mb: 1.5,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, rgba(184,134,11,0.18) 0%, rgba(126,63,91,0.12) 100%)",
            }}
          >
            <SpeedOutlinedIcon sx={{ fontSize: 36, color: pnp.primary }} />
          </Box>
          <Typography sx={{ fontWeight: 900, mb: 0.5, fontSize: "1.1rem" }}>Active alert intelligence</Typography>
          <Typography sx={{ fontSize: "0.875rem", color: pnp.textSecondary, maxWidth: 440, mx: "auto", lineHeight: 1.65 }}>
            Enter a subject ID to review every alert raised for them across the venue&apos;s camera areas — with a full timeline, dwell time, and an AI summary.
          </Typography>
        </Paper>
      ) : null}

      <ImageZoomDialog open={!!zoom} payload={zoom} onClose={() => setZoom(null)} title="Detection capture" />
    </Box>
  );
}
