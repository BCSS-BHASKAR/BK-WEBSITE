const express = require("express");
const { pool } = require("../db");
const { VEHICLE_TYPE_TO_CLASSES, DIRECTION_TO_CLASSES } = require("../domain");
const {
  getCameraMap,
  normalizeCameraId,
  loadMergedCameraMap,
  camerasWithCounts,
  resolveCameraName,
  listCameraRegistry,
} = require("../cameras");

const {
  ymdSite,
  ymdSiteSubtractDays,
  hourNowSite,
  eachHourSlotInRange,
  siteHourEndLabelFromStart,
  ymdFromDbDate,
  unixFromSiteHourSlot,
} = require("../siteTimeZone");
const {
  evManilaDate,
  evManilaDateTimeFmt,
  evManilaExpr,
  evManilaHour,
  evManilaYmdFmt,
} = require("../eventTimeSql");
const { loadCameraLiveStatus, loadCameraUptime } = require("../cameraLiveStatus");
const { loadWaterflowHourlyThroughput } = require("../lib/waterflowThroughput");
const { loadWatchPlateMatchers, plateMatches } = require("../lib/watchlistDb");
const { exportFalsePositive, markCorrected } = require("../lib/violationFeedback");
const { SITE_CONFIG } = require("../config/siteConfig");
const {
  walkinSiteMap,
  walkinCameraMap,
  resolveWalkinSiteName,
  walkinCamerasWithCounts,
  crowdZonesWithCounts,
  crowdCameraMap,
  crowdSiteNamesList,
} = require("../config/reportFilters");
const { attachWalkinFramePaths } = require("../lib/walkinFrameLookup");

const router = express.Router();

function crowdSeverityThresholds() {
  const crowd = SITE_CONFIG.crowd || {};
  return {
    alarm: Number(crowd.severityAlarm) || 70,
    critical: Number(crowd.severityCritical) || 85,
  };
}

router.get("/cameras", async (_req, res) => {
  try {
    const cameraMap = await loadMergedCameraMap(pool);
    res.json({
      cameras: listCameraRegistry(),
      cameraMap,
    });
  } catch (e) {
    console.error("cameras", e);
    res.status(500).json({ error: "server_error" });
  }
});

const evD = evManilaDate("created_at", null);
const evH = evManilaHour("created_at", null);
const evYmd = evManilaYmdFmt("created_at", null);
const evDisplay = evManilaExpr("created_at", null);
const evDisplayFmt = evManilaDateTimeFmt("created_at", null);
const evDve = evManilaDate("ve.created_at", null);
const evHve = evManilaHour("ve.created_at", null);
const evYmdVe = evManilaYmdFmt("ve.created_at", null);
const evDisplayVe = evManilaExpr("ve.created_at", null);
const evDisplayFmtVe = evManilaDateTimeFmt("ve.created_at", null);
// walkins/crowds store trigger_date already in site time, so these need no
// zone conversion -- only the MySQL -> Postgres function spellings.
const wD = "trigger_date::date";
const wH = "EXTRACT(HOUR FROM trigger_date)::int";
const wYmd = "TO_CHAR(trigger_date, 'YYYY-MM-DD')";
const wDisplay = "trigger_date";
const wDisplayFmt = "TO_CHAR(trigger_date, 'YYYY-MM-DD HH24:MI:SS')";
const cD = "trigger_date::date";
const cH = "EXTRACT(HOUR FROM trigger_date)::int";
const cYmd = "TO_CHAR(trigger_date, 'YYYY-MM-DD')";
const cDisplay = "trigger_date";
const cDisplayFmt = "TO_CHAR(trigger_date, 'YYYY-MM-DD HH24:MI:SS')";
const { VIOLATION_TYPES } = require("../lib/chatConstants");
const VIOLATION_FEEDBACK_OK = "(tv.feedback IS NULL OR tv.feedback <> 0)";

function resolveHourCap(req, from, to) {
  if (from !== to) return null;
  const raw = req.query.throughHour;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const h = Number(raw);
    if (Number.isInteger(h) && h >= 0 && h <= 23) return h;
    return null;
  }
  return null;
}

function hourCapClause(hourCap, hourExpr) {
  if (hourCap == null) return { sql: "", params: [] };
  return { sql: `AND ${hourExpr} <= ?`, params: [hourCap] };
}

