import dayjs from "dayjs";
import { SITE_TIMEZONE, ymdSite } from "./siteTimeZone";

/**
 * Period-over-period comparison for KPI cards.
 *
 * Every card that shows a count for a date range also shows how that count moved
 * against the period immediately before it - up in green, down in red. The
 * comparison window is always the SAME LENGTH as the selected one and sits
 * directly behind it, so the percentage is describing the number printed above
 * it rather than some fixed "yesterday" that has nothing to do with the range on
 * screen.
 *
 *   Today          -> the day before        -> "vs yesterday"
 *   Last 7 days    -> the 7 days before     -> "vs previous 7 days"
 *   04-06 Aug      -> 01-03 Aug             -> "vs previous 3 days"
 */

export type RangeDelta = {
  /** Signed percentage change, or null when it cannot be computed. */
  pct: number | null;
  /** "vs yesterday", "vs previous 7 days", or the reason there is no figure. */
  label: string;
  direction: "up" | "down" | "flat" | "none";
};

/** Inclusive day count of a range. */
export function rangeLengthDays(from: string, to: string): number {
  const a = dayjs(from);
  const b = dayjs(to);
  if (!a.isValid() || !b.isValid()) return 0;
  return Math.max(1, b.diff(a, "day") + 1);
}

/**
 * The equal-length window immediately before [from, to].
 *
 * Ends the day before `from` so the two windows never overlap - an overlapping
 * baseline would dilute every change toward zero.
 */
export function previousRange(from: string, to: string): { from: string; to: string } | null {
  if (!from || !to) return null;
  const days = rangeLengthDays(from, to);
  if (!days) return null;
  const prevTo = dayjs(from).subtract(1, "day");
  const prevFrom = prevTo.subtract(days - 1, "day");
  if (!prevTo.isValid() || !prevFrom.isValid()) return null;
  return { from: prevFrom.format("YYYY-MM-DD"), to: prevTo.format("YYYY-MM-DD") };
}

/** How the comparison is described under the number. */
export function comparisonLabel(from: string, to: string): string {
  const days = rangeLengthDays(from, to);
  if (!days) return "vs previous period";
  if (days === 1) {
    // Only literally "yesterday" when the range is actually today; a single past
    // day is compared with the day before it, which is not yesterday.
    return to === ymdSite() ? "vs yesterday" : "vs previous day";
  }
  return `vs previous ${days} days`;
}

/**
 * Build the delta shown beneath a KPI number.
 *
 * `previous` of 0 yields no percentage on purpose: growth from nothing is
 * undefined, not infinite, and printing "+100%" or "+∞%" for the first event a
 * module has ever recorded overstates it. The card says so instead.
 */
export function buildDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  from: string,
  to: string
): RangeDelta {
  const label = comparisonLabel(from, to);
  const cur = Number(current ?? 0);
  const prev = Number(previous ?? 0);

  if (previous == null) return { pct: null, label: "no comparison available", direction: "none" };
  if (prev === 0) {
    return cur === 0
      ? { pct: null, label: `no change ${label}`, direction: "flat" }
      : { pct: null, label: `new ${label}`, direction: "up" };
  }
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return {
    pct,
    label,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
  };
}

/** Today in site time, as the inclusive range both ends of a "Today" view use. */
export function todayRange(): { from: string; to: string } {
  const t = ymdSite();
  return { from: t, to: t };
}

/**
 * Human label for the range itself - "Today", "Yesterday", "Last 7 days",
 * "04–10 Aug". Used where a card previously said "in selected range", which told
 * the reader nothing they could not already see.
 */
export function rangeLabel(from: string, to: string): string {
  if (!from || !to) return "All time";
  const today = ymdSite();
  const yesterday = dayjs().tz(SITE_TIMEZONE).subtract(1, "day").format("YYYY-MM-DD");
  if (from === to) {
    if (from === today) return "Today";
    if (from === yesterday) return "Yesterday";
    return dayjs(from).format("DD MMM YYYY");
  }
  const days = rangeLengthDays(from, to);
  if (to === today) {
    if (days === 7) return "Last 7 days";
    if (days === 30) return "Last 30 days";
    return `Last ${days} days`;
  }
  const a = dayjs(from);
  const b = dayjs(to);
  const sameYear = a.year() === b.year();
  const sameMonth = sameYear && a.month() === b.month();
  if (sameMonth) return `${a.format("DD")}–${b.format("DD MMM YYYY")}`;
  if (sameYear) return `${a.format("DD MMM")} – ${b.format("DD MMM YYYY")}`;
  return `${a.format("DD MMM YYYY")} – ${b.format("DD MMM YYYY")}`;
}
