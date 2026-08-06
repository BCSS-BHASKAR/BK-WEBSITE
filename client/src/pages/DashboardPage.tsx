import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { api } from "../lib/api";
import { useShellHeader } from "../context/ShellHeaderContext";
import { DashboardOperationalView } from "../components/dashboard/DashboardOperationalView";
import { formatTrendHint } from "../lib/dashboardTrend";
import { MastheadDashboardToolbar } from "../components/MastheadDashboardToolbar";
import {
  type DatePreset,
  defaultTodayRange,
  daysInclusive,
  datedRangeFromPreset,
  normalizeCustomRange,
  ymdSite,
} from "../lib/dashboardRange";
import { goVehicleReport } from "../lib/vehicleReportNav";
import { goWalkinsReport } from "../lib/walkinsReportNav";
import { goCrowdsReport } from "../lib/crowdsReportNav";
import { hourSiteNow, SITE_TIMEZONE, ymdSiteYesterday } from "../lib/siteTimeZone";
dayjs.extend(utc);
dayjs.extend(timezone);

type DashboardOverview = {
  from: string;
  to: string;
  totalReads: number;
  uniquePlates: number;
  trafficViolationCount?: number;
  trafficViolationsByType?: Record<string, number>;
  trafficViolationsByCamera?: { camera_id: string; name: string; total: number }[];
  topPlate?: { plate: string; reads: number; lastCamera: string } | null;
  camerasOnline?: number;
  camerasDeployed?: number;
  camerasReporting?: number;
  cameraUptimePercent?: number;
  busiestCamera: { id: string | null; name: string; reads: number };
  timeseries: { bucket: string; total: number }[];
  attributes: { key: string; label: string; total: number }[];
  windowKind?: string;
};

type TopPlates = {
  rows: { plate: string; total: number; last_seen: string; last_camera: string }[];
};

type WatchlistHits = {
  rows: {
    id: number;
    plate: string;
    camera: string;
    created_at: string;
    list_name: string;
  }[];
  activeWatchlists?: number;
  lastHit?: string | null;
};

type Heatmap = {
  hours: string[];
  cameras: { camera_id: string; name: string }[];
  matrix: Record<string, number[]>;
};

type WalkinsRangeStats = {
  total: number;
  peakHour?: { hour: number; total: number };
  activeEntrances?: number;
};

type CrowdsRangeStats = {
  total: number;
  peakPeople?: number;
  peakOccupancy?: number;
};

const rangeParams = (from: string, to: string) => ({ from, to });

// Keep in sync with ALERT_TYPE in pages/ChefPresencePage.tsx.
const CHEF_PRESENCE_ALERT_TYPE = "unattended_kitchen";