function daysInclusive(fromStr, toStr) {
  const a = new Date(`${fromStr}T12:00:00`);
  const b = new Date(`${toStr}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function parseRangeWithDefault(req) {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const fq = String(req.query.from || "").trim();
  const tq = String(req.query.to || "").trim();
  if (fq && tq) {
    if (!dateRe.test(fq) || !dateRe.test(tq)) return null;
    if (fq > tq) return null;
    const spanDays = daysInclusive(fq, tq);
    if (spanDays < 1 || spanDays > 366) return null;
    return { from: fq, to: tq, spanDays };
  }
  const to = ymdSite();
  const from = ymdSiteSubtractDays(6);
  return { from, to, spanDays: 7 };
}

const MAX_SPAN_DAYS_HOURLY_THROUGHPUT = 31;

function parseTimeseriesGranularity(req, spanDays) {
  const g = String(req.query.timeseriesGranularity || "daily").toLowerCase();
  if (g !== "hourly") return "daily";
  if (spanDays <= 1) return "daily";
  if (spanDays > MAX_SPAN_DAYS_HOURLY_THROUGHPUT) return "daily";
  return "hourly";
}

async function buildRangeHourlyTimeseries(pool, from, to) {
  const [rows] = await pool.query(
    `
    SELECT ${evYmd} AS d, ${evH} AS h, COUNT(*) AS total
    FROM vehicle_events
    WHERE ${evD} BETWEEN ? AND ?
    GROUP BY ${evYmd}, ${evH}
    ORDER BY d ASC, h ASC
  `,
    [from, to]
  );
  const map = new Map(
    rows.map((r) => [`${ymdFromDbDate(r.d)}_${Number(r.h)}`, Number(r.total || 0)])
  );
  const clipNow = to >= ymdSite();
  const slotLabels = eachHourSlotInRange(from, to, clipNow);
  return slotLabels.map((label) => {
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/.exec(label);
    const startHour = m ? Number(m[2]) : null;
    const total = m ? map.get(`${m[1]}_${startHour}`) || 0 : 0;
    return {
      bucket: m ? siteHourEndLabelFromStart(m[1], startHour, true) : label,
      total,
      partial: false,
      drillDay: m ? m[1] : undefined,
      hourStartUnix: m ? unixFromSiteHourSlot(m[1], startHour) : undefined,
    };
  });
}

function pickPeakPoint(points) {
  const list = points || [];
  let peak = list[0] ?? { bucket: "-", total: 0 };
  for (const p of list) {
    if (Number(p.total || 0) > Number(peak.total || 0)) peak = p;
  }
  return peak;
}

async function findPeakReadInterval(pool, from, to, spanDays, timeseries) {
  if (spanDays <= 1) return pickPeakPoint(timeseries);
  const hourly = await buildRangeHourlyTimeseries(pool, from, to);
  return pickPeakPoint(hourly);
}

async function loadDashboardSeries(pool, from, to, spanDays, opts = {}) {
  const { timeseriesGranularity = "daily", hourCap = null } = opts;
  let timeseries = [];
  if (spanDays <= 1) {
    const maxHourInclusive = hourCap != null ? hourCap : 23;
    const hourClipSql = hourCap != null ? `AND ${evH} <= ?` : "";
    const params = hourCap != null ? [from, to, maxHourInclusive] : [from, to];
    const [rows] = await pool.query(
      `
      SELECT ${evH} AS h, COUNT(*) AS total
      FROM vehicle_events
      WHERE ${evD} BETWEEN ? AND ?
      ${hourClipSql}
      GROUP BY ${evH}
      ORDER BY h ASC
    `,
      params
    );
    const map = new Map(rows.map((r) => [Number(r.h), Number(r.total)]));
    const slotCount = maxHourInclusive + 1;
    timeseries = Array.from({ length: slotCount }, (_, h) => ({
      bucket: siteHourEndLabelFromStart(from, h),
      total: map.get(h) || 0,
      partial: hourCap != null && h === maxHourInclusive,
      drillDay: from,
      hourStartUnix: unixFromSiteHourSlot(from, h),
    }));
  } else if (timeseriesGranularity === "hourly") {
    timeseries = await buildRangeHourlyTimeseries(pool, from, to);
  } else {
    const [rows] = await pool.query(
      `
      SELECT ${evD} AS d, COUNT(*) AS total
      FROM vehicle_events
      WHERE ${evD} BETWEEN ? AND ?
      GROUP BY ${evD}
      ORDER BY d ASC
    `,
      [from, to]
    );
    timeseries = rows.map((r) => {
      const day = ymdFromDbDate(r.d);
      return {
        bucket: day,
        total: Number(r.total || 0),
        partial: false,
        drillDay: day,
      };
    });
  }

  const evHourClip = hourCapClause(hourCap, evH);
  const [camRows] = await pool.query(
    `
    SELECT camera_id, COUNT(*) AS total
    FROM vehicle_events
    WHERE ${evD} BETWEEN ? AND ?
    ${evHourClip.sql}
    GROUP BY camera_id
    ORDER BY total DESC
  `,
    [from, to, ...evHourClip.params]
  );
  const cameraMap = opts.cameraMap || getCameraMap();
  const cameras = camerasWithCounts(camRows, cameraMap);

  const camerasReporting = camRows.length;
  const camerasDeployed = Object.keys(cameraMap).length;

  const [[privRow]] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM vehicle_events
    WHERE ${evD} BETWEEN ? AND ?
    ${evHourClip.sql}
      AND (vehicle_type = 'PRIVATE' OR vehicle_type = 'ELECTRIC')
  `,
    [from, to, ...evHourClip.params]
  );
  const [[pubRow]] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM vehicle_events
    WHERE ${evD} BETWEEN ? AND ?
    ${evHourClip.sql}
      AND vehicle_type = 'PUBLIC_UTILITY'
  `,
    [from, to, ...evHourClip.params]
  );

  return {
    timeseries,
    cameras,
    camerasReporting,
    camerasDeployed,
    attributes: [
      { key: "PRIVATE", label: "Private", total: Number(privRow.total || 0) },
      { key: "PUBLIC_UTILITY", label: "Public Utility", total: Number(pubRow.total || 0) },
    ],
  };
}

async function loadViolationSeries(pool, from, to, spanDays, opts = {}) {
  const { timeseriesGranularity = "daily" } = opts;

  const safeQuery = async (sql, params) => {
    try {
      const [rows] = await pool.query(sql, params);
      return rows || [];
    } catch {
      return [];
    }
  };

  let violationTimeseries = [];

  if (spanDays <= 1) {
    const hourCap = opts.hourCap ?? null;
    const maxHourInclusive = hourCap != null ? hourCap : 23;
    const hourClipSql = hourCap != null ? `AND ${evHve} <= ?` : "";
    const params = hourCap != null ? [from, to, maxHourInclusive] : [from, to];
    const rows = await safeQuery(
      `
      SELECT ${evHve} AS h, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ?
        AND ${VIOLATION_FEEDBACK_OK}
      ${hourClipSql}
      GROUP BY ${evHve}
      ORDER BY h ASC
    `,
      params
    );
    const map = new Map(rows.map((r) => [Number(r.h), Number(r.total)]));
    const slotCount = maxHourInclusive + 1;
    violationTimeseries = Array.from({ length: slotCount }, (_, h) => ({
      bucket: siteHourEndLabelFromStart(from, h),
      total: map.get(h) || 0,
      partial: hourCap != null && h === maxHourInclusive,
      drillDay: from,
      hourStartUnix: unixFromSiteHourSlot(from, h),
    }));
  } else if (timeseriesGranularity === "hourly") {
    const rows = await safeQuery(
      `
      SELECT ${evYmdVe} AS d, ${evHve} AS h, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ?
        AND ${VIOLATION_FEEDBACK_OK}
      GROUP BY ${evYmdVe}, ${evHve}
      ORDER BY d ASC, h ASC
    `,
      [from, to]
    );
    const map = new Map(
      rows.map((r) => [`${ymdFromDbDate(r.d)}_${Number(r.h)}`, Number(r.total || 0)])
    );
    const clipNow = to >= ymdSite();
    const slotLabels = eachHourSlotInRange(from, to, clipNow);
    violationTimeseries = slotLabels.map((label) => {
      const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/.exec(label);
      const startHour = m ? Number(m[2]) : null;
      const total = m ? map.get(`${m[1]}_${startHour}`) || 0 : 0;
      return {
        bucket: m ? siteHourEndLabelFromStart(m[1], startHour, true) : label,
        total,
        partial: false,
        drillDay: m ? m[1] : undefined,
        hourStartUnix: m ? unixFromSiteHourSlot(m[1], startHour) : undefined,
      };
    });
  } else {
    const rows = await safeQuery(
      `
      SELECT ${evDve} AS d, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ?
        AND ${VIOLATION_FEEDBACK_OK}
      GROUP BY ${evDve}
      ORDER BY d ASC
    `,
      [from, to]
    );
    violationTimeseries = rows.map((r) => {
      const day = ymdFromDbDate(r.d);
      return {
        bucket: day,
        total: Number(r.total || 0),
        partial: false,
        drillDay: day,
      };
    });
  }

  return { violationTimeseries };
}

function extraVehicleFilters(q) {
  const where = [];
  const params = [];

  if (q.cameraId) {
    where.push("camera_id = ?");
    params.push(String(q.cameraId));
  }

  if (q.plate) {
    const p = String(q.plate).trim();
    if (p) {
      where.push("(vehicle_num ILIKE ? OR vehicle_num_raw ILIKE ?)");
      params.push(`%${p}%`, `%${p}%`);
    }
  }

  const dir = String(q.direction || "");
  if (dir === "IN" || dir === "OUT") {
    const cats = DIRECTION_TO_CLASSES[dir] || [];
    if (cats.length) {
      where.push(`vehicle_category IN (${cats.map(() => "?").join(",")})`);
      params.push(...cats);
    }
  }

  const vt = String(q.vehicleType || "");
  if (vt && VEHICLE_TYPE_TO_CLASSES[vt]) {
    const cats = VEHICLE_TYPE_TO_CLASSES[vt];
    where.push(`vehicle_category IN (${cats.map(() => "?").join(",")})`);
    params.push(...cats);
  }

  const attr = String(q.attr || "");
  if (attr === "PRIVATE") {
    where.push("(vehicle_type = 'PRIVATE' OR vehicle_type = 'ELECTRIC')");
  } else if (attr === "PUBLIC_UTILITY") {
    where.push("vehicle_type = 'PUBLIC_UTILITY'");
  }

  return { where, params };
}

function parseReportHour(query, from, to) {
  if (from !== to) return null;
  const raw = query.hour;
  if (raw === undefined || raw === null || raw === "") return null;
  const h = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  return h;
}

function vehicleReportWhere(from, to, query) {
  const { where: xf, params: xp } = extraVehicleFilters(query);
  const hour = parseReportHour(query, from, to);
  const dateParts = hour != null ? [`${evD} = ?`, `${evH} = ?`] : [`${evD} BETWEEN ? AND ?`];
  const dateParams = hour != null ? [from, hour] : [from, to];
  const whereSql = [...dateParts, ...xf].join(" AND ");
  const baseParams = [...dateParams, ...xp];
  return { whereSql, baseParams, hour };
}

const WALKIN_GENDERS = ["male", "female", "unknown"];

function parseWalkinGender(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return WALKIN_GENDERS.includes(v) ? v : null;
}

// MySQL summed the 1/0 a comparison yields; Postgres has no boolean->int cast
// inside SUM, so use an aggregate FILTER instead.
const walkinGenderCountSelect = WALKIN_GENDERS.map(
  (g) => `COUNT(*) FILTER (WHERE gender = '${g}') AS \`${g}\``
).join(",\n      ");

function walkinGenderCounts(row) {
  const out = {};
  for (const g of WALKIN_GENDERS) out[g] = Number(row?.[g] || 0);
  return out;
}

function extraWalkinFilters(q) {
  const where = [];
  const params = [];

  if (q.cameraId) {
    where.push("camera_id = ?");
    params.push(String(q.cameraId));
  }

  const siteId = Number.parseInt(String(q.siteId || ""), 10);
  if (Number.isInteger(siteId) && siteId > 0) {
    where.push("site_id = ?");
    params.push(siteId);
  }

  const gender = parseWalkinGender(q.gender);
  if (gender) {
    where.push("gender = ?");
    params.push(gender);
  }

  return { where, params };
}

function walkinsReportWhere(from, to, query) {
  const { where: xf, params: xp } = extraWalkinFilters(query);
  const hour = parseReportHour(query, from, to);
  const dateParts = hour != null ? [`${wD} = ?`, `${wH} = ?`] : [`${wD} BETWEEN ? AND ?`];
  const dateParams = hour != null ? [from, hour] : [from, to];
  const whereSql = [...dateParts, ...xf].join(" AND ");
  const baseParams = [...dateParams, ...xp];
  return { whereSql, baseParams, hour };
}

async function loadSiteMap(pool) {
  const [rows] = await pool.query("SELECT id, name FROM sites");
  const map = {};
  for (const r of rows) {
    map[Number(r.id)] = String(r.name || "");
  }
  return map;
}

