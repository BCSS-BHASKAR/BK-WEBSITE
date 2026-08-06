import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { SITE_LABELS } from "./siteLabels";
import { violationTypeLabel, violationTypeMeta } from "./violationTypes";
import { daysInclusive } from "./dashboardRange";
import { SITE_TIMEZONE, dayjsInSite, formatChartDayTick, formatChartHourTick } from "./siteTimeZone";
import { reportParamsFromPeakBucket } from "./dashboardReportNav";
import { buildVehicleReportSearch } from "./vehicleReportNav";

export type InsightIconKind = "arrow" | "plus" | "ring" | "alert" | "statusDot";

dayjs.extend(utc);
dayjs.extend(timezone);

type TsPoint = {
  bucket: string;
  total: number;
  hourStartUnix?: number;
  drillDay?: string;
  partial?: boolean;
};

type OverviewLike = {
  from: string;
  to: string;
  totalReads: number;
  uniquePlates: number;
  trafficViolationCount?: number;
  trafficViolationsByType?: Record<string, number>;
  windowKind?: string;
  timeseries: TsPoint[];
  cameras: { name: string; total: number; camera_id?: string }[];
  camerasReporting?: number;
  camerasOnline?: number;
  camerasDeployed?: number;
  cameraOnlineStaleMinutes?: number;
  peakInterval?: TsPoint;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_SITE_YMD_H00 = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/;

function normalizePeakBucket(raw: unknown): string {
  if (raw == null) return "";
  if (raw instanceof Date) {
    const d = dayjs(raw).tz(SITE_TIMEZONE);
    return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : "";
  }
  const s = String(raw).trim();
  const isoDay = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (isoDay && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = dayjs.tz(s, SITE_TIMEZONE);
    if (d.isValid()) return d.format("YYYY-MM-DD HH:mm");
  }
  return s;
}

function formatBusiestPeakValue(overview: OverviewLike, peak: TsPoint): string {
  if (peak.total <= 0) return "-";
  const siteNow = dayjs().tz(SITE_TIMEZONE);
  const thisYear = siteNow.year();
  const spanDays = daysInclusive(overview.from, overview.to);
  const b = normalizePeakBucket(peak.bucket);

  if (spanDays > 1) {
    if (typeof peak.hourStartUnix === "number" && Number.isFinite(peak.hourStartUnix)) {
      const d = dayjs.unix(peak.hourStartUnix).tz(SITE_TIMEZONE).add(1, "hour");
      if (d.isValid()) {
        return d.year() === thisYear ? d.format("D MMM, HH:mm") : d.format("D MMM YYYY, HH:mm");
      }
    }
    const slot = SLOT_SITE_YMD_H00.exec(b);
    if (slot) {
      const d = dayjs.tz(`${slot[1]} ${slot[2]}:00:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
      if (d.isValid()) {
        return d.year() === thisYear ? d.format("D MMM, HH:mm") : d.format("D MMM YYYY, HH:mm");
      }
    }
  }

  if (typeof peak.hourStartUnix === "number" && Number.isFinite(peak.hourStartUnix)) {
    const d = dayjs.unix(peak.hourStartUnix).tz(SITE_TIMEZONE).add(1, "hour");
    if (!d.isValid()) return "-";
    return d.year() === thisYear ? d.format("D MMM, HH:mm") : d.format("D MMM YYYY, HH:mm");
  }

  const slot = SLOT_SITE_YMD_H00.exec(b);
  if (slot) {
    const d = dayjs.tz(`${slot[1]} ${slot[2]}:00:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
    if (!d.isValid()) return "-";
    return d.year() === thisYear ? d.format("D MMM, HH:mm") : d.format("D MMM YYYY, HH:mm");
  }

  if (ISO_DAY.test(overview.from) && /^\d{1,2}:\d{2}$/.test(b)) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(b);
    if (m) {
      const d = dayjs
        .tz(overview.from, "YYYY-MM-DD", SITE_TIMEZONE)
        .hour(Number(m[1]))
        .minute(Number(m[2]))
        .second(0)
        .millisecond(0);
      if (d.isValid()) {
        return d.year() === thisYear ? d.format("D MMM, HH:mm") : d.format("D MMM YYYY, HH:mm");
      }
    }
  }

  if (/\d{4}-\d{2}-\d{2}[ T]/.test(b)) {
    const d = dayjs.tz(b.replace(" ", "T"), SITE_TIMEZONE);
    if (d.isValid()) {
      return d.year() === thisYear ? d.format("D MMM, HH:mm") : d.format("D MMM YYYY, HH:mm");
    }
  }

  if (ISO_DAY.test(b) && spanDays <= 1) {
    const d = dayjsInSite(b);
    if (d.isValid()) {
      return d.year() === thisYear ? d.format("D MMM") : d.format("D MMM YYYY");
    }
  }

  const tick = formatChartHourTick(b);
  if (tick && tick !== b && tick.includes(":")) return tick;

  return "-";
}

function findPeakFromTimeseries(overview: OverviewLike): TsPoint {
  const ts = overview.timeseries ?? [];
  let peak: TsPoint = ts[0] ?? { bucket: "-", total: 0 };
  for (const p of ts) {
    if (p.total > peak.total) peak = p;
  }
  return peak;
}

function formatPeakIntervalHint(overview: OverviewLike, peak: TsPoint): string {
  const rangeHint = formatOverviewRangeHint(overview);
  if (peak.total <= 0) return rangeHint;
  const spanDays = daysInclusive(overview.from, overview.to);
  if (spanDays <= 1) {
    return `${peak.total.toLocaleString()} reads`;
  }
  return `${peak.total.toLocaleString()} reads · ${rangeHint}`;
}

export type DashboardInsight = {
  title: string;
  value: string;
  hint: string;
  to?: string;
  accent?: string;
  icon?: InsightIconKind;
};

export type StreamStatusSummary = {
  onlineCount: number;
  total: number;
  allOnline: boolean;
};

function violationsPath(o: OverviewLike, type?: string): string {
  const p = new URLSearchParams({ from: o.from, to: o.to });
  if (type) p.set("type", type);
  return `/violations?${p.toString()}`;
}

function vehicleReportPath(o: OverviewLike, attr?: "PRIVATE" | "PUBLIC_UTILITY"): string {
  const qs = buildVehicleReportSearch({
    from: o.from,
    to: o.to,
    ...(attr ? { attr } : {}),
  });
  return `/vehicle-report?${qs}`;
}

const loadingRow = (title: string, accent = "#1d4ed8", icon?: InsightIconKind): DashboardInsight => ({
  title,
  value: "-",
  hint: "",
  accent,
  icon,
});

function cameraCoverageInsight(
  overview: OverviewLike,
  streamStatus?: StreamStatusSummary
): DashboardInsight {
  if (streamStatus && streamStatus.total > 0) {
    const offline = streamStatus.total - streamStatus.onlineCount;
    return {
      title: SITE_LABELS.anprSitesOnline,
      value: `${streamStatus.onlineCount}/${streamStatus.total}`,
      hint: streamStatus.allOnline
        ? SITE_LABELS.allCamerasOnline
        : SITE_LABELS.camerasOffline.replace("{count}", String(offline)),
      to: "/live-view",
      accent: streamStatus.allOnline ? "#16A34A" : "#DC2626",
      icon: "statusDot",
    };
  }
  const online = overview.camerasOnline ?? overview.camerasReporting ?? 0;
  const deployed = overview.camerasDeployed ?? 0;
  const value = deployed > 0 ? `${online}/${deployed}` : String(online);
  const allOnline = deployed > 0 && online === deployed;
  const offline = Math.max(0, deployed - online);

  return {
    title: SITE_LABELS.anprSitesOnline,
    value,
    hint: allOnline ? formatOverviewRangeHint(overview) : offline > 0 ? `${offline} offline` : formatOverviewRangeHint(overview),
    to: "/live-view",
    accent: allOnline ? "#059669" : "#dc2626",
    icon: "statusDot",
  };
}

function formatOverviewRangeHint(o: OverviewLike): string {
  return o.from === o.to
    ? formatChartDayTick(o.from)
    : `${formatChartDayTick(o.from)} – ${formatChartDayTick(o.to)}`;
}

function leadingViolationInsight(overview: OverviewLike): DashboardInsight {
  const violationCount = overview.trafficViolationCount ?? 0;
  const byType = overview.trafficViolationsByType ?? {};
  const top = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  const topType = top?.[0];
  const topLabel = topType ? violationTypeLabel(topType) : "-";

  return {
    title: SITE_LABELS.leadingViolationType,
    value: violationCount > 0 && topType ? topLabel : "-",
    hint: violationCount > 0 ? `${violationCount.toLocaleString()} total` : formatOverviewRangeHint(overview),
    to: topType ? violationsPath(overview, topType) : violationsPath(overview),
    accent: topType ? (violationTypeMeta(topType)?.color ?? "#dc2626") : "#dc2626",
    icon: "alert",
  };
}

export function buildDashboardInsights(
  overview: OverviewLike | undefined,
  watchlistHitCount?: number,
  streamStatus?: StreamStatusSummary
): DashboardInsight[] {
  if (!overview) {
    return [
      loadingRow(SITE_LABELS.anprSitesOnline, "#9CA3AF", "statusDot"),
      loadingRow(SITE_LABELS.leadingViolationType, "#dc2626", "alert"),
      loadingRow(SITE_LABELS.peakInterval, "#0ea5e9", "plus"),
      loadingRow(SITE_LABELS.hotlistMatches, "#7c3aed", "ring"),
    ];
  }

  const watchlistTile: DashboardInsight = {
    title: SITE_LABELS.hotlistMatches,
    value: watchlistHitCount != null ? String(watchlistHitCount) : "-",
    hint: formatOverviewRangeHint(overview),
    to: vehicleReportPath(overview),
    accent: "#7c3aed",
    icon: "ring",
  };

  if (overview.totalReads <= 0) {
    return [
      cameraCoverageInsight(overview, streamStatus),
      leadingViolationInsight(overview),
      {
        title: SITE_LABELS.peakInterval,
        value: "-",
        hint: formatOverviewRangeHint(overview),
        to: `/vehicle-report?${buildVehicleReportSearch({ from: overview.from, to: overview.to })}`,
        accent: "#0ea5e9",
        icon: "plus",
      },
      watchlistTile,
    ];
  }

  const peak = overview.peakInterval ?? findPeakFromTimeseries(overview);
  const peakReport = reportParamsFromPeakBucket(
    peak ? { name: peak.bucket, drillDay: peak.drillDay, hourStartUnix: peak.hourStartUnix } : undefined,
    { from: overview.from, to: overview.to }
  );

  return [
    cameraCoverageInsight(overview, streamStatus),
    leadingViolationInsight(overview),
    {
      title: SITE_LABELS.peakInterval,
      value: formatBusiestPeakValue(overview, peak),
      hint: formatPeakIntervalHint(overview, peak),
      to: `/vehicle-report?${buildVehicleReportSearch(peakReport)}`,
      accent: "#0ea5e9",
      icon: "plus",
    },
    watchlistTile,
  ];
}
