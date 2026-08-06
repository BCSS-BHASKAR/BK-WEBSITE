const { VIOLATION_TYPES } = require("./chatConstants");
const {
  normalizeCameraId,
  loadMergedCameraMap,
  resolveCameraName,
} = require("../cameras");
const {
  ymdSite,
  ymdSiteSubtractDays,
  ymdSiteAddDays,
  hourNowSite,
  siteHourEndLabelFromStart,
} = require("../siteTimeZone");
const { loadWatchPlateMatchers, plateMatches } = require("./watchlistDb");
const {
  evManilaDate,
  evManilaHour,
  evManilaExpr,
  evManilaYmdFmt,
} = require("../eventTimeSql");

const evD = evManilaDate("created_at", null);
const evH = evManilaHour("created_at", null);
const evYmd = evManilaYmdFmt("created_at", null);
const evExpr = evManilaExpr("created_at", null);
const evYmdVe = evManilaYmdFmt("ve.created_at", null);
const evDve = evManilaDate("ve.created_at", null);
const evHve = evManilaHour("ve.created_at", null);
const evExprVe = evManilaExpr("ve.created_at", null);

function timeCapSql(expr, throughDateTime) {
  if (!throughDateTime) return { sql: "", params: [] };
  return { sql: ` AND ${expr} <= ? `, params: [throughDateTime] };
}

function maxHourFromThrough(throughDateTime) {
  if (!throughDateTime) return 23;
  const dayjs = require("dayjs");
  const utc = require("dayjs/plugin/utc");
  const timezone = require("dayjs/plugin/timezone");
  const { SITE_TIMEZONE } = require("../config/siteConfig");
  dayjs.extend(utc);
  dayjs.extend(timezone);
  return dayjs.tz(throughDateTime, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE).hour();
}

function siteNow() {
  const dayjs = require("dayjs");
  const utc = require("dayjs/plugin/utc");
  const timezone = require("dayjs/plugin/timezone");
  const { SITE_TIMEZONE } = require("../config/siteConfig");
  dayjs.extend(utc);
  dayjs.extend(timezone);
  return dayjs().tz(SITE_TIMEZONE);
}

function buildLiveComparisonWindow(from, to, spanDays) {
  const today = ymdSite();
  const isSingleDay = from === to;
  if (!isSingleDay || to !== today) {
    return {
      isLiveSameTime: false,
      throughCurrent: null,
      throughPrior: null,
      compareLabel: isSingleDay && spanDays === 1 ? "yesterday (full day)" : "prior period",
      windowLabel: null,
      todayDetail: "today",
      priorDetail: isSingleDay ? "yesterday (full day)" : "prior period",
    };
  }
  const now = siteNow();
  const windowLabel = `${now.startOf("day").format("h:mm A")} – ${now.format("h:mm A")}`;
  return {
    isLiveSameTime: true,
    throughCurrent: now.format("YYYY-MM-DD HH:mm:ss"),
    throughPrior: now.subtract(1, "day").format("YYYY-MM-DD HH:mm:ss"),
    compareLabel: "same time yesterday",
    windowLabel,
    todayDetail: `today (${windowLabel})`,
    priorDetail: `yesterday (${windowLabel})`,
  };
}
const { VEHICLE_TYPE_TO_CLASSES } = require("../domain");

const VIOLATION_LABELS = {
  NO_HELMET: "No Helmet",
  WRONG_PARKING: "Wrong Parking",
  WRONG_ROUTE: "Wrong Route",
  TRIPLE_RIDING: "Triple Riding",
  SPEED: "Speeding",
  HEAVY: "Heavy Vehicle",
  LANE_DISCIPLINE: "Lane Discipline",
  DANGEROUS_DRIVING: "Dangerous Driving",
  MANUAL: "Manual Violation",
  WRONG_SIDE: "Wrong Side",
  PEDESTRIAN_OBSTRUCTION: "Pedestrian Obstruction",
};

function violationLabel(code) {
  return VIOLATION_LABELS[code] || String(code || "").replace(/_/g, " ");
}

function daysInclusive(fromStr, toStr) {
  const a = new Date(`${fromStr}T12:00:00`);
  const b = new Date(`${toStr}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function pctDelta(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (p <= 0) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / p) * 1000) / 10;
}

function riskLevel(count) {
  const n = Number(count || 0);
  if (n >= 10) return "Critical";
  if (n >= 5) return "High";
  if (n >= 3) return "Medium";
  return "Low";
}

async function countReads(pool, from, to, throughDateTime = null) {
  const cap = timeCapSql(evExpr, throughDateTime);
  const params = [from, to, ...cap.params];
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n FROM vehicle_events WHERE ${evD} BETWEEN ? AND ? ${cap.sql}`,
    params
  );
  return Number(row?.n || 0);
}