async function buildWalkinsTimeline(pool, from, to, spanDays, whereSql, baseParams, timelineResolution) {
  const hourlyForced = timelineResolution === "hourly";
  const MAX_HOURLY_RANGE_DAYS = 31;
  if (hourlyForced && spanDays > MAX_HOURLY_RANGE_DAYS) {
    return { error: `Hourly timeline supports at most ${MAX_HOURLY_RANGE_DAYS} days.` };
  }

  const isCalToday = from === to && from === ymdSite();
  const maxHourInclusive = isCalToday ? hourNowSite() : 23;
  const clipNow = to >= ymdSite();

  let timeline = [];
  let timelineMode = "daily";

  if (hourlyForced) {
    timelineMode = "hourly";
    const [rows] = await pool.query(
      `
      SELECT ${wYmd} AS d, ${wH} AS h, COUNT(*) AS total
      FROM walkins
      WHERE ${whereSql}
      GROUP BY ${wYmd}, ${wH}
      ORDER BY d ASC, h ASC
    `,
      baseParams
    );
    const map = new Map(
      rows.map((r) => [`${ymdFromDbDate(r.d)}_${Number(r.h)}`, Number(r.total || 0)])
    );
    const slotLabels = eachHourSlotInRange(from, to, clipNow);
    timeline = slotLabels.map((label) => {
      const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/.exec(label);
      const startHour = m ? Number(m[2]) : null;
      const total = m ? map.get(`${m[1]}_${startHour}`) || 0 : 0;
      return { label: m ? siteHourEndLabelFromStart(m[1], startHour, true) : label, total };
    });
  } else if (spanDays <= 1) {
    timelineMode = "hourly";
    const hourClipSql = isCalToday ? `AND ${wH} <= ?` : "";
    const hourParams = isCalToday ? [...baseParams, maxHourInclusive] : baseParams;
    const [rows] = await pool.query(
      `
      SELECT ${wH} AS bucket, COUNT(*) AS total
      FROM walkins
      WHERE ${whereSql}
      ${hourClipSql}
      GROUP BY ${wH}
      ORDER BY bucket ASC
    `,
      hourParams
    );
    const map = new Map(rows.map((r) => [Number(r.bucket), Number(r.total)]));
    const slotCount = isCalToday ? maxHourInclusive + 1 : 24;
    timeline = Array.from({ length: slotCount }, (_, h) => ({
      label: siteHourEndLabelFromStart(from, h),
      total: map.get(h) || 0,
    }));
  } else {
    const [rows] = await pool.query(
      `
      SELECT ${wD} AS bucket, COUNT(*) AS total
      FROM walkins
      WHERE ${whereSql}
      GROUP BY ${wD}
      ORDER BY bucket ASC
    `,
      baseParams
    );
    timeline = rows.map((r) => ({
      label: ymdFromDbDate(r.bucket),
      total: Number(r.total || 0),
    }));
  }

  return { timeline, timelineMode };
}

// Mirrors the `crowds.alert_type` ENUM and CROWD_ALERT_TYPES in
// client/src/lib/crowdAlertTypes.ts.
const CROWD_ALERT_TYPES = [
  "intrusion",
  "unauthorized_access",
  "camera_tampering",
  "unattended_kitchen",
  "understaffed_kitchen",
];

function parseCrowdAlertType(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return CROWD_ALERT_TYPES.includes(v) ? v : null;
}

function extraCrowdFilters(q) {
  const where = [];
  const params = [];

  if (q.cameraId) {
    where.push("camera_id = ?");
    params.push(String(q.cameraId));
  }

  const alertType = parseCrowdAlertType(q.alertType);
  if (alertType) {
    where.push("alert_type = ?");
    params.push(alertType);
  }

  const siteName = String(q.siteName || "").trim();
  if (siteName) {
    where.push("site_name = ?");
    params.push(siteName);
  }

  const siteId = Number.parseInt(String(q.siteId || ""), 10);
  if (Number.isInteger(siteId) && siteId > 0) {
    where.push("site_id = ?");
    params.push(siteId);
  }

  const minPeople = Number.parseInt(String(q.minPeople || ""), 10);
  if (Number.isInteger(minPeople) && minPeople >= 0) {
    where.push("people_count >= ?");
    params.push(minPeople);
  }

  const minOccupancy = Number.parseFloat(String(q.minOccupancy || ""));
  if (Number.isFinite(minOccupancy) && minOccupancy >= 0) {
    where.push("occupancy_pct >= ?");
    params.push(minOccupancy);
  }

  return { where, params };
}

function crowdsReportWhere(from, to, query) {
  const { where: xf, params: xp } = extraCrowdFilters(query);
  const hour = parseReportHour(query, from, to);
  const dateParts = hour != null ? [`${cD} = ?`, `${cH} = ?`] : [`${cD} BETWEEN ? AND ?`];
  const dateParams = hour != null ? [from, hour] : [from, to];
  const whereSql = [...dateParts, ...xf].join(" AND ");
  const baseParams = [...dateParams, ...xp];
  return { whereSql, baseParams, hour };
}

async function loadCrowdSiteNames(pool, whereSql, baseParams) {
  const [rows] = await pool.query(
    `
    SELECT DISTINCT site_name
    FROM crowds
    WHERE ${whereSql}
    ORDER BY site_name ASC
  `,
    baseParams
  );
  return rows.map((r) => String(r.site_name || "")).filter(Boolean);
}

// Per-alert-type counts, reused by the timeline buckets and the per-zone rollup
// so every chart on the Alerts page can be broken down by type.
const crowdTypeCountSelect = CROWD_ALERT_TYPES.map(
  (t) => `COUNT(*) FILTER (WHERE alert_type = '${t}') AS \`${t}\``
).join(",\n    ");

function crowdTypeCounts(row) {
  const out = {};
  for (const t of CROWD_ALERT_TYPES) out[t] = Number(row?.[t] || 0);
  return out;
}

const EMPTY_CROWD_TYPE_COUNTS = Object.fromEntries(CROWD_ALERT_TYPES.map((t) => [t, 0]));

async function buildCrowdsTimeline(pool, from, to, spanDays, whereSql, baseParams, timelineResolution) {
  const hourlyForced = timelineResolution === "hourly";
  const MAX_HOURLY_RANGE_DAYS = 31;
  if (hourlyForced && spanDays > MAX_HOURLY_RANGE_DAYS) {
    return { error: `Hourly timeline supports at most ${MAX_HOURLY_RANGE_DAYS} days.` };
  }

  const isCalToday = from === to && from === ymdSite();
  const maxHourInclusive = isCalToday ? hourNowSite() : 23;
  const clipNow = to >= ymdSite();

  let timeline = [];
  let timelineMode = "daily";

  const bucketSelect = `
    COUNT(*) AS alerts,
    ${crowdTypeCountSelect},
    MAX(people_count) AS "peakPeople",
    MAX(occupancy_pct) AS "peakOccupancy"
  `;

  if (hourlyForced) {
    timelineMode = "hourly";
    const [rows] = await pool.query(
      `
      SELECT ${cYmd} AS d, ${cH} AS h, ${bucketSelect}
      FROM crowds
      WHERE ${whereSql}
      GROUP BY ${cYmd}, ${cH}
      ORDER BY d ASC, h ASC
    `,
      baseParams
    );
    const map = new Map(
      rows.map((r) => [
        `${ymdFromDbDate(r.d)}_${Number(r.h)}`,
        {
          alerts: Number(r.alerts || 0),
          byAlertType: crowdTypeCounts(r),
          peakPeople: Number(r.peakPeople || 0),
          peakOccupancy: Number(r.peakOccupancy || 0),
        },
      ])
    );
    const slotLabels = eachHourSlotInRange(from, to, clipNow);
    timeline = slotLabels.map((label) => {
      const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/.exec(label);
      const startHour = m ? Number(m[2]) : null;
      const bucket = m ? map.get(`${m[1]}_${startHour}`) : null;
      return {
        label: m ? siteHourEndLabelFromStart(m[1], startHour, true) : label,
        total: bucket?.alerts || 0,
        byAlertType: bucket?.byAlertType || { ...EMPTY_CROWD_TYPE_COUNTS },
        peakPeople: bucket?.peakPeople || 0,
        peakOccupancy: bucket?.peakOccupancy || 0,
      };
    });
  } else if (spanDays <= 1) {
    timelineMode = "hourly";
    const hourClipSql = isCalToday ? `AND ${cH} <= ?` : "";
    const hourParams = isCalToday ? [...baseParams, maxHourInclusive] : baseParams;
    const [rows] = await pool.query(
      `
      SELECT ${cH} AS bucket, ${bucketSelect}
      FROM crowds
      WHERE ${whereSql}
      ${hourClipSql}
      GROUP BY ${cH}
      ORDER BY bucket ASC
    `,
      hourParams
    );
    const map = new Map(
      rows.map((r) => [
        Number(r.bucket),
        {
          alerts: Number(r.alerts || 0),
          byAlertType: crowdTypeCounts(r),
          peakPeople: Number(r.peakPeople || 0),
          peakOccupancy: Number(r.peakOccupancy || 0),
        },
      ])
    );
    const slotCount = isCalToday ? maxHourInclusive + 1 : 24;
    timeline = Array.from({ length: slotCount }, (_, h) => {
      const bucket = map.get(h);
      return {
        label: siteHourEndLabelFromStart(from, h),
        total: bucket?.alerts || 0,
        byAlertType: bucket?.byAlertType || { ...EMPTY_CROWD_TYPE_COUNTS },
        peakPeople: bucket?.peakPeople || 0,
        peakOccupancy: bucket?.peakOccupancy || 0,
      };
    });
  } else {
    const [rows] = await pool.query(
      `
      SELECT ${cD} AS bucket, ${bucketSelect}
      FROM crowds
      WHERE ${whereSql}
      GROUP BY ${cD}
      ORDER BY bucket ASC
    `,
      baseParams
    );
    timeline = rows.map((r) => ({
      label: ymdFromDbDate(r.bucket),
      total: Number(r.alerts || 0),
      byAlertType: crowdTypeCounts(r),
      peakPeople: Number(r.peakPeople || 0),
      peakOccupancy: Number(r.peakOccupancy || 0),
    }));
  }

  return { timeline, timelineMode };
}

