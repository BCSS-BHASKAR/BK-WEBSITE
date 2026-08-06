const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { SITE_CONFIG, SITE_TIMEZONE, DB_TIMEZONE } = require("./config/siteConfig");

dayjs.extend(utc);
dayjs.extend(timezone);

const DB_NAIVE_DATETIME_TIMEZONE = DB_TIMEZONE;

function ymdSite() {
  return dayjs().tz(SITE_TIMEZONE).format("YYYY-MM-DD");
}

function ymdSiteSubtractDays(n) {
  return dayjs().tz(SITE_TIMEZONE).subtract(Number(n) || 0, "day").format("YYYY-MM-DD");
}

function ymdSiteAddDays(ymd, days = 1) {
  return dayjs.tz(String(ymd), "YYYY-MM-DD", SITE_TIMEZONE).add(Number(days) || 0, "day").format("YYYY-MM-DD");
}

function hourNowSite() {
  return dayjs().tz(SITE_TIMEZONE).hour();
}

function ymdFromDbDate(v) {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return s;
  if (m[2] != null) {
    const d = dayjs.tz(`${m[1]} ${m[2]}:${m[3]}:${m[4]}`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
    if (d.isValid()) return d.format("YYYY-MM-DD");
  }
  return m[1];
}

function unixFromSiteHourSlot(ymd, hour) {
  return dayjs
    .tz(`${ymd} ${String(hour).padStart(2, "0")}:00:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE)
    .unix();
}

function siteHourEndLabelFromStart(ymd, hour, includeDate = false) {
  const start = dayjs.tz(`${ymd} ${String(hour).padStart(2, "0")}:00:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
  const end = start.add(1, "hour");
  if (!includeDate && Number(hour) === 23) return "24:00";
  return includeDate ? end.format("YYYY-MM-DD HH:00") : end.format("HH:00");
}

function hourLabelFromUnix(unixSec) {
  return dayjs.unix(Number(unixSec) || 0).tz(SITE_TIMEZONE).format("D MMM, HH:mm");
}

function hourTickRollingFromUnix(unixSec) {
  return dayjs.unix(Number(unixSec) || 0).tz(SITE_TIMEZONE).format("D/HH");
}

function eachHourSlotInRange(fromYmd, toYmd, clipToNow = false) {
  const out = [];
  const now = clipToNow ? dayjs().tz(SITE_TIMEZONE) : null;
  const todayYmd = now ? now.format("YYYY-MM-DD") : "";
  let cur = dayjs.tz(`${fromYmd} 00:00:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
  const end = dayjs.tz(`${toYmd} 23:59:59`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
  while (!cur.isAfter(end)) {
    if (now && toYmd >= todayYmd && cur.isAfter(now)) break;
    out.push(cur.format("YYYY-MM-DD HH:00"));
    cur = cur.add(1, "hour");
  }
  return out;
}

function sqlZoneLiteral(tzName) {
  return String(tzName).replace(/[^A-Za-z0-9_/+-]/g, "");
}

module.exports = {
  SITE_CONFIG,
  SITE_TIMEZONE,
  DB_TIMEZONE,
  DB_NAIVE_DATETIME_TIMEZONE,
  ymdSite,
  ymdSiteSubtractDays,
  ymdSiteAddDays,
  hourLabelFromUnix,
  hourTickRollingFromUnix,
  eachHourSlotInRange,
  hourNowSite,
  siteHourEndLabelFromStart,
  ymdFromDbDate,
  unixFromSiteHourSlot,
  sqlZoneLiteral,
};
