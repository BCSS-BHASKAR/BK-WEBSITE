import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import dayjs from "dayjs";
import { api } from "../../../lib/api";
import { usePermissions } from "../../../lib/permissions";
import { useAutoRefreshMs } from "../../../lib/useAppSettings";
import { displayCameraName } from "../../../lib/cameraDisplay";
import { SITE_TIMEZONE, ymdSite } from "../../../lib/siteTimeZone";
import { MODULE_BY_KEY } from "../../../lib/inferenceModules";
import { MonitoringMediaViewer } from "../../monitoring/MonitoringMediaViewer";
import type { MonitoringRow } from "../../monitoring/MonitoringEventsTable";
import { bk, BK_GAP } from "./bkTokens";
import { StandingPersonIcon } from "./bkIcons";
import { BkKpiRow, type Delta } from "./BkKpiRow";
import { buildDelta, previousRange } from "../../../lib/rangeCompare";
import { BkWalkinsTrend, type TrendGrain, type TrendPoint } from "./BkWalkinsTrend";
import { BkLiveCameras, type CameraMetric, type CameraTile } from "./BkLiveCameras";
import { BkIntruderPanel, type IntruderRow, type IntruderSeverity } from "./BkIntruderPanel";
import { BkDonutPanel, type DonutSlice } from "./BkDonutPanel";
import { BkCamerasHealth } from "./BkCamerasHealth";
import { BkValueProps } from "./BkValueProps";
import TrackChangesRounded from "@mui/icons-material/TrackChangesRounded";

// ===========================================================================
// PLACEHOLDERS
//
// Two figures in the design have no endpoint behind them. They are rendered
// with the mockup's values so the layout is complete, and isolated here so that
// nothing else in this file can be mistaken for unmeasured data. Delete the
// constant and pass the real value the moment an endpoint exists.
// ===========================================================================
const PLACEHOLDER = {
  /**
   * intrusion_event carries no severity column, and nothing else on the row
   * ranks an intrusion. This is the design's fixed sequence, applied by list
   * position - NOT a measurement of the events shown.
   */
  intruderSeverity: ["Medium", "Low", "Low"] as IntruderSeverity[],
  /**
   * /inference/summary reports bytes stored but no disk capacity, so a
   * utilisation percentage cannot be computed. Set to null once a capacity
   * figure is available and the meter will read "Not reported" until then.
   */
  storagePct: 64 as number | null,
};

// Everything that warrants attention, i.e. every module except walk-ins.
// Walk-ins are footfall, not something to act on. Identical to the rule the
// previous dashboard used, so the two can never report different alert totals.
const ALERT_SERVICES = ["loitering", "intrusion", "after_hours", "chef_absence"] as const;

/** Slice hues for the loitering donut, in the design's order. */
const LOITERING_COLOURS = [bk.green, bk.amber, bk.red, "#B39DDB"];

/** Overlay-chip tone per service, assigned by identity and never by rank. */
const SERVICE_TONE: Record<string, CameraMetric["tone"]> = {
  walkins: "green",
  loitering: "orange",
  intrusion: "red",
  after_hours: "orange",
  chef_absence: "purple",
};
const SERVICE_LABEL: Record<string, string> = {
  walkins: "Walk-ins",
  loitering: "Loitering",
  intrusion: "Intruder",
  after_hours: "After Hours",
  chef_absence: "Chef",
};

type Summary = { counts: Record<string, number | string> };
type Stats = {
  byDay: { day: string; service: string; n: number }[];
  byCamera: { service: string; camera_key: string; n: number }[];
};
type StreamRow = { id: string; name: string; online: boolean; checking?: boolean };