router.get("/captured", async (_req, res) => {
  const dayStr = ymdSite();
  const fromWeek = ymdSiteSubtractDays(6);
  const fromMonth = ymdSiteSubtractDays(29);

  try {
    const [[d]] = await pool.query(`SELECT COUNT(*) AS total FROM vehicle_events WHERE ${evD} = ?`, [dayStr]);
    const [[w]] = await pool.query(`SELECT COUNT(*) AS total FROM vehicle_events WHERE ${evD} BETWEEN ? AND ?`, [
      fromWeek,
      dayStr,
    ]);
    const [[m]] = await pool.query(`SELECT COUNT(*) AS total FROM vehicle_events WHERE ${evD} BETWEEN ? AND ?`, [
      fromMonth,
      dayStr,
    ]);
    return res.json({
      today: Number(d.total || 0),
      week: Number(w.total || 0),
      month: Number(m.total || 0),
    });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/range-stats", async (req, res) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return res.status(400).json({ error: "bad_request", message: "from and to are required (YYYY-MM-DD)" });
  }

  if (to < from) {
    return res.status(400).json({ error: "bad_request", message: "invalid date range" });
  }

  const spanDays = daysInclusive(from, to);

  const { whereSql, baseParams } = vehicleReportWhere(from, to, req.query);

  try {
    const cameraMap = await loadMergedCameraMap(pool);
    const [[mix]] = await pool.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN vehicle_category IN (1,2) THEN 1 ELSE 0 END) AS "CAR",
        SUM(CASE WHEN vehicle_category IN (3,4) THEN 1 ELSE 0 END) AS "TRUCK",
        SUM(CASE WHEN vehicle_category IN (5,6) THEN 1 ELSE 0 END) AS "BIKE",
        SUM(CASE WHEN vehicle_category IN (7,8) THEN 1 ELSE 0 END) AS "MINITRUCK",
        SUM(CASE WHEN vehicle_category IN (9,10) THEN 1 ELSE 0 END) AS "BUS",
        SUM(CASE WHEN vehicle_category IN (11,12) THEN 1 ELSE 0 END) AS "AUTO"
      FROM vehicle_events
      WHERE ${whereSql}
    `,
      baseParams
    );

    const [camRows] = await pool.query(
      `
      SELECT camera_id, COUNT(*) AS total
      FROM vehicle_events
      WHERE ${whereSql}
      GROUP BY camera_id
      ORDER BY total DESC
    `,
      baseParams
    );

    const timelineResolution = String(req.query.timelineResolution || "auto").toLowerCase();
    const hourlyForced = timelineResolution === "hourly";
    const MAX_HOURLY_RANGE_DAYS = 31;
    if (hourlyForced && spanDays > MAX_HOURLY_RANGE_DAYS) {
      return res.status(400).json({
        error: "bad_request",
        message: `Hourly timeline supports at most ${MAX_HOURLY_RANGE_DAYS} days. Narrow the date range or omit timelineResolution.`,
      });
    }

    const isCalToday = from === to && from === ymdSite();
    const maxHourInclusive = isCalToday ? hourNowSite() : 23;
    const clipNow = to >= ymdSite();

    let timeline = [];
    let timelineMode = "daily";
    if (hourlyForced) {
      timelineMode = "hourly";
      const [rows] = await pool.query(
        `
        SELECT ${evYmd} AS d, ${evH} AS h, COUNT(*) AS total
        FROM vehicle_events
        WHERE ${whereSql}
        GROUP BY ${evYmd}, ${evH}
        ORDER BY d ASC, h ASC
      `,
        baseParams
      );
      const map = new Map(
        rows.map((r) => [`${ymdFromDbDate(r.d)}_${Number(r.h)}`, Number(r.total || 0)])
      );
      const slotLabels = eachHourSlotInRange(from, to, clipNow);
      timeline = slotLabels.map((label) => {
        const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/.exec(label);
        const startHour = m ? Number(m[2]) : null;
        const total = m ? map.get(`${m[1]}_${startHour}`) || 0 : 0;
        return { label: m ? siteHourEndLabelFromStart(m[1], startHour, true) : label, total };
      });
    } else if (spanDays <= 1) {
      timelineMode = "hourly";
      const hourClipSql = isCalToday ? `AND ${evH} <= ?` : "";
      const hourParams = isCalToday ? [...baseParams, maxHourInclusive] : baseParams;
      const [rows] = await pool.query(
        `
        SELECT ${evH} AS bucket, COUNT(*) AS total
        FROM vehicle_events
        WHERE ${whereSql}
        ${hourClipSql}
        GROUP BY ${evH}
        ORDER BY bucket ASC
      `,
        hourParams
      );
      const map = new Map(rows.map((r) => [Number(r.bucket), Number(r.total)]));
      const slotCount = isCalToday ? maxHourInclusive + 1 : 24;
      timeline = Array.from({ length: slotCount }, (_, h) => ({
        label: siteHourEndLabelFromStart(from, h),
        total: map.get(h) || 0,
      }));
    } else {
      const [rows] = await pool.query(
        `
        SELECT ${evD} AS bucket, COUNT(*) AS total
        FROM vehicle_events
        WHERE ${whereSql}
        GROUP BY ${evD}
        ORDER BY bucket ASC
      `,
        baseParams
      );
      timeline = rows.map((r) => ({
        label: ymdFromDbDate(r.bucket),
        total: Number(r.total || 0),
      }));
    }

    return res.json({
      from,
      to,
      spanDays,
      timelineMode,
      total: Number(mix.total || 0),
      byType: {
        CAR: Number(mix.CAR || 0),
        TRUCK: Number(mix.TRUCK || 0),
        BIKE: Number(mix.BIKE || 0),
        MINITRUCK: Number(mix.MINITRUCK || 0),
        BUS: Number(mix.BUS || 0),
        AUTO: Number(mix.AUTO || 0),
      },
      cameras: camerasWithCounts(camRows, cameraMap),
      cameraMap,
      timeline,
    });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
});

function parseJsonColumn(val) {
  if (val == null) return null;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
  return null;
}

router.get("/vehicle-report-events", async (req, res) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return res.status(400).json({ error: "bad_request", message: "from and to are required (YYYY-MM-DD)" });
  }

  if (to < from) {
    return res.status(400).json({ error: "bad_request", message: "invalid date range" });
  }

  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || "24"), 10) || 24));
  const offset = (page - 1) * pageSize;

  const { whereSql, baseParams } = vehicleReportWhere(from, to, req.query);

  const decodeCameraId = (v) => {
    if (v == null) return "";
    if (typeof v === "object" && Buffer.isBuffer(v)) return v.toString("utf8").replace(/\0+$/g, "");
    return String(v);
  };

  try {
    const cameraMap = await loadMergedCameraMap(pool);
    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM vehicle_events WHERE ${whereSql}`, baseParams);
    const [rows] = await pool.query(
      `
      SELECT
        id,
        event_id,
        camera_id,
        vehicle_num,
        vehicle_category,
        vehicle_type,
        ocr_confidence,
        plate_read_trust,
        plate_read_risk_flags,
        plate_read_metrics,
        timestamp,
        full_image_url,
        plate_url,
        ${evDisplayFmt} AS created_at
      FROM vehicle_events
      WHERE ${whereSql}
      ORDER BY ${evDisplay} DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
      [...baseParams, pageSize, offset]
    );

    return res.json({
      page,
      pageSize,
      total: Number(countRow.total || 0),
      cameraMap,
      rows: rows.map((r) => ({
        id: r.id,
        event_id: r.event_id,
        camera_id: decodeCameraId(r.camera_id),
        vehicle_num: r.vehicle_num,
        vehicle_category: r.vehicle_category,
        vehicle_type: r.vehicle_type,
        ocr_confidence: r.ocr_confidence != null ? Number(r.ocr_confidence) : null,
        plate_read_trust: r.plate_read_trust || null,
        plate_read_risk_flags: parseJsonColumn(r.plate_read_risk_flags),
        plate_read_metrics: parseJsonColumn(r.plate_read_metrics),
        timestamp: Number(r.timestamp || 0),
        full_image_url: r.full_image_url,
        plate_url: r.plate_url,
        created_at: r.created_at,
      })),
    });
  } catch (e) {
    console.error("vehicle-report-events", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/overview", async (req, res) => {
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to, spanDays } = r;
  const hourCap = resolveHourCap(req, from, to);
  const evHourClip = hourCapClause(hourCap, evH);
  const veHourClip = hourCapClause(hourCap, evHve);
  try {
    const cameraMap = await loadMergedCameraMap(pool);
    const [[counts]] = await pool.query(
      `
      SELECT
        COUNT(*) AS "totalReads",
        COUNT(DISTINCT NULLIF(TRIM(vehicle_num), '')) AS "uniquePlates"
      FROM vehicle_events
      WHERE ${evD} BETWEEN ? AND ?
      ${evHourClip.sql}
    `,
      [from, to, ...evHourClip.params]
    );
    const [topCam] = await pool.query(
      `
      SELECT camera_id, COUNT(*) AS c
      FROM vehicle_events
      WHERE ${evD} BETWEEN ? AND ?
      ${evHourClip.sql}
      GROUP BY camera_id
      ORDER BY c DESC
      LIMIT 1
    `,
      [from, to, ...evHourClip.params]
    );
    const best = topCam[0];
    const bestId = best ? normalizeCameraId(best.camera_id) : "";
    const busiestCamera = best
      ? {
          id: bestId,
          name: resolveCameraName(bestId, cameraMap),
          reads: Number(best.c),
        }
      : { id: null, name: "-", reads: 0 };

    const timeseriesGranularity = parseTimeseriesGranularity(req, spanDays);
    const seriesData = await loadDashboardSeries(pool, from, to, spanDays, {
      timeseriesGranularity,
      cameraMap,
      hourCap,
    });
    const violationSeriesData = await loadViolationSeries(pool, from, to, spanDays, {
      timeseriesGranularity,
      hourCap,
    });
    let windowKind = "daily";
    if (spanDays <= 1) {
      windowKind = "calendar_hourly";
    } else if (timeseriesGranularity === "hourly") {
      windowKind = "range_hourly";
    }

    let trafficViolationsByType = {};
    let trafficViolationCount = 0;
    let trafficViolationsByCamera = [];
    try {
      const [vrows] = await pool.query(
        `
        SELECT tv.violation_type, COUNT(*) AS total
        FROM traffic_violations tv
        JOIN vehicle_events ve ON ve.event_id = tv.event_id
        WHERE ${evDve} BETWEEN ? AND ?
          AND ${VIOLATION_FEEDBACK_OK}
        ${veHourClip.sql}
        GROUP BY tv.violation_type
      `,
        [from, to, ...veHourClip.params]
      );

      for (const t of VIOLATION_TYPES) trafficViolationsByType[t] = 0;
      for (const row of vrows || []) {
        const vt = row.violation_type;
        const c = Number(row.total || 0);
        trafficViolationsByType[vt] = (trafficViolationsByType[vt] || 0) + c;
        trafficViolationCount += c;
      }

      const [vcamRows] = await pool.query(
        `
        SELECT ve.camera_id, COUNT(*) AS total
        FROM traffic_violations tv
        JOIN vehicle_events ve ON ve.event_id = tv.event_id
        WHERE ${evDve} BETWEEN ? AND ?
          AND ${VIOLATION_FEEDBACK_OK}
        ${veHourClip.sql}
        GROUP BY ve.camera_id
        ORDER BY total DESC
      `,
        [from, to, ...veHourClip.params]
      );
      trafficViolationsByCamera = (vcamRows || []).map((r) => {
        const camId = normalizeCameraId(r.camera_id);
        return {
          camera_id: camId,
          name: resolveCameraName(camId, cameraMap),
          total: Number(r.total || 0),
        };
      });
    } catch {

      trafficViolationsByType = {};
      trafficViolationCount = 0;
      trafficViolationsByCamera = [];
    }

    const peakInterval = await findPeakReadInterval(
      pool,
      from,
      to,
      spanDays,
      seriesData.timeseries
    );

    const liveCameras = await loadCameraLiveStatus(pool);
    const cameraUptime = await loadCameraUptime(pool, from, to, hourCap);

    let topPlate = null;
    const [topPlateRows] = await pool.query(
      `
      SELECT
        vehicle_num AS plate,
        COUNT(*) AS read_count,
        (ARRAY_AGG(camera_id ORDER BY ${evDisplay} DESC, id DESC))[1] AS last_camera_id
      FROM vehicle_events
      WHERE ${evD} BETWEEN ? AND ?
      ${evHourClip.sql}
        AND vehicle_num IS NOT NULL
        AND TRIM(vehicle_num) <> ''
      GROUP BY vehicle_num
      ORDER BY read_count DESC
      LIMIT 1
    `,
      [from, to, ...evHourClip.params]
    );
    if (topPlateRows[0]) {
      const row = topPlateRows[0];
      const camId = normalizeCameraId(row.last_camera_id);
      topPlate = {
        plate: row.plate,
        reads: Number(row.read_count || 0),
        lastCamera: resolveCameraName(camId, cameraMap),
      };
    }

    return res.json({
      from,
      to,
      spanDays,
      windowKind,
      totalReads: Number(counts.totalReads || 0),
      uniquePlates: Number(counts.uniquePlates || 0),
      trafficViolationCount,
      trafficViolationsByType,
      trafficViolationsByCamera,
      busiestCamera,
      topPlate,
      peakInterval,
      ...seriesData,
      ...violationSeriesData,
      camerasOnline: liveCameras.camerasOnline,
      camerasDeployed: liveCameras.camerasDeployed,
      camerasLive: liveCameras.camerasLive,
      cameraOnlineStaleMinutes: liveCameras.cameraOnlineStaleMinutes,
      cameraUptimePercent: cameraUptime.cameraUptimePercent,
      cameraUptimeByCamera: cameraUptime.cameras,
    });
  } catch (e) {
    console.error("dashboard overview", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/violations-summary", async (req, res) => {
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to } = r;

  const plate = String(req.query.plate || "").trim();
  const cameraId = String(req.query.cameraId || "").trim();

  const where = [`${evDve} BETWEEN ? AND ?`];
  where.push("(tv.feedback IS NULL OR tv.feedback <> 0)");
  const params = [from, to];
  if (plate) {
    where.push("(ve.vehicle_num ILIKE ? OR ve.vehicle_num_raw ILIKE ?)");
    params.push(`%${plate}%`, `%${plate}%`);
  }
  if (cameraId) {
    where.push("ve.camera_id = ?");
    params.push(cameraId);
  }
  const whereSql = where.join(" AND ");

  try {
    const [rows] = await pool.query(
      `
      SELECT tv.violation_type, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${whereSql}
      GROUP BY tv.violation_type
    `,
      params
    );

    const byType = {};
    let total = 0;
    for (const t of VIOLATION_TYPES) byType[t] = 0;
    for (const row of rows || []) {
      const vt = row.violation_type;
      const c = Number(row.total || 0);
      byType[vt] = (byType[vt] || 0) + c;
      total += c;
    }
    return res.json({ from, to, total, byType });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/violations-recidivism", async (req, res) => {
  const monthStart = `${ymdSite().slice(0, 8)}01`;
  const today = ymdSite();
  const limit = Math.min(10, Math.max(1, Number(req.query.limit || 5)));

  try {
    const [[summary]] = await pool.query(
      `
      SELECT COUNT(*) AS "repeatPlates"
      FROM (
        SELECT ve.vehicle_num
        FROM traffic_violations tv
        JOIN vehicle_events ve ON ve.event_id = tv.event_id
        WHERE ${evDve} BETWEEN ? AND ?
          AND ve.vehicle_num IS NOT NULL
          AND TRIM(ve.vehicle_num) <> ''
          AND CHAR_LENGTH(TRIM(ve.vehicle_num)) >= 3
        GROUP BY ve.vehicle_num
        HAVING COUNT(*) > 1
      ) repeaters
    `,
      [monthStart, today]
    );

    const [rows] = await pool.query(
      `
      SELECT
        ve.vehicle_num AS plate,
        COUNT(*) AS violation_count,
        COUNT(DISTINCT tv.violation_type) AS type_count,
        (ARRAY_AGG(tv.violation_type ORDER BY ${evDisplayVe} DESC, ve.id DESC, tv.id DESC))[1] AS latest_type,
        ${evManilaDateTimeFmt("MAX(ve.created_at)", null)} AS latest_detected_at
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ?
        AND ve.vehicle_num IS NOT NULL
        AND TRIM(ve.vehicle_num) <> ''
        AND CHAR_LENGTH(TRIM(ve.vehicle_num)) >= 3
      GROUP BY ve.vehicle_num
      HAVING COUNT(*) > 1
      ORDER BY violation_count DESC, MAX(${evDisplayVe}) DESC
      LIMIT ?
    `,
      [monthStart, today, limit]
    );

    return res.json({
      from: monthStart,
      to: today,
      repeatPlates: Number(summary?.repeatPlates || 0),
      rows: (rows || []).map((r) => ({
        plate: r.plate,
        violationCount: Number(r.violation_count || 0),
        typeCount: Number(r.type_count || 0),
        latestType: r.latest_type,
        latestDetectedAt: r.latest_detected_at,
      })),
    });
  } catch (e) {
    console.error("violations-recidivism", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/violations", async (req, res) => {
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to } = r;

  const focusViolationId = Number(req.query.violationId);
  if (Number.isFinite(focusViolationId) && focusViolationId > 0) {
    try {
      const [rows] = await pool.query(
        `
        SELECT
          tv.id,
          tv.violation_type,
          tv.score,
          ${evDisplayFmtVe} AS detected_at,
          ve.camera_id,
          ve.vehicle_num AS plate,
          ve.full_image_url,
          ve.plate_url
        FROM traffic_violations tv
        JOIN vehicle_events ve ON ve.event_id = tv.event_id
        WHERE tv.id = ?
        LIMIT 1
      `,
        [Math.floor(focusViolationId)]
      );
      const cameraMap = await loadMergedCameraMap(pool);
      const mapped = (rows || []).map((row) => {
        const camId = normalizeCameraId(row.camera_id);
        return {
          id: Number(row.id),
          violationType: row.violation_type,
          score: Number(row.score || 0),
          detectedAt: row.detected_at,
          cameraId: camId,
          cameraName: resolveCameraName(camId, cameraMap),
          plate: row.plate,
          fullImageUrl: row.full_image_url,
          plateUrl: row.plate_url,
        };
      });
      const detectedDay = mapped[0]?.detectedAt ? String(mapped[0].detectedAt).slice(0, 10) : from;
      return res.json({
        from: detectedDay,
        to: detectedDay,
        page: 1,
        pageSize: 1,
        total: mapped.length,
        rows: mapped,
      });
    } catch (e) {
      console.error("violations by id", e);
      return res.status(500).json({ error: "server_error" });
    }
  }

  const typeRaw = String(req.query.type || "").trim().toUpperCase();
  const violationType = VIOLATION_TYPES.includes(typeRaw) ? typeRaw : null;

  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || "24"), 10) || 24));
  const offset = (page - 1) * pageSize;

  const plate = String(req.query.plate || "").trim();
  const cameraId = String(req.query.cameraId || "").trim();

  const where = [`${evDve} BETWEEN ? AND ?`];
  where.push("(tv.feedback IS NULL OR tv.feedback <> 0)");
  const params = [from, to];
  if (violationType) {
    where.push("tv.violation_type = ?");
    params.push(violationType);
  }
  if (plate) {
    where.push("(ve.vehicle_num ILIKE ? OR ve.vehicle_num_raw ILIKE ?)");
    params.push(`%${plate}%`, `%${plate}%`);
  }
  if (cameraId) {
    where.push("ve.camera_id = ?");
    params.push(cameraId);
  }

  const whereSql = where.join(" AND ");

  try {
    const [[countRow]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${whereSql}
    `,
      params
    );

    const [rows] = await pool.query(
      `
      SELECT
        tv.id,
        tv.violation_type,
        tv.score,
        tv.feedback,
        ${evDisplayFmtVe} AS detected_at,
        ve.camera_id,
        ve.vehicle_num AS plate,
        ve.full_image_url,
        ve.plate_url
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${whereSql}
      ORDER BY ${evDisplayVe} DESC, ve.id DESC, tv.id DESC
      LIMIT ?
      OFFSET ?
    `,
      [...params, pageSize, offset]
    );

    const total = Number(countRow?.total || 0);
    const cameraMap = await loadMergedCameraMap(pool);
    return res.json({
      from,
      to,
      page,
      pageSize,
      total,
      rows: (rows || []).map((r) => {
        const camId = normalizeCameraId(r.camera_id);
        return {
          id: Number(r.id),
          violationType: r.violation_type,
          score: Number(r.score || 0),
          feedback: r.feedback == null ? null : Number(r.feedback),
          detectedAt: r.detected_at,
          cameraId: camId,
          cameraName: resolveCameraName(camId, cameraMap),
          plate: r.plate,
          fullImageUrl: r.full_image_url,
          plateUrl: r.plate_url,
        };
      }),
    });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
});

