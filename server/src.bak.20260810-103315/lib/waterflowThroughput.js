const dayjs = require("dayjs");
const { SITE_CONFIG, SITE_TIMEZONE } = require("../config/siteConfig");
const {
  ymdSite,
  hourNowSite,
  siteHourEndLabelFromStart,
  unixFromSiteHourSlot,
} = require("../siteTimeZone");
const { evManilaDate, evManilaHour } = require("../eventTimeSql");

const evD = evManilaDate("created_at", null);
const evH = evManilaHour("created_at", null);

function numOrDefault(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function waterflowConfig() {
  const wf = SITE_CONFIG.waterflow || {};
  const thresholds = {
    alert: numOrDefault(wf.thresholdAlert, 70),
    alarm: numOrDefault(wf.thresholdAlarm, 110),
    critical: numOrDefault(wf.thresholdCritical, 150),
  };
  return {
    cameraId: String(wf.cameraId || "AEYE_6").trim(),
    siteName: String(wf.siteName || "Bridge").trim(),
    dayStartHour: numOrDefault(wf.dayStartHour, 4),
    thresholds,

    thresholdPerHour: numOrDefault(wf.thresholdPerHour, thresholds.critical),
  };
}

async function loadWaterflowHourlyThroughput(pool) {
  const { cameraId, siteName, dayStartHour, thresholds, thresholdPerHour } = waterflowConfig();
  const today = ymdSite();
  const endHour = hourNowSite();
  const startHour = Math.min(Math.max(0, dayStartHour), 23);

  if (endHour < startHour) {
    return {
      cameraId,
      siteName,
      from: today,
      to: today,
      dayStartHour: startHour,
      endHour,
      thresholds,
      thresholdPerHour,
      total: 0,
      timeseries: [],
    };
  }

  let rows = [];
  try {
    const [qRows] = await pool.query(
      `
      SELECT ${evH} AS h, COUNT(*) AS total
      FROM vehicle_events
      WHERE ${evD} = ?
        AND camera_id = ?
        AND ${evH} >= ?
        AND ${evH} <= ?
      GROUP BY ${evH}
      ORDER BY h ASC
    `,
      [today, cameraId, startHour, endHour]
    );
    rows = qRows || [];
  } catch {
    rows = [];
  }

  const map = new Map(rows.map((r) => [Number(r.h), Number(r.total || 0)]));

  const timeseries = [];
  let total = 0;
  for (let h = startHour; h <= endHour; h++) {
    const count = map.get(h) || 0;
    total += count;
    timeseries.push({
      bucket: siteHourEndLabelFromStart(today, h),
      total: count,
      partial: h === endHour,
      drillDay: today,
      hourStartUnix: unixFromSiteHourSlot(today, h),
      hour: h,
    });
  }

  const windowStart = dayjs
    .tz(`${today} ${String(startHour).padStart(2, "0")}:00:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE)
    .format("YYYY-MM-DD HH:mm");
  const windowEnd = dayjs().tz(SITE_TIMEZONE).format("YYYY-MM-DD HH:mm");

  return {
    cameraId,
    siteName,
    from: today,
    to: today,
    dayStartHour: startHour,
    endHour,
    thresholds,
    thresholdPerHour,
    total,
    windowStart,
    windowEnd,
    timeseries,
  };
}

module.exports = {
  loadWaterflowHourlyThroughput,
  waterflowConfig,
};
