import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import isoWeek from "dayjs/plugin/isoWeek";
import { SITE_TIMEZONE, formatChartDayTick, ymdSite } from "./siteTimeZone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

export { ymdSite };

export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "week" | "month" | "custom";

function siteNow() {
  return dayjs().tz(SITE_TIMEZONE);
}

export function defaultTodayRange(): { from: string; to: string } {
  const t = ymdSite();
  return { from: t, to: t };
}

export function defaultLast7Range(): { from: string; to: string } {
  const today = ymdSite();
  return { from: siteNow().subtract(6, "day").format("YYYY-MM-DD"), to: today };
}

export function normalizeCustomRange(from: string, to: string): { from: string; to: string } {
  if (from > to) return { from: to, to: from };
  return { from, to };
}

export function daysInclusive(fromStr: string | null, toStr: string | null): number {
  if (!fromStr || !toStr) return 0;
  const a = dayjs.tz(fromStr, "YYYY-MM-DD", SITE_TIMEZONE);
  const b = dayjs.tz(toStr, "YYYY-MM-DD", SITE_TIMEZONE);
  if (!a.isValid() || !b.isValid() || b.isBefore(a)) return 0;
  return b.diff(a, "day") + 1;
}

export function ymdFromDetectedAt(raw: string | undefined | null): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw || "").trim());
  return match ? match[1] : "";
}

export function journeyRangeFromStops(
  stops: { detectedAt: string }[]
): { from: string; to: string } | null {
  if (!stops.length) return null;
  const from = ymdFromDetectedAt(stops[0].detectedAt);
  const to = ymdFromDetectedAt(stops[stops.length - 1].detectedAt);
  if (!from || !to) return null;
  return normalizeCustomRange(from, to);
}

export function journeyQueryRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { from: string; to: string } | null {
  if (preset === "custom") {
    if (!customFrom || !customTo) return null;
    return normalizeCustomRange(customFrom, customTo);
  }
  return datedRangeFromPreset(preset, customFrom, customTo);
}

export function formatRangeTitle(
  from: string | null,
  to: string | null,
  emptyLabel = "Today"
): string {
  if (!from || !to) return emptyLabel;
  const today = ymdSite();
  if (from === to) {
    if (from === today) return "Today";
    return formatChartDayTick(from);
  }
  return `${formatChartDayTick(from)} – ${formatChartDayTick(to)}`;
}

export function rangeFromPreset(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  const now = siteNow();
  const today = now.format("YYYY-MM-DD");
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = now.subtract(1, "day").format("YYYY-MM-DD");
      return { from: y, to: y };
    }
    case "last7":
      return { from: now.subtract(6, "day").format("YYYY-MM-DD"), to: today };
    case "last30":
      return { from: now.subtract(29, "day").format("YYYY-MM-DD"), to: today };
    case "week": {
      return {
        from: now.startOf("isoWeek").format("YYYY-MM-DD"),
        to: now.endOf("isoWeek").format("YYYY-MM-DD"),
      };
    }
    case "month":
      return {
        from: now.startOf("month").format("YYYY-MM-DD"),
        to: now.endOf("month").format("YYYY-MM-DD"),
      };
    case "custom":
      return normalizeCustomRange(customFrom, customTo);
    default:
      return { from: today, to: today };
  }
}

export function datedRangeFromPreset(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  return rangeFromPreset(preset, customFrom, customTo);
}