router.post("/violations/:id/feedback", async (req, res) => {
  const violationId = Number(req.params.id);
  const feedback = Number(req.body?.feedback);
  if (!Number.isFinite(violationId) || violationId <= 0) {
    return res.status(400).json({ error: "bad_request", message: "invalid violation id" });
  }
  if (!(feedback === 0 || feedback === 1)) {
    return res.status(400).json({ error: "bad_request", message: "feedback must be 0 or 1" });
  }
  const feedbackBy = req.user?.email || (req.user?.id != null ? String(req.user.id) : null);

  try {
    const [rows] = await pool.query(
      `
      SELECT
        tv.id, tv.event_id, tv.violation_type, tv.score,
        ve.camera_id, ve.vehicle_num AS plate,
        ve.full_image_url, ve.plate_url,
        ${evDisplayFmtVe} AS detected_at
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE tv.id = ?
      LIMIT 1
    `,
      [violationId]
    );
    const v = rows && rows[0];
    if (!v) return res.status(404).json({ error: "not_found", message: "violation not found" });

    await pool.query(
      `UPDATE traffic_violations
         SET feedback = ?, feedback_at = CURRENT_TIMESTAMP, feedback_by = ?
       WHERE id = ?`,
      [feedback, feedbackBy, violationId]
    );

    let exported = null;
    if (feedback === 0) {
      exported = exportFalsePositive({ ...v, feedback_by: feedbackBy });
    } else {
      markCorrected(violationId, feedbackBy);
    }

    return res.json({ ok: true, id: violationId, feedback, exported });
  } catch (e) {
    console.error("violation feedback", e);
    return res.status(500).json({ error: "server_error", message: "Failed to save feedback." });
  }
});