export function DashboardPage() {
  const navigate = useNavigate();
  const { setRightSlot } = useShellHeader();
  const openReport = useCallback(
    (p: Parameters<typeof goVehicleReport>[1]) => {
      goVehicleReport(navigate, p);
    },
    [navigate]
  );

  const initial = defaultTodayRange();
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState(initial.from);
  const [customTo, setCustomTo] = useState(initial.to);
  const [throughputResolution, setThroughputResolution] = useState<"daily" | "hourly">("daily");
  const prevPresetRef = useRef(preset);

  const { from, to } = useMemo(
    () => datedRangeFromPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );
  const spanDays = useMemo(() => daysInclusive(from, to), [from, to]);
  const qParams = useMemo(() => rangeParams(from, to), [from, to]);

  useEffect(() => {
    if (preset === "custom" && prevPresetRef.current !== "custom") {
      const n = normalizeCustomRange(from, to);
      setCustomFrom(n.from);
      setCustomTo(n.to);
    }
    prevPresetRef.current = preset;
  }, [preset, from, to]);

  const MAX_DASHBOARD_HOURLY_SPAN = 31;
  useEffect(() => {
    if (spanDays > MAX_DASHBOARD_HOURLY_SPAN && throughputResolution === "hourly") {
      setThroughputResolution("daily");
    }
  }, [spanDays, throughputResolution]);

  const overviewParams = useMemo(
    () => ({
      ...qParams,
      ...(spanDays > 1 ? { timeseriesGranularity: throughputResolution } : {}),
    }),
    [qParams, spanDays, throughputResolution]
  );

  const overviewQ = useQuery({
    queryKey: ["dashboard", "overview", from, to, spanDays > 1 ? throughputResolution : "single"],
    queryFn: async ({ signal }) =>
      (await api.get<DashboardOverview>("/dashboard/overview", { params: overviewParams, signal })).data,
    refetchInterval: 10000,
  });

  const topPlatesQ = useQuery({
    queryKey: ["dashboard", "top-plates", from, to],
    queryFn: async () => (await api.get<TopPlates>("/dashboard/top-plates", { params: { limit: 5, ...qParams } })).data,
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });

  const watchlistQ = useQuery({
    queryKey: ["dashboard", "watchlist-hits", from, to],
    queryFn: async () =>
      (await api.get<WatchlistHits>("/dashboard/watchlist-hits", { params: { limit: 100, ...qParams } })).data,
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });

  const recentViolationsQ = useQuery({
    queryKey: ["dashboard", "violations-recent", from, to],
    queryFn: async ({ signal }) =>
      (
        await api.get<{
          rows: {
            id: number;
            violationType: string;
            plate: string | null;
            cameraName: string;
            detectedAt: string;
          }[];
        }>("/dashboard/violations", { params: { ...qParams, page: 1, pageSize: 4 }, signal })
      ).data,
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });

  const heatmapQ = useQuery({
    queryKey: ["dashboard", "heatmap", from, to],
    queryFn: async ({ signal }) => (await api.get<Heatmap>("/dashboard/heatmap", { params: qParams, signal })).data,
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });

  const walkinsQ = useQuery({
    queryKey: ["dashboard", "walkins-range-stats", "kpi", from, to],
    queryFn: async ({ signal }) =>
      (await api.get<WalkinsRangeStats>("/dashboard/walkins-range-stats", { params: qParams, signal })).data,
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });

  const crowdsQ = useQuery({
    queryKey: ["dashboard", "crowds-range-stats", "kpi", from, to],
    queryFn: async ({ signal }) =>
      (await api.get<CrowdsRangeStats>("/dashboard/crowds-range-stats", { params: qParams, signal })).data,
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });

  // The Kitchen Unattended tile has to read the same source as the Kitchen
  // Unattended page — unattended-kitchen records, not the legacy plate watchlist.
  const chefPresenceQ = useQuery({
    queryKey: ["dashboard", "chef-presence", "kpi", from, to],
    queryFn: async ({ signal }) =>
      (
        await api.get<CrowdsRangeStats>("/dashboard/crowds-range-stats", {
          params: { ...qParams, alertType: CHEF_PRESENCE_ALERT_TYPE },
          signal,
        })
      ).data,
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });

  const overview = overviewQ.data;
  const trafficViolationsTotal = overview?.trafficViolationCount ?? 0;
  const trafficViolationsByType = overview?.trafficViolationsByType ?? {};
  const sparkTotals = (overview?.timeseries ?? []).map((p) => p.total);

  const openViolations = (violationType?: string, plate?: string) => {
    const params = new URLSearchParams({ from, to });
    if (violationType) params.set("type", violationType);
    if (plate) params.set("plate", plate);
    navigate({ pathname: "/violations", search: `?${params.toString()}` });
  };

  /**
   * KPI tiles and panel footers hand the dashboard's report period to the page
   * they open — the report pages default to the last 7 days, so without this a
   * tile showing today's count lands on a page showing a week.
   *
   * Walk-ins and Active Alerts use their own nav helpers; Kitchen Unattended
   * has none, and reads from/to straight off the query string.
   */
  const goChefPresence = () => {
    navigate({ pathname: "/watchlists", search: `?${new URLSearchParams({ from, to }).toString()}` });
  };

  const overviewPending = !overviewQ.data && overviewQ.isPending;
  const heatmapPending = !heatmapQ.data && heatmapQ.isPending;
  const topPlatesPending = !topPlatesQ.data && topPlatesQ.isPending;
  const watchlistPending = !watchlistQ.data && watchlistQ.isPending;
  const watchlistHitCount = watchlistQ.data?.rows?.length ?? 0;

  const streamStatusQ = useQuery({
    queryKey: ["streams", "status"],
    queryFn: async () =>
      (
        await api.get<{
          streams: { id: string; name: string; online: boolean }[];
          onlineCount: number;
          total: number;
          allOnline: boolean;
        }>("/streams")
      ).data,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  const streamSummary = streamStatusQ.data
    ? {
        onlineCount: streamStatusQ.data.onlineCount,
        total: streamStatusQ.data.total,
        streams: streamStatusQ.data.streams ?? [],
      }
    : undefined;

  const isTodayView = from === to && from === ymdSite();
  const yesterdayYmd = ymdSiteYesterday();
  const throughHour = hourSiteNow();
  const priorRangeParams = useMemo(
    () => ({ from: yesterdayYmd, to: yesterdayYmd, throughHour }),
    [yesterdayYmd, throughHour]
  );

  const priorOverviewQ = useQuery({
    queryKey: ["dashboard", "overview", "prior", yesterdayYmd, throughHour],
    queryFn: async ({ signal }) =>
      (
        await api.get<DashboardOverview>("/dashboard/overview", {
          params: priorRangeParams,
          signal,
        })
      ).data,
    enabled: isTodayView,
    refetchInterval: 30_000,
  });

  const priorWatchlistQ = useQuery({
    queryKey: ["dashboard", "watchlist-hits", "prior", yesterdayYmd, throughHour],
    queryFn: async ({ signal }) =>
      (
        await api.get<WatchlistHits>("/dashboard/watchlist-hits", {
          params: { limit: 100, ...priorRangeParams },
          signal,
        })
      ).data,
    enabled: isTodayView,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const priorChefPresenceQ = useQuery({
    queryKey: ["dashboard", "chef-presence", "prior", yesterdayYmd, throughHour],
    queryFn: async ({ signal }) =>
      (
        await api.get<CrowdsRangeStats>("/dashboard/crowds-range-stats", {
          params: { ...priorRangeParams, alertType: CHEF_PRESENCE_ALERT_TYPE },
          signal,
        })
      ).data,
    enabled: isTodayView,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const monthStart = useMemo(() => dayjs().tz(SITE_TIMEZONE).startOf("month").format("YYYY-MM-DD"), []);
  const monthViolationsQ = useQuery({
    queryKey: ["dashboard", "violations-summary-month", monthStart],
    queryFn: async ({ signal }) =>
      (
        await api.get<{ total: number; byType: Record<string, number> }>("/dashboard/violations-summary", {
          params: { from: monthStart, to: ymdSite() },
          signal,
        })
      ).data,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const topViolationTypes = useMemo(() => {
    const byType = monthViolationsQ.data?.byType ?? trafficViolationsByType;
    return Object.entries(byType)
      .map(([type, count]) => ({ type, count: count ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [monthViolationsQ.data?.byType, trafficViolationsByType]);

  const peoplePending = (!walkinsQ.data && walkinsQ.isPending) || (!crowdsQ.data && crowdsQ.isPending);
  const peakHour = walkinsQ.data?.peakHour;
  const peakHourHint =
    peakHour && peakHour.total > 0
      ? `Busiest ${String(peakHour.hour).padStart(2, "0")}:00 · ${peakHour.total.toLocaleString()} guests`
      : undefined;

  const trendLabel = isTodayView ? "vs yesterday (same time)" : "vs prior period";
  const shortTrendLabel = isTodayView ? "vs yesterday" : "vs prior period";
  const officersOnline = overview?.camerasReporting ?? overview?.camerasOnline ?? 0;
  const prior = priorOverviewQ.data;
  const violationsTrend = formatTrendHint(trafficViolationsTotal, prior?.trafficViolationCount ?? 0, trendLabel);
  const readsTrend = formatTrendHint(overview?.totalReads ?? 0, prior?.totalReads ?? 0, trendLabel);
  const readsTrendShort = formatTrendHint(overview?.totalReads ?? 0, prior?.totalReads ?? 0, shortTrendLabel);
  const distinctPlatesTrend = formatTrendHint(overview?.uniquePlates ?? 0, prior?.uniquePlates ?? 0, shortTrendLabel);
  const priorWatchlistCount = priorWatchlistQ.data?.rows?.length ?? 0;
  const watchlistTrend = formatTrendHint(watchlistHitCount, priorWatchlistCount, trendLabel);

  const chefPresenceCount = chefPresenceQ.data?.total ?? 0;
  const chefPresencePending = !chefPresenceQ.data && chefPresenceQ.isPending;
  const chefPresenceTrend = isTodayView
    ? formatTrendHint(chefPresenceCount, priorChefPresenceQ.data?.total ?? 0, trendLabel)
    : undefined;

  useEffect(() => {
    setRightSlot(
      <MastheadDashboardToolbar
          preset={preset}
          onPresetChange={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          resolvedFrom={from}
          resolvedTo={to}
          onResetToToday={() => {
            const d = defaultTodayRange();
            setPreset("today");
            setCustomFrom(d.from);
            setCustomTo(d.to);
          }}
        />
    );
    return () => setRightSlot(null);
  }, [setRightSlot, preset, customFrom, customTo, from, to]);

  return (
    <DashboardOperationalView
      error={overviewQ.isError}
      pending={overviewPending}
      from={from}
      to={to}
        violations={trafficViolationsTotal}
      violationsTrend={violationsTrend}
      reads={overview?.totalReads ?? 0}
      readsTrend={readsTrend}
      watchlistHits={watchlistHitCount}
      watchlistTrend={watchlistTrend}
      chefPresence={chefPresenceCount}
      chefPresenceTrend={chefPresenceTrend}
      chefPresencePending={chefPresencePending}
      camerasOnline={streamSummary?.onlineCount ?? overview?.camerasOnline ?? 0}
      camerasTotal={streamSummary?.total ?? overview?.camerasDeployed ?? 0}
      cameraUptimePercent={overview?.cameraUptimePercent}
      officersValue={officersOnline.toLocaleString()}
      officersHint="Across all units"
      trafficViolationsByType={trafficViolationsByType}
      violationTotal={trafficViolationsTotal}
      streams={streamSummary?.streams ?? []}
      heatmap={heatmapQ.data}
      heatmapPending={heatmapPending}
      topPlates={topPlatesQ.data?.rows ?? []}
      topPlatesPending={topPlatesPending}
      watchlistRows={watchlistQ.data?.rows ?? []}
      watchlistPending={watchlistPending}
      activeWatchlists={watchlistQ.data?.activeWatchlists}
      lastWatchlistHit={watchlistQ.data?.lastHit}
      distinctPlatesTrend={distinctPlatesTrend}
      topViolationTypes={topViolationTypes}
      attributes={overview?.attributes ?? []}
      totalReads={overview?.totalReads ?? 0}
      uniquePlates={overview?.uniquePlates ?? 0}
      topPlate={overview?.topPlate ?? null}
      busiestCamera={overview?.busiestCamera}
      activityReadsTrend={readsTrendShort}
      sparkTotals={sparkTotals}
      recentViolations={recentViolationsQ.data?.rows ?? []}
      recentPending={!recentViolationsQ.data && recentViolationsQ.isPending}
      onOpenViolations={openViolations}
      onOpenVehicleReport={(opts) => openReport({ from, to, ...opts })}
      violationsByCamera={overview?.trafficViolationsByCamera ?? []}
      spanDays={spanDays}
      guestFootfall={walkinsQ.data?.total ?? 0}
      guestFootfallTrend={peakHourHint}
      occupancyAlerts={crowdsQ.data?.total ?? 0}
      peoplePending={peoplePending}
      onOpenWalkins={() => goWalkinsReport(navigate, { from, to })}
      onOpenCrowds={() => goCrowdsReport(navigate, { from, to })}
      onOpenWatchlists={goChefPresence}
      onOpenLiveView={(id) => navigate(id ? `/live-view?stream=${encodeURIComponent(id)}` : "/live-view")}
      onHeatmapCell={(cameraId, hourIndex) => {
        const h = heatmapQ.data?.hours?.[hourIndex];
                  openReport({
                    from,
                    to,
          cameraId,
          ...(h != null ? { hour: Number(h) } : {}),
        });
      }}
    />
  );
}