/** Strip case and punctuation so "Right Entrance" matches "right_entrance". */
function normKey(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/**
 * Period-over-period change for one service.
 *
 * Counts the WHOLE selected range and compares it with the equal-length window
 * immediately before it, so the percentage describes the number printed above
 * it. An earlier version always compared the last two calendar days, which on a
 * "Last 30 days" view put a today-vs-yesterday delta under a 30-day total.
 *
 * Both windows are summed from byDay, which only contains days that HAVE
 * events - absent days are simply not added, which is the same as zero.
 */
function deltaFor(
  byDay: Stats["byDay"],
  prevByDay: Stats["byDay"],
  service: string,
  from?: string,
  to?: string
): Delta {
  if (!from || !to) return { pct: null, label: "no comparison range" };
  const sum = (rows: Stats["byDay"]) =>
    rows.reduce((a, r) => (r.service === service ? a + Number(r.n) : a), 0);
  return buildDelta(sum(byDay), sum(prevByDay), from, to);
}

export function BkDashboardView({ from, to }: { from?: string; to?: string }) {
  const navigate = useNavigate();
  const refetchInterval = useAutoRefreshMs();
  const { can } = usePermissions();
  const [grain, setGrain] = useState<TrendGrain>("day");
  const [intruderIndex, setIntruderIndex] = useState<number | null>(null);

  // Each endpoint sits behind its own RBAC grant (server/src/lib/pages.js), so
  // each query is enabled only when the grant is held. Asking anyway would retry
  // a request that can never succeed and leave the tile printing a confident
  // zero for data this account is simply not allowed to see.
  const canWalkins = can("monitoring_walkins");
  const canIntrusion = can("monitoring_intrusion");
  const canChef = can("monitoring_chef_absence");
  const canCameras = can("cameras_online");

  const range = from && to ? { from, to } : {};

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["bk", "summary", from, to],
    queryFn: async () => (await api.get("/inference/summary", { params: range })).data as Summary,
    refetchInterval,
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["bk", "stats", from, to],
    queryFn: async () => (await api.get("/inference/stats", { params: { days: 14, ...range } })).data as Stats,
    refetchInterval,
  });

  /**
   * The equal-length window immediately before the selected one. Only the KPI
   * deltas read this; every other panel is scoped to the visible range.
   */
  const prevRange = useMemo(() => (from && to ? previousRange(from, to) : null), [from, to]);

  const { data: prevStats } = useQuery({
    queryKey: ["bk", "stats-prev", prevRange?.from, prevRange?.to],
    queryFn: async () =>
      (await api.get("/inference/stats", { params: prevRange! })).data as Stats,
    enabled: Boolean(prevRange),
    refetchInterval,
  });

  const { data: chefKpis } = useQuery({
    queryKey: ["bk", "chef-kpis", from, to],
    queryFn: async () =>
      (await api.get("/inference/chef-absence/kpis", { params: range })).data as {
        chef: number; nonChef: number;
      },
    enabled: canChef,
    refetchInterval,
  });

  const { data: streamData, isError: streamsError, isLoading: loadingStreams } = useQuery({
    queryKey: ["bk", "streams"],
    queryFn: async () => (await api.get("/streams")).data as { streams: StreamRow[] },
    enabled: canCameras,
    refetchInterval,
  });

  const { data: intrusions, isLoading: loadingIntrusions } = useQuery({
    queryKey: ["bk", "intrusion", from, to],
    queryFn: async () =>
      (await api.get("/inference/intrusion", { params: { pageSize: 3, ...range } })).data as {
        rows: {
          id: number; camera_key: string; occurred_at: string;
          mediaUrl?: string; posterUrl?: string; isVideo?: boolean;
        }[];
      },
    enabled: canIntrusion,
    refetchInterval,
  });

  // The Day/Week/Month control owns its own window rather than slicing the
  // masthead range: "Day" means hour-by-hour for today, which has no sensible
  // reading over a seven-day range.
  const trendRange = useMemo(() => {
    const today = ymdSite();
    if (grain === "day") return { from: today, to: today };
    const back = grain === "week" ? 6 : 29;
    return { from: dayjs().tz(SITE_TIMEZONE).subtract(back, "day").format("YYYY-MM-DD"), to: today };
  }, [grain]);

  const { data: walkinsAnalytics, isLoading: loadingTrend } = useQuery({
    queryKey: ["bk", "walkins-analytics", grain, trendRange.from, trendRange.to],
    queryFn: async () =>
      (await api.get("/inference/analytics/walkins", { params: trendRange })).data as {
        byDay: { day: string; n: number }[];
        byHour: { hour: number; n: number }[];
      },
    enabled: canWalkins,
    refetchInterval,
  });

  const trendPoints: TrendPoint[] = useMemo(() => {
    if (grain === "day") {
      const map = new Map((walkinsAnalytics?.byHour || []).map((r) => [Number(r.hour), Number(r.n)]));
      const active = [...map.entries()].filter(([, n]) => n > 0).map(([h]) => h);
      // The design frames a service window rather than a flat overnight run of
      // zeros. The window is derived from the data and padded by an hour, so it
      // can widen but can never hide an hour that recorded a walk-in. With no
      // data at all it falls back to the design's 7 AM - 10 PM.
      let start = active.length ? Math.max(0, Math.min(...active) - 1) : 7;
      let end = active.length ? Math.min(23, Math.max(...active) + 1) : 22;
      if (end - start < 7) end = Math.min(23, start + 7);
      if (end - start < 7) start = Math.max(0, end - 7);
      const points: TrendPoint[] = [];
      for (let h = start; h <= end; h += 1) points.push({ label: hourLabel(h), n: map.get(h) || 0 });
      return points;
    }
    // Zero-fill the calendar so a quiet day is a dip, not a missing point that
    // the line interpolates straight through.
    const map = new Map(
      (walkinsAnalytics?.byDay || []).map((r) => [String(r.day).slice(0, 10), Number(r.n)])
    );
    const points: TrendPoint[] = [];
    let cursor = dayjs(trendRange.from);
    const end = dayjs(trendRange.to);
    while (!cursor.isAfter(end) && points.length < 92) {
      const ymd = cursor.format("YYYY-MM-DD");
      points.push({ label: cursor.format("DD MMM"), n: map.get(ymd) || 0 });
      cursor = cursor.add(1, "day");
    }
    return points;
  }, [grain, walkinsAnalytics, trendRange]);

  const counts = summary?.counts || {};
  const num = (k: string) => Number(counts[k] || 0);
  const byDay = stats?.byDay || [];
  const prevByDay = prevStats?.byDay || [];
  const totalAlerts = ALERT_SERVICES.reduce((a, s) => a + num(s), 0);

  // Camera tiles: streams supply the feed, stats.byCamera supplies the overlay
  // figures. A stream that cannot be matched to an inference camera key shows no
  // chip rather than another camera's numbers.
  const cameraTiles: CameraTile[] = useMemo(() => {
    const activity = new Map<string, { service: string; n: number }[]>();
    for (const r of stats?.byCamera || []) {
      const key = normKey(r.camera_key);
      if (!key) continue;
      const list = activity.get(key) || [];
      list.push({ service: r.service, n: Number(r.n) });
      activity.set(key, list);
    }
    return (streamData?.streams || []).slice(0, 4).map((s) => {
      const hit = activity.get(normKey(s.id)) || activity.get(normKey(s.name)) || [];
      const metrics: CameraMetric[] = [...hit]
        .sort((a, b) => b.n - a.n)
        .slice(0, 2)
        .filter((m) => SERVICE_LABEL[m.service])
        .map((m) => ({ label: SERVICE_LABEL[m.service], value: m.n, tone: SERVICE_TONE[m.service] ?? "green" }));
      return { id: s.id, name: s.name, online: s.online, metrics };
    });
  }, [streamData, stats]);

  const loiteringSlices: DonutSlice[] = useMemo(() => {
    const byCam = new Map<string, number>();
    for (const r of stats?.byCamera || []) {
      if (r.service !== "loitering") continue;
      const name = displayCameraName(r.camera_key, r.camera_key) || "Unknown";
      byCam.set(name, (byCam.get(name) || 0) + Number(r.n));
    }
    const ranked = [...byCam.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const head = ranked.slice(0, 3);
    const tail = ranked.slice(3);
    const slices: DonutSlice[] = head.map((r, i) => ({ ...r, colour: LOITERING_COLOURS[i] }));
    if (tail.length) {
      slices.push({
        name: "Other Areas",
        value: tail.reduce((a, r) => a + r.value, 0),
        colour: LOITERING_COLOURS[3],
      });
    }
    return slices;
  }, [stats]);

  const intruderRows: IntruderRow[] = useMemo(
    () =>
      (intrusions?.rows || []).slice(0, 3).map((r, i) => {
        const at = dayjs(r.occurred_at).tz(SITE_TIMEZONE);
        const isToday = at.format("YYYY-MM-DD") === ymdSite();
        return {
          id: String(r.id),
          area: displayCameraName(r.camera_key, r.camera_key) || "Unknown area",
          when: at.isValid()
            ? `${isToday ? "Today" : at.format("DD MMM")}, ${at.format("hh:mm A")}`
            : "—",
          thumbUrl: r.posterUrl || (!r.isVideo ? r.mediaUrl : undefined),
          severity: PLACEHOLDER.intruderSeverity[i] ?? "Low",
        };
      }),
    [intrusions]
  );

  // A stream is Online when its probe succeeded, Unreachable while the probe has
  // not yet returned a verdict, and Offline once a completed probe found it down
  // or no stream is configured for it. Recording counts the feeds actually
  // producing HLS segments, which is exactly the online set.
  const allStreams = streamData?.streams || [];
  const online = allStreams.filter((s) => s.online).length;
  const unreachable = allStreams.filter((s) => !s.online && s.checking).length;
  const offline = allStreams.length - online - unreachable;

  const chef = Number(chefKpis?.chef || 0);
  const nonChef = Number(chefKpis?.nonChef || 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: BK_GAP, minWidth: 0 }}>
      <BkKpiRow
        walkins={num("walkins")}
        walkinsDelta={deltaFor(byDay, prevByDay, "walkins", from, to)}
        intrusions={num("intrusion")}
        intrusionsDelta={deltaFor(byDay, prevByDay, "intrusion", from, to)}
        chef={chef}
        nonChef={nonChef}
        loitering={num("loitering")}
        loiteringDelta={deltaFor(byDay, prevByDay, "loitering", from, to)}
        totalAlerts={totalAlerts}
        onWalkins={canWalkins ? () => navigate(MODULE_BY_KEY.walkins.route) : undefined}
        onIntrusions={canIntrusion ? () => navigate(MODULE_BY_KEY.intrusion.route) : undefined}
        onChef={canChef ? () => navigate(MODULE_BY_KEY.chef_absence.route) : undefined}
        onLoitering={can("monitoring_loitering") ? () => navigate(MODULE_BY_KEY.loitering.route) : undefined}
        onAlerts={can("active_alerts") ? () => navigate("/crowds-report") : undefined}
      />

      {/* Trend and cameras share a row at the design's 5:7 split. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 5fr) minmax(0, 7fr)" },
          gap: BK_GAP,
          alignItems: "stretch",
        }}
      >
        <BkWalkinsTrend
          grain={grain}
          onGrainChange={setGrain}
          points={trendPoints}
          // Every third hour on the day view, as the design labels it. The day
          // and month views carry too many points to label exhaustively, so they
          // fall back to the axis thinning itself.
          xTickInterval={grain === "day" ? 2 : grain === "week" ? 0 : undefined}
          loading={loadingTrend || loadingStats}
        />
        <BkLiveCameras
          tiles={cameraTiles}
          loading={loadingStreams && !streamsError}
          onOpen={canCameras ? () => navigate("/live-view") : undefined}
        />
      </Box>

      {/* Three detail panels. The column weights are the design's measured
          widths rather than equal thirds - the legends need progressively more
          room from left to right. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "minmax(0, 358fr) minmax(0, 402fr) minmax(0, 444fr)",
          },
          gap: BK_GAP,
          alignItems: "stretch",
        }}
      >
        <BkIntruderPanel
          rows={intruderRows}
          loading={loadingIntrusions}
          onViewAll={canIntrusion ? () => navigate(MODULE_BY_KEY.intrusion.route) : undefined}
          onOpen={intruderRows.length ? (i) => setIntruderIndex(i) : undefined}
        />

        <BkDonutPanel
          title="Loitering Detection"
          icon={<StandingPersonIcon sx={{ fontSize: 20, color: bk.orange }} />}
          slices={loiteringSlices}
          centerValue={loiteringSlices.reduce((a, s) => a + s.value, 0)}
          centerLabel="Total Alerts"
          footerLabel="View All Loitering Events"
          onFooter={can("monitoring_loitering") ? () => navigate(MODULE_BY_KEY.loitering.route) : undefined}
          emptyLabel="No loitering recorded in this period"
          loading={loadingStats}
        />

        <BkDonutPanel
          title="Chef / Non-Chef Summary"
          icon={<TrackChangesRounded sx={{ fontSize: 20, color: bk.orange }} />}
          slices={[
            { name: "Chef", value: chef, colour: bk.purple },
            { name: "Non-Chef", value: nonChef, colour: bk.orange },
          ]}
          centerValue={chef + nonChef}
          centerLabel="Total"
          size={150}
          footerLabel="View Detailed Report"
          onFooter={canChef ? () => navigate(MODULE_BY_KEY.chef_absence.route) : undefined}
          emptyLabel={canChef ? "No kitchen staff seen in this period" : "Kitchen data not available to this account"}
          loading={loadingSummary}
        />
      </Box>

      <BkCamerasHealth
        online={online}
        offline={offline}
        unreachable={unreachable}
        recording={online}
        storagePct={PLACEHOLDER.storagePct}
        onViewHealth={canCameras ? () => navigate("/live-view") : undefined}
      />

      <BkValueProps />

      {/* Opening an intrusion reuses the Monitoring viewer, so evidence behaves
          identically wherever it is opened from. */}
      {intruderIndex !== null && (intrusions?.rows || [])[intruderIndex] ? (
        <MonitoringMediaViewer
          open
          module={MODULE_BY_KEY.intrusion}
          rows={(intrusions?.rows || []).slice(0, 3).map((r) => ({
            ...r,
            detected_at: r.occurred_at,
          })) as unknown as MonitoringRow[]}
          index={intruderIndex}
          onIndexChange={setIntruderIndex}
          onClose={() => setIntruderIndex(null)}
          verdictFor={() => null}
          onFeedback={() => {}}
        />
      ) : null}
    </Box>
  );
}