router.get("/categories", async (req, res) => {
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to, spanDays } = r;

  try {
    const cameraMap = await loadMergedCameraMap(pool);
    const out = {};
    for (const [key, cats] of Object.entries(VEHICLE_TYPE_TO_CLASSES)) {
      const placeholders = cats.map(() => "?").join(",");
      const [[row]] = await pool.query(
        `
        SELECT COUNT(*) AS total FROM vehicle_events
        WHERE ${evD} BETWEEN ? AND ?
          AND vehicle_category IN (${placeholders})
      `,
        [from, to, ...cats]
      );
      out[key] = Number(row.total || 0);
    }
    return res.json({
      counts: out,
      from,
      to,
      windowDays: spanDays,
      cameraMap,
      labels: {
        CAR: "Car",
        TRUCK: "Truck",
        BIKE: "Motorcycle",
        MINITRUCK: "Mini-Truck",
        BUS: "Bus",
        AUTO: "Tuk Tuk",
      },
    });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/analytics", async (req, res) => {
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to, spanDays } = r;
  try {
    const cameraMap = await loadMergedCameraMap(pool);
    const timeseriesGranularity = parseTimeseriesGranularity(req, spanDays);
    const data = await loadDashboardSeries(pool, from, to, spanDays, {
      timeseriesGranularity,
      cameraMap,
    });
    let windowKind = "daily";
    if (spanDays <= 1) {
      windowKind = "calendar_hourly";
    } else if (timeseriesGranularity === "hourly") {
      windowKind = "range_hourly";
    }
    return res.json({
      range: "custom",
      windowKind,
      from,
      to,
      ...data,
    });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/top-plates", async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to } = r;

  try {
    const cameraMap = await loadMergedCameraMap(pool);
    const [rows] = await pool.query(
      `
      SELECT
        vehicle_num AS plate,
        COUNT(*) AS total,
        ${evManilaDateTimeFmt("MAX(created_at)", null)} AS last_seen,
        (ARRAY_AGG(camera_id ORDER BY ${evDisplay} DESC, id DESC))[1] AS last_camera_id
      FROM vehicle_events
      WHERE ${evD} BETWEEN ? AND ?
        AND vehicle_num IS NOT NULL
        AND vehicle_num <> ''
      GROUP BY vehicle_num
      ORDER BY total DESC
      LIMIT ?
    `,
      [from, to, limit]
    );

    return res.json({
      from,
      to,
      limit,
      rows: rows.map((row) => {
        const camId = normalizeCameraId(row.last_camera_id);
        return {
          plate: row.plate,
          total: Number(row.total || 0),
          last_seen: row.last_seen,
          last_camera_id: camId,
          last_camera: resolveCameraName(camId, cameraMap),
        };
      }),
    });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/heatmap", async (req, res) => {
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to, spanDays } = r;
  const todayYmd = ymdSite();
  const isCalToday = spanDays === 1 && from === to && from === todayYmd;
  const maxHourInclusive = isCalToday ? hourNowSite() : 23;
  const hourCount = maxHourInclusive + 1;

  try {
    const cameraMap = await loadMergedCameraMap(pool);
    const hourClipSql = isCalToday ? `AND ${evHve} <= ?` : "";
    const params = isCalToday ? [from, to, maxHourInclusive] : [from, to];
    const sql = `
      SELECT ve.camera_id, ${evHve} AS hour, COUNT(*) AS total
      FROM vehicle_events ve
      WHERE ${evDve} BETWEEN ? AND ?
      ${hourClipSql}
      GROUP BY ve.camera_id, ${evHve}
      ORDER BY ve.camera_id, hour
    `;

    const [rows] = await pool.query(sql, params);

    const idsFromRows = new Set(rows.map((row) => normalizeCameraId(row.camera_id)).filter(Boolean));
    const deployOrder = Object.keys(cameraMap).map((id) => String(id));
    const cameraIds = [
      ...deployOrder,
      ...Array.from(idsFromRows)
        .filter((id) => !deployOrder.includes(id))
        .sort(),
    ];
    const cameras = cameraIds.map((id) => ({
      camera_id: String(id),
      name: resolveCameraName(id, cameraMap),
    }));

    const hours = Array.from({ length: hourCount }, (_, h) => String(h).padStart(2, "0"));
    const matrix = {};
    for (const c of cameras) {
      const id = normalizeCameraId(c.camera_id);
      matrix[id] = Array.from({ length: hourCount }).map(() => 0);
    }
    const resolveMatrixKey = (raw) => {
      const cid = normalizeCameraId(raw);
      if (!cid) return null;
      if (matrix[cid]) return cid;
      const found = Object.keys(matrix).find((k) => k.toLowerCase() === cid.toLowerCase());
      return found || null;
    };

    for (const row of rows) {
      const mk = resolveMatrixKey(row.camera_id);
      if (!mk) continue;
      const h = Number(row.hour);
      if (!Number.isFinite(h) || h < 0 || h >= hourCount) continue;
      matrix[mk][h] = Number(row.total || 0);
    }

    return res.json({
      from,
      to,
      hours,
      cameras,
      matrix,
      windowKind: spanDays <= 1 ? "calendar_hourly" : "calendar_aggregate",
    });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/watchlist-hits", async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to } = r;
  const hourCap = resolveHourCap(req, from, to);
  const veHourClip = hourCapClause(hourCap, evHve);

  try {
    const cameraMap = await loadMergedCameraMap(pool);
    // Postgres has no SHOW TABLES; to_regclass() returns NULL when the relation
    // is absent, and the WHERE keeps the "0 or 1 rows" shape the caller expects.
    const [[tVe]] = await pool.query("SELECT 1 AS ok WHERE to_regclass('vehicle_events') IS NOT NULL");
    if (!tVe) {
      return res.json({ from, to, limit, rows: [], activeWatchlists: 0, lastHit: null });
    }

    const { matchers } = await loadWatchPlateMatchers(pool);
    const [veRows] = await pool.query(
      `SELECT ve.id, ve.vehicle_num AS plate, ve.camera_id, ${evDisplayFmtVe} AS created_at
       FROM vehicle_events ve
       WHERE ${evDve} BETWEEN ? AND ? ${veHourClip.sql}
       ORDER BY ve.created_at DESC, ve.id DESC
       LIMIT 400`,
      [from, to, ...veHourClip.params]
    );

    const mapped = [];
    for (const row of veRows) {
      const hit = matchers.find((m) => plateMatches(row.plate, [m], row.camera_id));
      if (!hit) continue;
      mapped.push({
        id: row.id,
        plate: row.plate,
        camera_id: row.camera_id,
        camera: resolveCameraName(normalizeCameraId(row.camera_id), cameraMap),
        created_at: row.created_at,
        list_name: hit.listName || hit.ruleName || "Watchlist",
      });
      if (mapped.length >= limit) break;
    }

    let activeWatchlists = 0;
    try {
      const [[cnt]] = await pool.query(`SELECT COUNT(*) AS c FROM lpr_vehicle_lists WHERE enabled = 1`);
      const [[rcnt]] = await pool.query(`SELECT COUNT(*) AS c FROM lpr_rules WHERE enabled = 1`);
      activeWatchlists = Number(cnt?.c || 0) + Number(rcnt?.c || 0);
    } catch {

    }

    return res.json({
      from,
      to,
      limit,
      activeWatchlists,
      lastHit: mapped[0]?.created_at ?? null,
      rows: mapped,
    });
  } catch (e) {
    console.error("watchlist-hits", e);
    return res.json({ from, to, limit, rows: [], activeWatchlists: 0, lastHit: null });
  }
});

// The traffic briefing (lib/dailyBriefing.js) is parked with the hidden vehicle
// modules — restore this line to serve it again.
// const { buildDailyBriefing } = require("../lib/dailyBriefing");
const { buildVenueBriefing } = require("../lib/venueBriefing");
const { buildVehicleJourney } = require("../lib/vehicleJourney");

router.get("/vehicle-journey", async (req, res) => {
  const plate = String(req.query.plate || "").trim();
  const fromQ = String(req.query.from || "").trim();
  const toQ = String(req.query.to || "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!plate) return res.status(400).json({ error: "bad_request", message: "plate required" });
  const hasRange = Boolean(fromQ || toQ);
  const from = hasRange ? fromQ || ymdSite() : null;
  const to = hasRange ? toQ || from : null;
  if (hasRange && (!dateRe.test(from) || !dateRe.test(to) || to < from)) {
    return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  }
  try {
    const journey = await buildVehicleJourney(pool, plate, from, to);
    if (journey.error) return res.status(400).json(journey);
    return res.json(journey);
  } catch (e) {
    console.error("vehicle-journey", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/daily-briefing", async (req, res) => {
  const r = parseRangeWithDefault(req);
  if (!r) return res.status(400).json({ error: "bad_request", message: "invalid from/to (YYYY-MM-DD)" });
  const { from, to } = r;
  try {
    const briefing = await buildVenueBriefing(pool, from, to);
    return res.json(briefing);
  } catch (e) {
    console.error("daily-briefing", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.post("/daily-briefing/email", async (req, res) => {
  const from = String(req.body?.from || req.query?.from || "").trim();
  const to = String(req.body?.to || req.query?.to || "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to) || from > to) {
    return res.status(400).json({ error: "bad_request", message: "invalid from/to" });
  }
  const recipient = String(req.body?.toEmail || process.env.BRIEFING_EMAIL_TO || process.env.SMTP_USER || "").trim();
  if (!recipient) {
    return res.status(400).json({ ok: false, message: "No briefing email recipient configured." });
  }
  try {
    const briefing = await buildVenueBriefing(pool, from, to);
    const { sendChallanEmail } = require("../lib/demoMailer");
    const lines = [
      `AI Daily Briefing — ${briefing.meta.reportDateLabel}`,
      briefing.meta.preparedFor,
      `Operational Status: ${briefing.report.operationalStatusLabel}`,
      `AI Confidence: ${briefing.report.aiConfidenceScore}%`,
      ``,
      briefing.report.executiveSummary,
      ``,
      `Key Findings:`,
      ...briefing.report.keyFindings.map((f) => `• ${f.label}: ${f.value} (${f.detail})`),
      ``,
      briefing.report.aiNarrative,
      ``,
      `Recommendations:`,
      ...briefing.report.recommendations.map((c) => `• [${c.priority}] ${c.title} — ${c.detail}`),
      ``,
      `Generated: ${briefing.meta.generatedAt}`,
    ];
    await sendChallanEmail({
      to: recipient,
      subject: `AI Daily Briefing — ${from}${from !== to ? ` to ${to}` : ""}`,
      text: lines.join("\n"),
      html: `<pre style="font-family:system-ui,sans-serif;font-size:13px">${lines.join("\n").replace(/</g, "&lt;")}</pre>`,
      meta: { type: "daily_briefing" },
    });
    return res.json({ ok: true, message: `Briefing emailed to ${recipient}.` });
  } catch (e) {
    console.error("daily-briefing/email", e);
    return res.status(503).json({
      ok: false,
      message: "Email is not configured. Add SMTP settings and BRIEFING_EMAIL_TO, or download the PDF instead.",
    });
  }
});

router.get("/waterflow-throughput", async (_req, res) => {
  try {
    const payload = await loadWaterflowHourlyThroughput(pool);
    res.json(payload);
  } catch (e) {
    console.error("waterflow-throughput", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/walkins-range-stats", async (req, res) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return res.status(400).json({ error: "bad_request", message: "from and to are required (YYYY-MM-DD)" });
  }
  if (to < from) {
    return res.status(400).json({ error: "bad_request", message: "invalid date range" });
  }

  const spanDays = daysInclusive(from, to);
  const { whereSql, baseParams } = walkinsReportWhere(from, to, req.query);

  try {
    const cameraMap = walkinCameraMap();
    const siteMap = walkinSiteMap();
    const [[mix]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM walkins
      WHERE ${whereSql}
    `,
      baseParams
    );

    const [hourRows] = await pool.query(
      `
      SELECT ${wH} AS hour, COUNT(*) AS total
      FROM walkins
      WHERE ${whereSql}
      GROUP BY ${wH}
      ORDER BY hour ASC
    `,
      baseParams
    );
    const hourMap = new Map(hourRows.map((r) => [Number(r.hour), Number(r.total || 0)]));
    const byHourOfDay = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: hourMap.get(hour) || 0,
    }));
    let peakHour = { hour: 0, total: 0 };
    for (const slot of byHourOfDay) {
      if (slot.total > peakHour.total) peakHour = slot;
    }

    const [camRows] = await pool.query(
      `
      SELECT camera_id, COUNT(*) AS total
      FROM walkins
      WHERE ${whereSql}
      GROUP BY camera_id
      ORDER BY total DESC
    `,
      baseParams
    );

    const timelineResolution = String(req.query.timelineResolution || "auto").toLowerCase();
    const hourlyForced = timelineResolution === "hourly";
    const timelineResult = await buildWalkinsTimeline(
      pool,
      from,
      to,
      spanDays,
      whereSql,
      baseParams,
      hourlyForced ? "hourly" : "auto"
    );
    if (timelineResult.error) {
      return res.status(400).json({ error: "bad_request", message: timelineResult.error });
    }

    // Gender totals deliberately ignore the gender filter so the donut keeps
    // showing the full split while one segment is selected.
    const unscoped = walkinsReportWhere(from, to, { ...req.query, gender: undefined });
    const [[genderRow]] = await pool.query(
      `SELECT ${walkinGenderCountSelect} FROM walkins WHERE ${unscoped.whereSql}`,
      unscoped.baseParams
    );

    return res.json({
      from,
      to,
      spanDays,
      timelineMode: timelineResult.timelineMode,
      total: Number(mix.total || 0),
      byHourOfDay,
      peakHour,
      byGender: walkinGenderCounts(genderRow),
      activeEntrances: walkinCamerasWithCounts(camRows).filter((c) => (c.total ?? 0) > 0).length,
      cameras: walkinCamerasWithCounts(camRows),
      cameraMap,
      siteMap,
      timeline: timelineResult.timeline,
    });
  } catch (e) {
    console.error("walkins-range-stats", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/walkins-report-events", async (req, res) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return res.status(400).json({ error: "bad_request", message: "from and to are required (YYYY-MM-DD)" });
  }
  if (to < from) {
    return res.status(400).json({ error: "bad_request", message: "invalid date range" });
  }

  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || "24"), 10) || 24));
  const offset = (page - 1) * pageSize;
  const { whereSql, baseParams } = walkinsReportWhere(from, to, req.query);

  try {
    const cameraMap = walkinCameraMap();
    const siteMap = walkinSiteMap();
    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM walkins WHERE ${whereSql}`, baseParams);
    const [rows] = await pool.query(
      `
      SELECT
        id,
        site_id,
        camera_id,
        gender,
        image_path,
        ${wDisplayFmt} AS trigger_date
      FROM walkins
      WHERE ${whereSql}
      ORDER BY ${wDisplay} DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
      [...baseParams, pageSize, offset]
    );

    const mappedRows = rows.map((r) => ({
      id: r.id,
      site_id: Number(r.site_id || 0),
      site_name: resolveWalkinSiteName(r.site_id) || siteMap[Number(r.site_id || 0)] || "",
      camera_id: String(r.camera_id || ""),
      gender: String(r.gender || ""),
      image_path: r.image_path || "",
      trigger_date: r.trigger_date,
    }));

    return res.json({
      page,
      pageSize,
      total: Number(countRow.total || 0),
      cameraMap,
      siteMap,
      rows: attachWalkinFramePaths(mappedRows),
    });
  } catch (e) {
    console.error("walkins-report-events", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/crowds-range-stats", async (req, res) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return res.status(400).json({ error: "bad_request", message: "from and to are required (YYYY-MM-DD)" });
  }
  if (to < from) {
    return res.status(400).json({ error: "bad_request", message: "invalid date range" });
  }

  const spanDays = daysInclusive(from, to);
  const { whereSql, baseParams } = crowdsReportWhere(from, to, req.query);

  try {
    const cameraMap = crowdCameraMap();
    const siteMap = await loadSiteMap(pool);
    const configuredSiteNames = crowdSiteNamesList();
    const siteNames = configuredSiteNames.length
      ? configuredSiteNames
      : await loadCrowdSiteNames(pool, whereSql, baseParams);
    const { alarm: sevAlarm, critical: sevCritical } = crowdSeverityThresholds();
    const [[mix]] = await pool.query(
      `
      SELECT
        COUNT(*) AS total,
        MAX(people_count) AS "peakPeople",
        MAX(occupancy_pct) AS "peakOccupancy",
        SUM(CASE WHEN occupancy_pct < ? THEN 1 ELSE 0 END) AS "ALERT",
        SUM(CASE WHEN occupancy_pct >= ? AND occupancy_pct < ? THEN 1 ELSE 0 END) AS "ALARM",
        SUM(CASE WHEN occupancy_pct >= ? THEN 1 ELSE 0 END) AS "CRITICAL"
      FROM crowds
      WHERE ${whereSql}
    `,
      [sevAlarm, sevAlarm, sevCritical, sevCritical, ...baseParams]
    );

    const [zoneRows] = await pool.query(
      `
      SELECT
        camera_id,
        COUNT(*) AS alerts,
        ${crowdTypeCountSelect},
        MAX(people_count) AS "peakPeople",
        MAX(occupancy_pct) AS "peakOccupancy"
      FROM crowds
      WHERE ${whereSql}
      GROUP BY camera_id
      ORDER BY alerts DESC, "peakOccupancy" DESC
    `,
      baseParams
    );
    const zoneTypeCounts = new Map(
      (zoneRows || []).map((r) => [String(r.camera_id || ""), crowdTypeCounts(r)])
    );

    const timelineResolution = String(req.query.timelineResolution || "auto").toLowerCase();
    const hourlyForced = timelineResolution === "hourly";
    const timelineResult = await buildCrowdsTimeline(
      pool,
      from,
      to,
      spanDays,
      whereSql,
      baseParams,
      hourlyForced ? "hourly" : "auto"
    );
    if (timelineResult.error) {
      return res.status(400).json({ error: "bad_request", message: timelineResult.error });
    }

    // Hour-of-day rollup across the whole range — drives the dashboard alert
    // clock, which folds the period onto a single trading day.
    const [hourRows] = await pool.query(
      `
      SELECT ${cH} AS hour, COUNT(*) AS alerts, ${crowdTypeCountSelect}
      FROM crowds
      WHERE ${whereSql}
      GROUP BY ${cH}
      ORDER BY hour ASC
    `,
      baseParams
    );
    const hourMap = new Map(
      (hourRows || []).map((r) => [Number(r.hour), { total: Number(r.alerts || 0), byAlertType: crowdTypeCounts(r) }])
    );
    const byHourOfDay = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: hourMap.get(hour)?.total ?? 0,
      byAlertType: hourMap.get(hour)?.byAlertType ?? { ...EMPTY_CROWD_TYPE_COUNTS },
    }));
    let peakHour = { hour: 0, total: 0 };
    for (const slot of byHourOfDay) {
      if (slot.total > peakHour.total) peakHour = { hour: slot.hour, total: slot.total };
    }

    // Per-type totals deliberately ignore the alertType filter so the three
    // alert tiles keep showing every category while one of them is selected.
    const unscoped = crowdsReportWhere(from, to, { ...req.query, alertType: undefined });
    const [typeRows] = await pool.query(
      `SELECT alert_type, COUNT(*) AS total FROM crowds WHERE ${unscoped.whereSql} GROUP BY alert_type`,
      unscoped.baseParams
    );
    const byAlertType = Object.fromEntries(CROWD_ALERT_TYPES.map((t) => [t, 0]));
    for (const r of typeRows || []) {
      const key = String(r.alert_type || "");
      if (key in byAlertType) byAlertType[key] = Number(r.total || 0);
    }

    return res.json({
      from,
      to,
      spanDays,
      timelineMode: timelineResult.timelineMode,
      total: Number(mix.total || 0),
      peakPeople: Number(mix.peakPeople || 0),
      peakOccupancy: Number(mix.peakOccupancy || 0),
      bySeverity: {
        ALERT: Number(mix.ALERT || 0),
        ALARM: Number(mix.ALARM || 0),
        CRITICAL: Number(mix.CRITICAL || 0),
      },
      byAlertType,
      byHourOfDay,
      peakHour,
      severityThresholds: { alarm: sevAlarm, critical: sevCritical },
      zones: crowdZonesWithCounts(zoneRows).map((z) => ({
        ...z,
        byAlertType: zoneTypeCounts.get(String(z.camera_id)) ?? { ...EMPTY_CROWD_TYPE_COUNTS },
      })),
      cameraMap,
      siteMap,
      siteNames,
      timeline: timelineResult.timeline,
    });
  } catch (e) {
    console.error("crowds-range-stats", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/crowds-report-events", async (req, res) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return res.status(400).json({ error: "bad_request", message: "from and to are required (YYYY-MM-DD)" });
  }
  if (to < from) {
    return res.status(400).json({ error: "bad_request", message: "invalid date range" });
  }

  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || "24"), 10) || 24));
  const offset = (page - 1) * pageSize;
  const { whereSql, baseParams } = crowdsReportWhere(from, to, req.query);

  try {
    const cameraMap = crowdCameraMap();
    const siteMap = await loadSiteMap(pool);
    const configuredSiteNames = crowdSiteNamesList();
    const siteNames = configuredSiteNames.length
      ? configuredSiteNames
      : await loadCrowdSiteNames(pool, whereSql, baseParams);
    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM crowds WHERE ${whereSql}`, baseParams);
    const [rows] = await pool.query(
      `
      SELECT
        id,
        site_id,
        site_name,
        camera_id,
        alert_type,
        people_count,
        occupancy_pct,
        image_path,
        ${cDisplayFmt} AS trigger_date
      FROM crowds
      WHERE ${whereSql}
      ORDER BY ${cDisplay} DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
      [...baseParams, pageSize, offset]
    );

    return res.json({
      page,
      pageSize,
      total: Number(countRow.total || 0),
      cameraMap,
      siteMap,
      siteNames,
      rows: rows.map((r) => ({
        id: r.id,
        site_id: r.site_id != null ? Number(r.site_id) : null,
        site_name: String(r.site_name || ""),
        camera_id: String(r.camera_id || ""),
        alert_type: String(r.alert_type || ""),
        people_count: Number(r.people_count || 0),
        occupancy_pct: Number(r.occupancy_pct || 0),
        image_path: r.image_path || "",
        trigger_date: r.trigger_date,
      })),
    });
  } catch (e) {
    console.error("crowds-report-events", e);
    return res.status(500).json({ error: "server_error" });
  }
});

module.exports = { dashboardRouter: router };