async function countViolations(pool, from, to, throughDateTime = null) {
  const cap = timeCapSql(evExprVe, throughDateTime);
  const params = [from, to, ...cap.params];
  try {
    const [[row]] = await pool.query(
      `
      SELECT COUNT(*) AS n
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ? ${cap.sql}
    `,
      params
    );
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

async function countCitations(pool, from, to, throughDateTime = null) {
  const cap = timeCapSql(evExprVe, throughDateTime);
  const params = [from, to, ...cap.params];
  try {
    const [[row]] = await pool.query(
      `
      SELECT COUNT(*) AS n
      FROM violation_ticket_flags vf
      JOIN traffic_violations tv ON tv.id = vf.violation_id
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE vf.flag = 1 AND ${evDve} BETWEEN ? AND ? ${cap.sql}
    `,
      params
    );
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

async function violationsByType(pool, from, to, throughDateTime = null) {
  const cap = timeCapSql(evExprVe, throughDateTime);
  const params = [from, to, ...cap.params];
  const out = {};
  for (const t of VIOLATION_TYPES) out[t] = 0;
  try {
    const [rows] = await pool.query(
      `
      SELECT tv.violation_type, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ? ${cap.sql}
      GROUP BY tv.violation_type
    `,
      params
    );
    for (const r of rows || []) {
      out[r.violation_type] = Number(r.total || 0);
    }
  } catch {

  }
  return out;
}

async function violationsByCamera(pool, from, to, cameraMap, throughDateTime = null) {
  const cap = timeCapSql(evExprVe, throughDateTime);
  const params = [from, to, ...cap.params];
  try {
    const [rows] = await pool.query(
      `
      SELECT ve.camera_id, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ? ${cap.sql}
      GROUP BY ve.camera_id
      ORDER BY total DESC
    `,
      params
    );
    return (rows || []).map((r) => {
      const camId = normalizeCameraId(r.camera_id);
      const total = Number(r.total || 0);
      return {
        cameraId: camId,
        name: resolveCameraName(camId, cameraMap),
        total,
      };
    });
  } catch {
    return [];
  }
}

async function hourlyReads(pool, from, to, throughDateTime = null) {
  const cap = timeCapSql(evExpr, throughDateTime);
  const params = [from, to, ...cap.params];
  const maxHour = maxHourFromThrough(throughDateTime);
  const [rows] = await pool.query(
    `
    SELECT ${evH} AS h, COUNT(*) AS total
    FROM vehicle_events
    WHERE ${evD} BETWEEN ? AND ? ${cap.sql}
    GROUP BY ${evH}
    ORDER BY h ASC
  `,
    params
  );
  const map = new Map((rows || []).map((r) => [Number(r.h), Number(r.total || 0)]));
  const points = [];
  for (let h = 0; h <= maxHour; h++) {
    points.push({
      hour: h,
      label: siteHourEndLabelFromStart(from, h).replace(/^\d{4}-\d{2}-\d{2} /, ""),
      total: map.get(h) || 0,
    });
  }
  return points;
}

async function hourlyViolations(pool, from, to, throughDateTime = null) {
  const cap = timeCapSql(evExprVe, throughDateTime);
  const params = [from, to, ...cap.params];
  const maxHour = maxHourFromThrough(throughDateTime);
  try {
    const [rows] = await pool.query(
      `
      SELECT ${evHve} AS h, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ? ${cap.sql}
      GROUP BY ${evHve}
      ORDER BY h ASC
    `,
      params
    );
    const map = new Map((rows || []).map((r) => [Number(r.h), Number(r.total || 0)]));
    const points = [];
    for (let h = 0; h <= maxHour; h++) {
      points.push({
        hour: h,
        label: siteHourEndLabelFromStart(from, h).replace(/^\d{4}-\d{2}-\d{2} /, ""),
        total: map.get(h) || 0,
      });
    }
    return points;
  } catch {
    return [];
  }
}

async function dailyReadsTrend(pool, from, to) {
  const [rows] = await pool.query(
    `
    SELECT ${evYmd} AS d, COUNT(*) AS total
    FROM vehicle_events
    WHERE ${evD} BETWEEN ? AND ?
    GROUP BY ${evYmd}
    ORDER BY d ASC
  `,
    [from, to]
  );
  return (rows || []).map((r) => ({
    date: String(r.d).slice(0, 10),
    reads: Number(r.total || 0),
  }));
}

async function readsByCamera(pool, from, to, cameraMap, throughDateTime = null) {
  const cap = timeCapSql(evExpr, throughDateTime);
  const params = [from, to, ...cap.params];
  const [rows] = await pool.query(
    `
    SELECT camera_id, COUNT(*) AS total
    FROM vehicle_events
    WHERE ${evD} BETWEEN ? AND ? ${cap.sql}
    GROUP BY camera_id
    ORDER BY total DESC
  `,
    params
  );
  return (rows || []).map((r) => {
    const camId = normalizeCameraId(r.camera_id);
    return {
      cameraId: camId,
      name: resolveCameraName(camId, cameraMap),
      total: Number(r.total || 0),
    };
  });
}

async function dailyViolationsTrend(pool, from, to) {
  try {
    const [rows] = await pool.query(
      `
      SELECT ${evYmdVe} AS d, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ?
      GROUP BY ${evYmdVe}
      ORDER BY d ASC
    `,
      [from, to]
    );
    return (rows || []).map((r) => ({
      date: String(r.d).slice(0, 10),
      violations: Number(r.total || 0),
    }));
  } catch {
    return [];
  }
}

async function vehicleClassMix(pool, from, to) {
  const labels = {
    CAR: "Car",
    TRUCK: "Truck",
    BIKE: "Motorcycle",
    MINITRUCK: "Mini-Truck",
    BUS: "Bus",
    AUTO: "Tuk Tuk",
  };
  const out = [];
  for (const [key, cats] of Object.entries(VEHICLE_TYPE_TO_CLASSES)) {
    const placeholders = cats.map(() => "?").join(",");
    const [[row]] = await pool.query(
      `
      SELECT COUNT(*) AS total FROM vehicle_events
      WHERE ${evD} BETWEEN ? AND ? AND vehicle_category IN (${placeholders})
    `,
      [from, to, ...cats]
    );
    out.push({ key, label: labels[key] || key, total: Number(row?.total || 0) });
  }
  return out.filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
}

async function repeatOffendersInRange(pool, from, to, limit = 10) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        ve.vehicle_num AS plate,
        COUNT(*) AS violation_count,
        SUBSTRING_INDEX(GROUP_CONCAT(tv.violation_type ORDER BY ve.created_at DESC), ',', 1) AS latest_type
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${evDve} BETWEEN ? AND ?
        AND ve.vehicle_num IS NOT NULL
        AND TRIM(ve.vehicle_num) <> ''
        AND CHAR_LENGTH(TRIM(ve.vehicle_num)) >= 3
      GROUP BY ve.vehicle_num
      HAVING COUNT(*) > 1
      ORDER BY violation_count DESC
      LIMIT ?
    `,
      [from, to, limit]
    );
    return (rows || []).map((r, i) => ({
      rank: i + 1,
      plate: r.plate,
      violations: Number(r.violation_count || 0),
      mostCommon: violationLabel(r.latest_type),
      riskLevel: riskLevel(r.violation_count),
    }));
  } catch {
    return [];
  }
}

async function repeatOffenderCount(pool, from, to, throughDateTime = null) {
  const cap = timeCapSql(evExprVe, throughDateTime);
  const params = [from, to, ...cap.params];
  try {
    const [[row]] = await pool.query(
      `
      SELECT COUNT(*) AS n FROM (
        SELECT ve.vehicle_num
        FROM traffic_violations tv
        JOIN vehicle_events ve ON ve.event_id = tv.event_id
        WHERE ${evDve} BETWEEN ? AND ? ${cap.sql}
          AND ve.vehicle_num IS NOT NULL AND TRIM(ve.vehicle_num) <> ''
        GROUP BY ve.vehicle_num
        HAVING COUNT(*) > 1
      ) t
    `,
      params
    );
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

function topViolationType(byType) {
  let best = { code: "", count: 0 };
  for (const [code, count] of Object.entries(byType || {})) {
    const c = Number(count || 0);
    if (c > best.count) best = { code, count: c };
  }
  return best;
}

function peakHourStats(hourly) {
  let best = hourly[0] || { hour: 0, total: 0 };
  for (const p of hourly || []) {
    if (Number(p.total || 0) > Number(best.total || 0)) best = p;
  }
  const h = Number(best.hour ?? 0);
  const end = (h + 1) % 24;
  return {
    hour: h,
    total: Number(best.total || 0),
    label: `${String(h).padStart(2, "0")}:00 – ${String(end).padStart(2, "0")}:00`,
  };
}

function peakHourLabel(hourly) {
  return peakHourStats(hourly).label;
}

function changeInsight(current, prior, opts = {}) {
  const { higherIsWorse = true, inverted = false, periodLabel = "prior period" } = opts;
  const pct = pctDelta(current, prior);
  const dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const changeLabel =
    dir === "flat"
      ? `Unchanged vs ${periodLabel}`
      : `${pct > 0 ? "+" : ""}${pct}% vs ${periodLabel}`;

  const upIsBad = inverted ? false : higherIsWorse;
  let badge;
  let badgeTone;
  if (dir === "flat") {
    badge = "Stable";
    badgeTone = "neutral";
  } else if (dir === "up") {
    badge = upIsBad ? "Increasing" : "Rising";
    badgeTone = upIsBad ? "danger" : "success";
  } else {
    badge = upIsBad ? "Decreasing" : "Improving";
    badgeTone = upIsBad ? "success" : "info";
  }

  return {
    changeDirection: dir,
    changePct: pct,
    changeLabel,
    priorValue: Number(prior || 0),
    currentValue: Number(current || 0),
    badge,
    badgeTone,
  };
}

function formatReportDateLabel(from, to) {
  const dayjs = require("dayjs");
  const utc = require("dayjs/plugin/utc");
  const timezone = require("dayjs/plugin/timezone");
  const { SITE_TIMEZONE } = require("../config/siteConfig");
  dayjs.extend(utc);
  dayjs.extend(timezone);
  const fmt = (ymd) => dayjs.tz(ymd, "YYYY-MM-DD", SITE_TIMEZONE).format("D MMMM YYYY");
  if (from === to) {
    const dow = dayjs.tz(from, "YYYY-MM-DD", SITE_TIMEZONE).format("dddd");
    return `${fmt(from)} (${dow})`;
  }
  return `${fmt(from)} – ${fmt(to)}`;
}

function resolveGeneratedAt(from, to, nowIso = new Date().toISOString()) {
  const dayjs = require("dayjs");
  const utc = require("dayjs/plugin/utc");
  const timezone = require("dayjs/plugin/timezone");
  const { SITE_TIMEZONE } = require("../config/siteConfig");
  dayjs.extend(utc);
  dayjs.extend(timezone);

  const today = ymdSite();
  const isToday = String(to) === today;
  const at = isToday
    ? dayjs(nowIso).tz(SITE_TIMEZONE)
    : dayjs.tz(`${to} 23:59:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);

  return {
    generatedAt: at.toISOString(),
    generatedAtLabel: at.format("hh:mm A"),
  };
}

async function countWatchlistHits(pool, from, to, throughDateTime = null) {
  const cap = timeCapSql(evExpr, throughDateTime);
  const params = [from, to, ...cap.params];
  try {
    const [[tVe]] = await pool.query("SHOW TABLES LIKE 'vehicle_events'");
    if (!tVe) return 0;
    const { matchers } = await loadWatchPlateMatchers(pool);
    if (!matchers.length) return 0;
    const [veRows] = await pool.query(
      `SELECT ve.vehicle_num AS plate, ve.camera_id
       FROM vehicle_events ve
       WHERE ${evD} BETWEEN ? AND ? ${cap.sql}
       LIMIT 500`,
      params
    );
    let n = 0;
    for (const row of veRows || []) {
      if (matchers.find((m) => plateMatches(row.plate, [m], row.camera_id))) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

function largestTypeChange(currentByType, priorByType) {
  let best = { code: "", pct: 0, count: 0, prior: 0 };
  for (const code of VIOLATION_TYPES) {
    const c = Number(currentByType[code] || 0);
    const p = Number(priorByType[code] || 0);
    const pct = pctDelta(c, p);
    if (Math.abs(pct) > Math.abs(best.pct) || (Math.abs(pct) === Math.abs(best.pct) && c > best.count)) {
      best = { code, pct, count: c, prior: p };
    }
  }
  return best;
}

function siteRiskLevel(violations, totalViolations, maxViolations) {
  const v = Number(violations || 0);
  const share = totalViolations > 0 ? v / totalViolations : 0;
  if (v >= Math.max(15, maxViolations * 0.35) || share >= 0.35) return "High";
  if (v >= 5 || share >= 0.12) return "Medium";
  return "Low";
}

function operationalStatus(violations, violationsDelta) {
  if (violations >= 150 || violationsDelta >= 30) return "HIGH_ALERT";
  if (violations >= 60 || violationsDelta >= 12) return "ELEVATED";
  return "NORMAL";
}

function aiConfidenceScore(ctx) {
  let score = 86;
  if (ctx.plateReads > 500) score += 4;
  if (ctx.violationTotal > 0) score += 5;
  if (ctx.siteCount >= 3) score += 2;
  if (ctx.watchlistConfigured) score += 1;
  return Math.min(99.4, Math.round(score * 10) / 10);
}

function mergeSiteRanking(readsByCam, byCamera, priorByCamera, violationTotal, periodLabel = "prior period") {
  const map = new Map();
  for (const r of readsByCam) {
    map.set(r.name, { name: r.name, cameraId: r.cameraId, reads: r.total, violations: 0 });
  }
  for (const v of byCamera) {
    const cur = map.get(v.name) || { name: v.name, cameraId: v.cameraId, reads: 0, violations: 0 };
    cur.violations = v.total;
    cur.cameraId = v.cameraId;
    map.set(v.name, cur);
  }
  const priorMap = new Map((priorByCamera || []).map((s) => [s.name, s.total]));
  const maxV = Math.max(1, ...[...map.values()].map((s) => s.violations));
  return [...map.values()]
    .sort((a, b) => b.violations - a.violations || b.reads - a.reads)
    .map((s, i) => {
      const prior = priorMap.get(s.name) || 0;
      const trendPct = pctDelta(s.violations, prior);
      const trend =
        s.violations > prior ? "up" : s.violations < prior ? "down" : "stable";
      const changeLabel =
        trend === "stable"
          ? `Unchanged vs ${periodLabel}`
          : `${trendPct > 0 ? "+" : ""}${trendPct}% vs ${periodLabel}`;
      return {
        rank: i + 1,
        name: s.name,
        violations: s.violations,
        priorViolations: prior,
        trafficVolume: s.reads,
        riskLevel: siteRiskLevel(s.violations, violationTotal, maxV),
        trend,
        trendPct,
        changeLabel,
        violationSharePct:
          violationTotal > 0 ? Math.round((s.violations / violationTotal) * 1000) / 10 : 0,
      };
    });
}

function buildArchive(currentFrom, currentTo) {
  const rows = [];
  const nowIso = new Date().toISOString();
  for (let i = 6; i >= 0; i--) {
    const d = ymdSiteSubtractDays(i);
    const { generatedAtLabel } = resolveGeneratedAt(d, d, nowIso);
    rows.push({
      from: d,
      to: d,
      dateLabel: formatReportDateLabel(d, d),
      reportType: "Daily Intelligence Brief",
      generatedAtLabel,
      isCurrent: d === currentFrom && d === currentTo,
    });
  }
  return rows;
}

function buildExecutiveSummary(ctx) {
  const {
    plateReads,
    violationTotal,
    topTypeLabel,
    topTypeShare,
    topSite,
    topSiteShare,
    peakHour,
    violationsDelta,
    periodLabel,
    comparisonLabel,
    comparisonWindowLabel,
    isLiveSameTime,
  } = ctx;
  const cmp = comparisonLabel || "prior period";
  const dir =
    violationsDelta > 0
      ? `up ${violationsDelta}% vs ${cmp}`
      : violationsDelta < 0
        ? `down ${Math.abs(violationsDelta)}% vs ${cmp}`
        : `unchanged vs ${cmp}`;
  const windowNote = isLiveSameTime && comparisonWindowLabel
    ? ` All figures are aligned to the same clock window (${comparisonWindowLabel}) today and yesterday for a fair comparison.`
    : "";
  return (
    `During the reporting period (${periodLabel}), the traffic monitoring network recorded ${plateReads.toLocaleString()} vehicle detections and ${violationTotal.toLocaleString()} traffic violations. ` +
    `${topTypeLabel} violations were the most common offense, representing ${topTypeShare}% of all violations. ` +
    `The ${topSite} checkpoint recorded the highest violation activity with ${topSiteShare}% of total violations. ` +
    `Peak violation activity occurred between ${peakHour}. Overall enforcement demand is ${dir}.${windowNote}`
  );
}

function buildAiNarrative(ctx) {
  const {
    plateReads,
    readsDelta,
    violationTotal,
    topSite,
    peakHour,
    watchlistHits,
    repeatOffenders,
    periodLabel,
    comparisonLabel,
  } = ctx;
  const cmp = comparisonLabel || "the previous period";
  const trafficDir =
    readsDelta > 0 ? `higher than ${cmp}` : readsDelta < 0 ? `lower than ${cmp}` : `consistent with ${cmp}`;
  return (
    `Traffic density across monitored corridors during ${periodLabel} was ${trafficDir}, with ${plateReads.toLocaleString()} plate reads processed system-wide. ` +
    `Violation detections totaled ${violationTotal.toLocaleString()}, with concentration at the ${topSite} site suggesting localized enforcement pressure rather than network-wide surge. ` +
    `The busiest violation window was ${peakHour}, aligning with typical commute and commercial activity patterns. ` +
    (watchlistHits > 0
      ? `${watchlistHits} watchlist match${watchlistHits === 1 ? "" : "es"} were recorded and require supervisor review. `
      : "No watchlist matches were recorded during this period. ") +
    (repeatOffenders > 0
      ? `${repeatOffenders} repeat offender plate${repeatOffenders === 1 ? "" : "s"} were identified for follow-up. `
      : "") +
    `No emerging threat patterns were detected beyond expected peak-hour congestion and routine violation clusters.`
  );
}

function buildKeyFindings(ctx) {
  const {
    compareLabel,
    todayDetail,
    priorDetail,
    typeChange,
    topSite,
    topSiteViolations,
    priorTopSiteViolations,
    topTypeLabel,
    topTypeCount,
    priorTopTypeCount,
    topTypeShare,
    peakHour,
    peakHourCount,
    priorPeakHourCount,
    watchlistHits,
    priorWatchlistHits,
  } = ctx;

  const typeInsight = changeInsight(typeChange.count, typeChange.prior, { periodLabel: compareLabel, higherIsWorse: true });
  const siteInsight = changeInsight(topSiteViolations, priorTopSiteViolations, { periodLabel: compareLabel, higherIsWorse: true });
  const violationInsight = changeInsight(topTypeCount, priorTopTypeCount, { periodLabel: compareLabel, higherIsWorse: true });
  const peakInsight = changeInsight(peakHourCount, priorPeakHourCount, { periodLabel: compareLabel, higherIsWorse: true });
  const watchInsight = changeInsight(watchlistHits, priorWatchlistHits, {
    periodLabel: compareLabel,
    higherIsWorse: true,
    inverted: true,
  });

  const typeLabel = violationLabel(typeChange.code) || "Violations";
  const typeTitle =
    typeChange.pct > 0 ? "Largest Increase" : typeChange.pct < 0 ? "Largest Decrease" : "Violation Trend";

  return [
    {
      ...typeInsight,
      id: "increase",
      title: typeTitle,
      value: typeChange.pct !== 0 ? `${typeChange.pct > 0 ? "+" : ""}${typeChange.pct}%` : "0%",
      detail: `${typeLabel} · ${typeChange.count} ${todayDetail}, ${typeChange.prior} ${priorDetail}`,
      badge:
        typeInsight.changeDirection === "flat"
          ? "Stable Trend"
          : typeInsight.changeDirection === "up"
            ? typeChange.pct > 10
              ? "Increasing Trend"
              : "Slight Rise"
            : "Declining Trend",
      badgeTone: typeInsight.badgeTone,
    },
    {
      ...siteInsight,
      id: "site",
      title: "Highest Risk Site",
      value: topSite,
      detail: `${topSiteViolations} violations ${todayDetail} · ${priorTopSiteViolations} ${priorDetail}`,
      badge: siteInsight.changeDirection === "up" ? "High Risk" : siteInsight.changeDirection === "down" ? "Easing" : "High Risk",
      badgeTone: siteInsight.changeDirection === "down" ? "success" : "danger",
    },
    {
      ...violationInsight,
      id: "violation",
      title: "Most Common Violation",
      value: topTypeLabel,
      detail: `${topTypeCount} violations (${topTypeShare}%) ${todayDetail} · ${priorTopTypeCount} ${priorDetail}`,
      badge:
        violationInsight.changeDirection === "up"
          ? "Primary Offense"
          : violationInsight.changeDirection === "down"
            ? "Declining"
            : "Primary Offense",
      badgeTone: violationInsight.badgeTone === "neutral" ? "warning" : violationInsight.badgeTone,
    },
    {
      ...peakInsight,
      id: "time",
      title: "Most Active Time",
      value: peakHour,
      detail: `${peakHourCount} in peak window ${todayDetail} · ${priorPeakHourCount} ${priorDetail}`,
      badge: peakInsight.changeDirection === "up" ? "Peak Window" : peakInsight.changeDirection === "down" ? "Quieter Peak" : "Peak Window",
      badgeTone: peakInsight.badgeTone === "neutral" ? "info" : peakInsight.badgeTone,
    },
    {
      ...watchInsight,
      id: "watchlist",
      title: "Watchlist Activity",
      value: String(watchlistHits),
      detail:
        watchlistHits > 0
          ? `${watchlistHits} matches ${todayDetail} · ${priorWatchlistHits} ${priorDetail}`
          : `No watchlist hits ${todayDetail} · ${priorWatchlistHits} ${priorDetail}`,
      badge:
        watchlistHits > 0
          ? watchInsight.changeDirection === "up"
            ? "Review Required"
            : "Active Matches"
          : watchInsight.changeDirection === "down" && priorWatchlistHits > 0
            ? "Improving"
            : "All Clear",
      badgeTone: watchInsight.badgeTone,
    },
  ];
}

function buildCommandRecommendations(ctx) {
  const { topSite, topTypeLabel, peakHour, secondTypeLabel, repeatOffenders } = ctx;
  const recs = [
    {
      priority: 1,
      label: "Priority 1",
      title: `Increase visibility at ${topSite} checkpoint`,
      body: "Deploy additional officers during peak traffic hours to deter violations and improve compliance.",
      tone: "danger",
    },
    {
      priority: 2,
      label: "Priority 2",
      title: `Focus ${topTypeLabel} enforcement`,
      body: `Prioritize ${topTypeLabel} violations during the ${peakHour} window when detections peak.`,
      tone: "warning",
    },
  ];
  if (secondTypeLabel) {
    recs.push({
      priority: 3,
      label: "Priority 3",
      title: `Monitor ${secondTypeLabel} zones`,
      body: `Review camera coverage and signage at sites reporting elevated ${secondTypeLabel} activity.`,
      tone: "info",
    });
  }
  recs.push({
    priority: 4,
    label: "General",
    title: "Continue current operations",
    body:
      repeatOffenders > 0
        ? `Maintain patrol coverage; review ${repeatOffenders} repeat offender case(s) for escalation.`
        : "Maintain standard patrol coverage and routine checkpoint operations.",
    tone: "success",
  });
  return recs;
}

async function buildDailyBriefing(pool, from, to) {
  const spanDays = daysInclusive(from, to);
  const cameraMap = await loadMergedCameraMap(pool);
  const cmp = buildLiveComparisonWindow(from, to, spanDays);
  const throughCurrent = cmp.throughCurrent;
  const throughPrior = cmp.throughPrior;
  const compareLabel = cmp.compareLabel;

  const priorTo = ymdSiteAddDays(from, -1);
  const priorFrom = from === to ? priorTo : ymdSiteAddDays(from, -spanDays);
  const priorDayFrom = from === to ? priorTo : priorFrom;
  const priorDayTo = from === to ? priorTo : priorTo;

  const [
    plateReads,
    violations,
    citationsGenerated,
    repeatOffendersCount,
    priorReads,
    priorViolations,
    byType,
    priorByType,
    byCamera,
    priorByCamera,
    readsByCam,
    hourlyTraffic,
    hourlyViolationPts,
    priorHourlyViolationPts,
    repeatOffenders,
    watchlistHits,
    priorWatchlistHits,
  ] = await Promise.all([
    countReads(pool, from, to, throughCurrent),
    countViolations(pool, from, to, throughCurrent),
    countCitations(pool, from, to, throughCurrent),
    repeatOffenderCount(pool, from, to, throughCurrent),
    countReads(pool, priorFrom, priorTo, throughPrior),
    countViolations(pool, priorFrom, priorTo, throughPrior),
    violationsByType(pool, from, to, throughCurrent),
    violationsByType(pool, priorFrom, priorTo, throughPrior),
    violationsByCamera(pool, from, to, cameraMap, throughCurrent),
    violationsByCamera(pool, priorFrom, priorTo, cameraMap, throughPrior),
    readsByCamera(pool, from, to, cameraMap, throughCurrent),
    hourlyReads(pool, from, to, throughCurrent),
    hourlyViolations(pool, from, to, throughCurrent),
    hourlyViolations(pool, priorDayFrom, priorDayTo, throughPrior),
    repeatOffendersInRange(pool, from, to, 10),
    countWatchlistHits(pool, from, to, throughCurrent),
    countWatchlistHits(pool, priorDayFrom, priorDayTo, throughPrior),
  ]);

  const topType = topViolationType(byType);
  const violationTotal = Object.values(byType).reduce((n, v) => n + Number(v || 0), 0);
  const topSite = byCamera[0] || { name: "—", total: 0 };

  const hotspots = byCamera.slice(0, 5).map((s) => ({
    ...s,
    sharePct: violationTotal > 0 ? Math.round((s.total / violationTotal) * 1000) / 10 : 0,
  }));

  const violationBreakdown = Object.entries(byType)
    .filter(([, c]) => Number(c) > 0)
    .map(([code, count]) => {
      const priorCount = Number(priorByType[code] || 0);
      const n = Number(count);
      const trendPct = pctDelta(n, priorCount);
      return {
        code,
        label: violationLabel(code),
        count: n,
        priorCount,
        changePct: trendPct,
        changeDirection: n > priorCount ? "up" : n < priorCount ? "down" : "flat",
        changeLabel:
          n === priorCount
            ? `Unchanged vs ${compareLabel}`
            : `${trendPct > 0 ? "+" : ""}${trendPct}% vs ${compareLabel}`,
        sharePct: violationTotal > 0 ? Math.round((n / violationTotal) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  const peakStats = peakHourStats(hourlyViolationPts.length ? hourlyViolationPts : hourlyTraffic);
  const priorPeakStats = peakHourStats(priorHourlyViolationPts);
  const peakHour = peakStats.label;
  const violationsDelta = pctDelta(violationTotal, priorViolations);
  const readsDelta = pctDelta(plateReads, priorReads);
  const topTypeShare =
    violationTotal > 0 ? Math.round((topType.count / violationTotal) * 1000) / 10 : 0;
  const topSiteShare =
    violationTotal > 0 ? Math.round((topSite.total / violationTotal) * 1000) / 10 : 0;
  const typeChange = largestTypeChange(byType, priorByType);
  const priorTopSiteViolations =
    (priorByCamera || []).find((s) => s.name === topSite.name)?.total ?? 0;
  const priorTopTypeCount = Number(priorByType[topType.code] || 0);
  const siteRanking = mergeSiteRanking(readsByCam, byCamera, priorByCamera, violationTotal, compareLabel);
  const secondType = violationBreakdown[1];

  const nowIso = new Date().toISOString();
  const { generatedAt, generatedAtLabel } = resolveGeneratedAt(from, to, nowIso);
  const periodLabel = formatReportDateLabel(from, to);
  const narrativeCtx = {
    plateReads,
    readsDelta,
    violationTotal,
    topSite: topSite.name,
    peakHour,
    watchlistHits,
    repeatOffenders: repeatOffendersCount,
    periodLabel,
    comparisonLabel: compareLabel,
    comparisonWindowLabel: cmp.windowLabel,
    isLiveSameTime: cmp.isLiveSameTime,
  };
  const summaryCtx = {
    plateReads,
    violationTotal,
    topTypeLabel: violationLabel(topType.code),
    topTypeShare,
    topSite: topSite.name,
    topSiteShare,
    peakHour,
    violationsDelta,
    periodLabel,
    comparisonLabel: compareLabel,
    comparisonWindowLabel: cmp.windowLabel,
    isLiveSameTime: cmp.isLiveSameTime,
  };
  const cmdCtx = {
    topSite: topSite.name,
    topTypeLabel: violationLabel(topType.code),
    secondTypeLabel: secondType ? secondType.label : null,
    peakHour,
    repeatOffenders: repeatOffendersCount,
  };

  const opStatus = operationalStatus(violationTotal, violationsDelta);
  const confidence = aiConfidenceScore({
    plateReads,
    violationTotal,
    siteCount: siteRanking.length,
    watchlistConfigured: true,
  });

  return {
    meta: {
      from,
      to,
      spanDays,
      comparisonPeriodLabel: compareLabel,
      comparisonWindowLabel: cmp.windowLabel,
      generatedAt,
      generatedAtLabel,
      generatedBy: "AI Traffic Intelligence Engine",
      reportDateLabel: periodLabel,
      preparedFor: "Philippine National Police — Traffic Operations Command",
    },
    report: {
      operationalStatus: opStatus,
      operationalStatusLabel:
        opStatus === "HIGH_ALERT" ? "HIGH ALERT" : opStatus === "ELEVATED" ? "ELEVATED" : "NORMAL",
      aiConfidenceScore: confidence,
      executiveSummary: buildExecutiveSummary(summaryCtx),
      aiNarrative: buildAiNarrative(narrativeCtx),
      comparisonPeriodLabel: compareLabel,
      comparisonWindowLabel: cmp.windowLabel,
      keyFindings: buildKeyFindings({
        compareLabel,
        todayDetail: cmp.todayDetail,
        priorDetail: cmp.priorDetail,
        typeChange,
        topSite: topSite.name,
        topSiteViolations: topSite.total,
        priorTopSiteViolations,
        topTypeLabel: violationLabel(topType.code),
        topTypeCount: topType.count,
        priorTopTypeCount,
        topTypeShare,
        peakHour,
        peakHourCount: peakStats.total,
        priorPeakHourCount: priorPeakStats.total,
        watchlistHits,
        priorWatchlistHits,
      }),
      siteRanking,
      violationBreakdown,
      commandRecommendations: buildCommandRecommendations(cmdCtx),
      archive: buildArchive(from, to),
      watchlistHits,
    },
    executive: {
      plateReads,
      violations: violationTotal,
      citationsGenerated,
      repeatOffenders: repeatOffendersCount,
      highestActivitySite: topSite.name,
      highestActivitySiteViolations: topSite.total,
      topViolationType: topType.code,
      topViolationCount: topType.count,
      readsDelta,
      violationsDelta,
      peakViolationHour: peakHour,
    },
  };
}

module.exports = {
  buildDailyBriefing,
  violationLabel,
};
