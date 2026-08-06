import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { DB_TIMEZONE, SITE_CONFIG, SITE_TIMEZONE } from "../config/siteConfig";

dayjs.extend(utc);
dayjs.extend(timezone);

export { SITE_TIMEZONE, DB_TIMEZONE, SITE_CONFIG };

export function displayTimezoneLabel(): string {
  return SITE_CONFIG.timezone.display.label;
}

export function ymdSite(): string {
  return dayjs().tz(SITE_TIMEZONE).format("YYYY-MM-DD");
}

export function ymdSiteYesterday(): string {
  return dayjs().tz(SITE_TIMEZONE).subtract(1, "day").format("YYYY-MM-DD");
}

export function hourSiteNow(): number {
  return dayjs().tz(SITE_TIMEZONE).hour();
}

export function dayjsInSite(ymd: string) {
  try {
    return dayjs.tz(ymd, "YYYY-MM-DD", SITE_TIMEZONE);
  } catch {
    // dayjs.tz throws a RangeError on unparseable input rather than returning an
    // invalid instance, which takes the whole page down. Callers already guard
    // with .isValid(), so hand them something that fails that check.
    return dayjs(NaN);
  }
}

export function extractDbNaiveDatetime(raw: unknown): string {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return "";
  return `${m[1]} ${m[2]}:${m[3]}:${m[4]}`;
}

export function formatDbNaiveInDisplay(raw: string, pattern = "D MMM YYYY, HH:mm:ss"): string {
  const naive = extractDbNaiveDatetime(raw);
  if (!naive) return "-";
  const d = dayjs.tz(naive, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
  if (!d.isValid()) return "-";
  return d.format(pattern);
}

export function formatPeopleReportDisplayTime(raw: string | null | undefined, pattern = "D MMM YYYY, h:mm:ss A"): string {
  const naive = extractDbNaiveDatetime(raw);
  if (!naive) return "-";
  const hoursAhead = Number(SITE_CONFIG.timezone.displayHoursAheadOfDb);
  const shiftHours = Number.isFinite(hoursAhead) ? hoursAhead : 2.5;
  const d = dayjs.tz(naive, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE).add(shiftHours, "hour");
  if (!d.isValid()) return "-";
  return d.format(pattern);
}

export function formatChartDayTick(ymd: string): string {
  const d = dayjsInSite(ymd);
  return d.isValid() ? d.format("D MMM YYYY") : ymd;
}

const SLOT_SITE_YMD_H00 = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/;

export function formatChartHourTick(raw: string, contextYmd?: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatChartDayTick(s);
  const slot = SLOT_SITE_YMD_H00.exec(s);
  if (slot) {
    const d = dayjs.tz(`${slot[1]} ${slot[2]}:00:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
    if (d.isValid()) return d.format("D MMM, HH:mm");
  }
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) {
    const h = hm[1].padStart(2, "0");
    const m = hm[2];
    if (h === "24" && m === "00") {
      return contextYmd ? `${formatChartDayTick(contextYmd)}, 24:00` : "24:00";
    }
    if (contextYmd) {
      const d = dayjs.tz(`${contextYmd} ${h}:${m}:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
      if (d.isValid()) return d.format("D MMM, HH:mm");
    }
    return `${h}:${m}`;
  }
  if (s.length <= 32) return s;
  return `${s.slice(0, 29)}…`;
}

export function formatHourEndTickFromStart(startHour: number, contextYmd?: string): string {
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) return "-";
  const endHour = startHour + 1;
  const label = endHour === 24 ? "24:00" : `${String(endHour).padStart(2, "0")}:00`;
  return formatChartHourTick(label, contextYmd);
}

type VehicleEventLike = {
  timestamp?: number;
  created_at?: string;
};

export function formatVehicleEventDisplayTime(row: VehicleEventLike, pattern = "D MMM YYYY, h:mm:ss A"): string {
  if (row.created_at) {
    const fromWall = formatDbNaiveInDisplay(row.created_at, pattern);
    if (fromWall !== "-") return fromWall;
  }
  const ms = row.timestamp;
  if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) {
    return dayjs(ms).tz(SITE_TIMEZONE).format(pattern);
  }
  return "-";
}
