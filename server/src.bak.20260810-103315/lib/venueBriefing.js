const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { SITE_TIMEZONE, ymdSite, ymdSiteAddDays } = require("../siteTimeZone");
// crowdCameraMap/walkinCameraMap are no longer imported: they name cameras in
// the legacy `crowds`/`walkins` tables, which nothing writes to. Camera names
// now come from the detection rows themselves.
const { SITE_BRANDING } = require("../config/lang");

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Daily briefing for a hospitality venue.
 *
 * Returns { meta, report, executive } - the shape the briefing page, the PDF
 * export and the email endpoint consume.
 *
 * WHERE THE NUMBERS COME FROM
 * ---------------------------
 * Every figure is read from the live inference tables: walk-ins from
 * `walkin_detection`, and alerts from the `inference_timeline` view that the
 * Monitoring pages, Active Alerts and the dashboard all read. That matters for
 * two reasons.
 *
 * First, correctness. This file previously queried `walkins` and `crowds`,
 * which are legacy ANPR-era tables with NO writer in this deployment - nothing
 * inserts into either of them. Every count therefore came back zero, which is
 * why the page appeared to have no data connection at all. The tables still
 * exist, so the queries succeeded and returned 0 rather than erroring, and the
 * failure was silent.
 *
 * Second, consistency. Reading the same view as every other page means a
 * briefing figure can never disagree with the Monitoring page it summarises,
 * and a detection marked as a false positive drops out of both together.
 *
 * TIMEZONE: the live tables are TIMESTAMPTZ. The legacy ones stored naive site
 * time, so the old queries compared `trigger_date::date` directly. That is
 * wrong here - a from/to pair means an IST calendar day, so the range is
 * converted explicitly (see siteRange).
 */

// The alert modules, in the order the report presents them. These are the live
// service keys used by inference_timeline and MODULES in routes/inference.js,
// NOT the legacy crowds.alert_type taxonomy this file used to carry - only one
// of those five codes ('intrusion') even overlapped a real module.
//
// Walk-ins are deliberately absent: they are footfall, counted separately as
// "entries", and folding them in would inflate every alert figure in the brief.
const ALERT_TYPES = [
  { code: "intrusion", label: "Intrusion", short: "Intrusion" },
  { code: "loitering", label: "Loitering", short: "Loitering" },
  { code: "after_hours", label: "After Hours", short: "After Hours" },
  { code: "kitchen_unattended", label: "Kitchen Unattended", short: "Unattended" },
  { code: "chef_absence", label: "Chef Absence", short: "Chef Absence" },
];

// "Kitchen left uncovered" spans both modules that detect it: the original
// kitchen_unattended service and chef_absence, which is the one actually
// writing data at this site. Counting only the former reported zero while the
// cameras were recording 151 incidents.
const UNATTENDED_KITCHEN_CODES = ["kitchen_unattended", "chef_absence"];

/**
 * Range predicate for a TIMESTAMPTZ column.
 *
 * `from`/`to` are IST calendar days and `through` is an IST wall-clock instant
 * used to clip "so far today" comparisons to the same time yesterday.
 *
 * THE ::timestamp CAST IS LOAD-BEARING. `AT TIME ZONE` has two overloads, and a
 * bare `date` picks the wrong one: date is preferentially cast to timestamptz,
 * so `'2026-08-06'::date AT TIME ZONE 'Asia/Kolkata'` resolves to
 * timezone(text, timestamptz) and returns a LOCAL timestamp that depends on the
 * session's TimeZone. This database runs UTC, which made that bound mean
 * 11:00 IST instead of midnight - every range was shifted 11 hours. Casting to
 * timestamp first selects timezone(text, timestamp) -> timestamptz, which is an
 * absolute instant and independent of the session.
 */
function siteRange(col, from, to, through) {
  const parts = [
    `${col} >= (?::date::timestamp AT TIME ZONE '${SITE_TIMEZONE}')`,
    `${col} <  ((?::date + 1)::timestamp AT TIME ZONE '${SITE_TIMEZONE}')`,
  ];
  const params = [from, to];
  if (through) {
    parts.push(`${col} <= (?::timestamp AT TIME ZONE '${SITE_TIMEZONE}')`);
    params.push(through);
  }
  return { sql: parts.join(" AND "), params };
}

/** Suppress detections a human marked as a false positive, as every page does. */
const NOT_FP_TIMELINE = `NOT EXISTS (SELECT 1 FROM false_positive_detection f
                                      WHERE f.module = t.service AND f.detection_id = t.id)`;

/** Only the alert services - the timeline also carries walk-ins. */
const ALERT_SERVICES_SQL = `t.service IN (${ALERT_TYPES.map((t) => `'${t.code}'`).join(",")})`;

function alertLabel(code) {
  return ALERT_TYPES.find((t) => t.code === code)?.label ?? String(code || "").replace(/_/g, " ");
}

function alertShortLabel(code) {
  return ALERT_TYPES.find((t) => t.code === code)?.short ?? alertLabel(code);
}

function hour12(h) {
  const x = ((Number(h) % 24) + 24) % 24;
  return { n: x % 12 === 0 ? 12 : x % 12, period: x < 12 ? "AM" : "PM" };
}

/**
 * Names an hour bucket as a range on the 12-hour clock — "8 – 9 AM",
 * "11 AM – 12 PM", "11 PM – 12 AM".
 *
 * The rest of the app labels these buckets by their end time alone ("09:00"),
 * which reads as a single instant and hides whether it means 9 in the morning
 * or the evening. Spelling out both ends with AM/PM removes both problems.
 */
function hourRangeLabel(hour) {
  const a = hour12(hour);
  const b = hour12(Number(hour) + 1);
  return a.period === b.period
    ? `${a.n} – ${b.n} ${a.period}`
    : `${a.n} ${a.period} – ${b.n} ${b.period}`;
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

function siteNow() {
  return dayjs().tz(SITE_TIMEZONE);
}

/**
 * When the report covers today, both sides of every comparison are clipped to
 * the current clock time so "vs yesterday" stays like-for-like.
 */
function buildComparisonWindow(from, to) {
  const single = from === to;
  if (!(single && to === ymdSite())) {
    return {
      isLiveSameTime: false,
      throughCurrent: null,
      throughPrior: null,
      compareLabel: single ? "yesterday" : "the previous period",
      // Chips read "vs <compareLabel>" telegraphically; full sentences read
      // "... than <proseCompare>", so they need a phrase that stands alone.
      proseCompare: single ? "yesterday" : "the previous period",
      windowLabel: null,
      currentDetail: single ? "on this day" : "this period",
      priorDetail: single ? "yesterday" : "previous period",
    };
  }
  const now = siteNow();
  const windowLabel = `${now.startOf("day").format("h:mm A")} – ${now.format("h:mm A")}`;
  return {
    isLiveSameTime: true,
    throughCurrent: now.format("YYYY-MM-DD HH:mm:ss"),
    throughPrior: now.subtract(1, "day").format("YYYY-MM-DD HH:mm:ss"),
    compareLabel: "same time yesterday",
    proseCompare: "yesterday at this time",
    windowLabel,
    currentDetail: "so far today",
    priorDetail: "yesterday to this hour",
  };
}

async function countWalkins(pool, from, to, through) {
  const r = siteRange("d.detected_at", from, to, through);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n FROM walkin_detection d
      WHERE ${r.sql}
        AND NOT EXISTS (SELECT 1 FROM false_positive_detection f
                         WHERE f.module = 'walkins' AND f.detection_id = d.id)`,
    r.params
  );
  return Number(row?.n || 0);
}

async function countAlerts(pool, from, to, through, codes = null) {
  const r = siteRange("t.occurred_at", from, to, through);
  const codeSql = codes?.length
    ? ` AND t.service IN (${codes.map(() => "?").join(",")})`
    : ` AND ${ALERT_SERVICES_SQL}`;
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n FROM inference_timeline t
      WHERE ${r.sql} AND ${NOT_FP_TIMELINE} ${codeSql}`,
    [...r.params, ...(codes || [])]
  );
  return Number(row?.n || 0);
}

/**
 * Alerts split by service AND by hour in one pass.
 *
 * The report needs both breakdowns over the same rows, and running two queries
 * invited them to disagree if a detection landed between them.
 */
async function alertsByServiceAndHour(pool, from, to, through) {
  const r = siteRange("t.occurred_at", from, to, through);
  const [rows] = await pool.query(
    `SELECT t.service,
            EXTRACT(HOUR FROM t.occurred_at AT TIME ZONE '${SITE_TIMEZONE}')::int AS h,
            COUNT(*) AS n
       FROM inference_timeline t
      WHERE ${r.sql} AND ${NOT_FP_TIMELINE} AND ${ALERT_SERVICES_SQL}
      GROUP BY 1, 2`,
    r.params
  );

  const byType = {};
  for (const t of ALERT_TYPES) byType[t.code] = 0;
  // Per-service hour buckets, so each module section can name its own peak
  // instead of repeating the all-services peak five times.
  const hoursByType = {};
  for (const t of ALERT_TYPES) hoursByType[t.code] = new Map();
  const hours = new Map();
  for (const row of rows || []) {
    const code = String(row.service || "");
    const n = Number(row.n || 0);
    const h = Number(row.h);
    if (code in byType) {
      byType[code] += n;
      hoursByType[code].set(h, (hoursByType[code].get(h) || 0) + n);
    }
    hours.set(h, (hours.get(h) || 0) + n);
  }
  const spread = (m) => Array.from({ length: 24 }, (_, hour) => ({ hour, total: m.get(hour) || 0 }));
  const hourlyByType = {};
  for (const t of ALERT_TYPES) hourlyByType[t.code] = spread(hoursByType[t.code]);
  return { byType, hourlyByType, hourly: spread(hours) };
}

/**
 * Alerts split by service AND camera.
 *
 * Feeds the "busiest camera" line in each module's section of the report.
 * groupByCamera answers the same question for ALL alerts at once, which cannot
 * tell you which camera drove any single module.
 */
async function alertsByServiceAndCamera(pool, from, to, through) {
  const r = siteRange("t.occurred_at", from, to, through);
  const [rows] = await pool.query(
    `SELECT t.service, t.camera_key, COUNT(*) AS n
       FROM inference_timeline t
      WHERE ${r.sql} AND ${NOT_FP_TIMELINE} AND ${ALERT_SERVICES_SQL}
        AND t.camera_key IS NOT NULL
      GROUP BY 1, 2 ORDER BY n DESC`,
    r.params
  );
  const top = {};
  for (const row of rows || []) {
    const code = String(row.service || "");
    // Rows arrive count-descending, so the first hit per service is its busiest.
    if (!top[code]) top[code] = { camera: String(row.camera_key || "").trim(), total: Number(row.n || 0) };
  }
  return top;
}

/**
 * Busiest areas, by camera.
 *
 * `scope` is "alerts" or "walkins". Camera names come straight from the
 * detection rows: inference_camera.display_name is never populated by any
 * writer, so joining it would replace real camera keys with blanks.
 */
async function groupByCamera(pool, scope, from, to, through) {
  const r = siteRange("t.occurred_at", from, to, through);
  const scopeSql = scope === "walkins" ? `t.service = 'walkins'` : ALERT_SERVICES_SQL;
  const [rows] = await pool.query(
    `SELECT t.camera_key, COUNT(*) AS n
       FROM inference_timeline t
      WHERE ${r.sql} AND ${NOT_FP_TIMELINE} AND ${scopeSql}
        AND t.camera_key IS NOT NULL
      GROUP BY 1 ORDER BY n DESC`,
    r.params
  );
  return (rows || []).map((row) => {
    const id = String(row.camera_key || "").trim();
    return { cameraId: id, name: id, total: Number(row.n || 0) };
  });
}

/**
 * Gender split is not available. walkin_detection records garment and colour,
 * not gender, and no detector in this deployment emits it. Kept returning the
 * zeroed shape because the response type is shared with the PDF export; no UI
 * renders it, and none should until a detector supplies it.
 */
async function walkinsByGender() {
  return { male: 0, female: 0, unknown: 0 };
}

async function peakWalkinHour(pool, from, to, through) {
  const r = siteRange("d.detected_at", from, to, through);
  const [rows] = await pool.query(
    `SELECT EXTRACT(HOUR FROM d.detected_at AT TIME ZONE '${SITE_TIMEZONE}')::int AS h,
            COUNT(*) AS n
       FROM walkin_detection d
      WHERE ${r.sql}
        AND NOT EXISTS (SELECT 1 FROM false_positive_detection f
                         WHERE f.module = 'walkins' AND f.detection_id = d.id)
      GROUP BY h ORDER BY n DESC, h ASC LIMIT 1`,
    r.params
  );
  const row = (rows || [])[0];
  if (!row) return { hour: null, total: 0, label: "—" };
  const hour = Number(row.h);
  return { hour, total: Number(row.n || 0), label: hourRangeLabel(hour) };
}

function peakFrom(hourly) {
  let best = { hour: null, total: 0 };
  for (const slot of hourly) {
    if (slot.total > best.total) best = { hour: slot.hour, total: slot.total };
  }
  if (best.hour == null) return { hour: null, total: 0, label: "—" };
  return { ...best, label: hourRangeLabel(best.hour) };
}

function topAlertType(byType) {
  let best = { code: null, count: 0 };
  for (const t of ALERT_TYPES) {
    const n = Number(byType[t.code] || 0);
    if (n > best.count) best = { code: t.code, count: n };
  }
  return best;
}

/** Shared change fields so every card and row renders its trend the same way. */
function changeFields(current, prior, compareLabel) {
  const c = Number(current || 0);
  const p = Number(prior || 0);
  const delta = pctDelta(c, p);
  return {
    changeDirection: c > p ? "up" : c < p ? "down" : "flat",
    changePct: delta,
    changeLabel:
      c === p ? `Unchanged vs ${compareLabel}` : `${delta > 0 ? "+" : ""}${delta}% vs ${compareLabel}`,
    currentValue: c,
    priorValue: p,
  };
}

function formatReportDateLabel(from, to) {
  const long = (ymd) => dayjs.tz(ymd, "YYYY-MM-DD", SITE_TIMEZONE).format("D MMMM YYYY (dddd)");
  if (from === to) return long(from);
  const short = (ymd) => dayjs.tz(ymd, "YYYY-MM-DD", SITE_TIMEZONE).format("D MMM YYYY");
  return `${short(from)} – ${short(to)}`;
}

/**
 * When the report was generated - always now.
 *
 * This used to stamp 11:59 PM on the last day of the range for any period that
 * was not today, which put a fabricated time under a heading that reads
 * "Generated At". The label carries the date too, because the page renders it
 * standalone next to the (different) reporting period.
 */
function resolveGeneratedAt() {
  const stamp = siteNow();
  return { generatedAt: stamp.toISOString(), generatedAtLabel: stamp.format("D MMM, h:mm A") };
}

function buildArchive(from, to, generatedAtLabel) {
  const span = Math.max(1, daysInclusive(from, to));
  const reportType = span === 1 ? "Daily Venue Brief" : `${span}-Day Venue Brief`;
  const rows = [
    { from, to, dateLabel: formatReportDateLabel(from, to), reportType, generatedAtLabel, isCurrent: true },
  ];
  for (let i = 1; i <= 4; i += 1) {
    const aFrom = ymdSiteAddDays(from, -(span * i));
    const aTo = ymdSiteAddDays(to, -(span * i));
    rows.push({
      from: aFrom,
      to: aTo,
      dateLabel: formatReportDateLabel(aFrom, aTo),
      reportType,
      generatedAtLabel: null,
      isCurrent: false,
    });
  }
  return rows;
}

/**
 * Overall posture for the period.
 *
 * The percentage terms are gated on a minimum absolute volume. pctDelta returns
 * a flat 100 whenever the previous period was zero, so without the gate a
 * single alert after a quiet day scored 100 and rendered a red "HIGH ALERT"
 * banner over a summary reading "1 AI alert was raised". That branch was dead
 * while the briefing read the empty legacy tables and every count was zero; it
 * became reachable the moment it started reading live data.
 */
const DELTA_MIN_VOLUME = 10;

function operationalStatus(alerts, alertsDelta, unattendedKitchen) {
  const deltaCounts = alerts >= DELTA_MIN_VOLUME;
  if (alerts >= 30 || (deltaCounts && alertsDelta >= 50) || unattendedKitchen >= 10) return "HIGH_ALERT";
  if (alerts >= 12 || (deltaCounts && alertsDelta >= 20) || unattendedKitchen >= 3) return "ELEVATED";
  return "NORMAL";
}

function confidenceScore({ walkins, alerts, areaCount }) {
  let score = 55;
  if (walkins > 0) score += 15;
  if (walkins >= 50) score += 5;
  if (alerts > 0) score += 12;
  if (areaCount > 0) score += 8;
  if (areaCount > 1) score += 5;
  return Math.min(97, score);
}

function riskLevel(alerts) {
  if (alerts >= 20) return "High";
  if (alerts >= 8) return "Medium";
  return "Low";
}

/**
 * The entrance camera counts every person who walks in — customers, staff,
 * delivery riders and vendors alike — so the copy says "entries" and never
 * "guests" or "footfall", which would claim more than the data supports.
 */
function buildExecutiveSummary(ctx) {
  const {
    periodLabel,
    isSingleDay,
    walkins,
    walkinsDelta,
    alerts,
    topTypeLabel,
    topTypeShare,
    busiestArea,
    peakWalkinLabel,
    unattendedKitchen,
    proseCompare,
    windowLabel,
    isLiveSameTime,
  } = ctx;

  const parts = [
    `${isSingleDay ? "On" : "Over"} ${periodLabel}, ${walkins.toLocaleString()} entr${
      walkins === 1 ? "y was" : "ies were"
    } recorded at the entrance and ${alerts.toLocaleString()} AI alert${
      alerts === 1 ? " was" : "s were"
    } raised.`,
  ];

  if (walkins > 0) {
    parts.push(
      `Entries are ${
        walkinsDelta === 0
          ? `the same as ${proseCompare}`
          : `${Math.abs(walkinsDelta)}% ${walkinsDelta > 0 ? "higher" : "lower"} than ${proseCompare}`
      }.`
    );
    parts.push(`The busiest hour was ${peakWalkinLabel}.`);
  }
  // No "else" branch: the opening sentence already reports zero entries, so a
  // second sentence saying the same thing only pads the summary.

  parts.push(
    alerts > 0
      ? `${topTypeLabel} was the most common alert at ${topTypeShare}% of the total${
          busiestArea ? `, mostly in the ${busiestArea}` : ""
        }.`
      : "No alerts were raised, and every monitored area stayed clear."
  );

  parts.push(
    unattendedKitchen > 0
      ? `The kitchen area was left unattended ${unattendedKitchen} time${
          unattendedKitchen === 1 ? "" : "s"
        }, which is worth checking against the staff roster.`
      : "The kitchen area was staffed the whole time, with no unattended periods."
  );

  if (isLiveSameTime && windowLabel) {
    parts.push(`Every comparison uses the same clock window on both days (${windowLabel}).`);
  }

  return parts.join(" ");
}

function buildAiNarrative(ctx) {
  const { walkins, walkinsDelta, alerts, busiestArea, peakWalkinLabel, unattendedKitchen, proseCompare, quietAreas } = ctx;
  const bits = [
    `${walkins.toLocaleString()} ${walkins === 1 ? "person" : "people"} walked in through the entrance and ${alerts.toLocaleString()} alert${
      alerts === 1 ? " was" : "s were"
    } raised.`,
  ];
  if (walkins > 0) {
    bits.push(
      `The busiest hour was ${peakWalkinLabel}, which was ${
        walkinsDelta === 0 ? "the same as" : walkinsDelta > 0 ? "busier than" : "quieter than"
      } ${proseCompare}.`
    );
  }
  if (busiestArea) bits.push(`The ${busiestArea} had more alerts than any other monitored area.`);
  if (quietAreas?.length) bits.push(`The ${quietAreas.join(" and the ")} stayed clear the whole time.`);
  bits.push(
    unattendedKitchen > 0
      ? `The kitchen area was empty ${unattendedKitchen} time${
          unattendedKitchen === 1 ? "" : "s"
        }, so please check those times against the break cover.`
      : "The kitchen area was never left unattended."
  );
  return bits.join(" ");
}

function buildKeyFindings(ctx) {
  const {
    compareLabel,
    currentDetail,
    priorDetail,
    walkins,
    priorWalkins,
    alerts,
    priorAlerts,
    topType,
    priorTopTypeCount,
    topTypeShare,
    peakAlert,
    priorPeakAlertCount,
    unattendedKitchen,
    priorUnattendedKitchen,
  } = ctx;

  // Every number carries its unit — a bare "12 · 9" leaves the reader guessing
  // what is being counted.
  const unit = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const pair = (c, p, one, many) =>
    `${unit(c, one, many)} ${currentDetail} · ${unit(p, one, many)} ${priorDetail}`;

  return [
    {
      id: "footfall",
      title: "Entries",
      value: walkins.toLocaleString(),
      detail: pair(walkins, priorWalkins, "entry", "entries"),
      badge: walkins > priorWalkins ? "Growing" : walkins === priorWalkins ? "Steady" : "Softening",
      badgeTone: walkins >= priorWalkins ? "success" : "warning",
      ...changeFields(walkins, priorWalkins, compareLabel),
    },
    {
      id: "alerts",
      title: "Alert Volume",
      value: alerts.toLocaleString(),
      detail: pair(alerts, priorAlerts, "alert", "alerts"),
      badge: alerts > priorAlerts ? "Rising" : alerts === priorAlerts ? "Stable" : "Easing",
      badgeTone: alerts > priorAlerts ? "danger" : alerts === priorAlerts ? "neutral" : "success",
      ...changeFields(alerts, priorAlerts, compareLabel),
    },
    {
      id: "top-alert",
      title: "Most Common Alert",
      value: topType.code ? alertShortLabel(topType.code) : "None",
      detail: topType.code
        ? `${topType.count} of ${alerts} alerts (${topTypeShare}%) ${currentDetail}`
        : `No alerts raised ${currentDetail}`,
      badge: topType.code ? "Primary Driver" : "All Clear",
      badgeTone: topType.code ? "info" : "success",
      ...changeFields(topType.count, priorTopTypeCount, compareLabel),
    },
    {
      id: "peak-hour",
      title: "Busiest Alert Hour",
      value: peakAlert.label,
      detail:
        peakAlert.total > 0
          ? `${unit(peakAlert.total, "alert", "alerts")} in the peak hour ${currentDetail} · ${unit(
              priorPeakAlertCount,
              "alert",
              "alerts"
            )} ${priorDetail}`
          : `No alerts raised ${currentDetail}`,
      badge: peakAlert.total > 0 ? "Peak Window" : "All Clear",
      badgeTone: peakAlert.total > 0 ? "warning" : "success",
      ...changeFields(peakAlert.total, priorPeakAlertCount, compareLabel),
    },
    {
      id: "kitchen",
      // "Kitchen Coverage: 9" read as if 9 were a good number; the value is a
      // count of failures, so the title names the failure.
      title: "Kitchen Unattended",
      value: unattendedKitchen.toLocaleString(),
      detail:
        unattendedKitchen > 0
          ? `${unit(unattendedKitchen, "time", "times")} unattended ${currentDetail} · ${unit(
              priorUnattendedKitchen,
              "time",
              "times"
            )} ${priorDetail}`
          : `Fully covered ${currentDetail}`,
      badge: unattendedKitchen > 0 ? "Needs Review" : "Fully Covered",
      badgeTone: unattendedKitchen > 0 ? "danger" : "success",
      ...changeFields(unattendedKitchen, priorUnattendedKitchen, compareLabel),
    },
  ];
}

function buildRecommendations(ctx) {
  const { busiestArea, topTypeLabel, peakWalkinLabel, peakAlertLabel, unattendedKitchen, alerts, walkinsDelta } = ctx;
  const out = [];

  if (peakWalkinLabel !== "—") {
    out.push({
      label: "HIGH",
      tone: "danger",
      title: "Staff the busiest hour",
      body: `Most entries happen during ${peakWalkinLabel}. Have the full front-of-house team on the floor before that hour starts.`,
    });
  }
  if (unattendedKitchen > 0) {
    out.push({
      label: "HIGH",
      tone: "danger",
      title: "Close the kitchen gaps",
      body: `The kitchen area was left unattended ${unattendedKitchen} time${
        unattendedKitchen === 1 ? "" : "s"
      }. Match those times against the roster and adjust the break cover.`,
    });
  }
  if (alerts > 0 && busiestArea) {
    out.push({
      label: "MEDIUM",
      tone: "warning",
      title: `Walk the ${busiestArea}`,
      body: `The ${busiestArea} had the most alerts in this period, mostly ${topTypeLabel.toLowerCase()}. Check that the camera view is not blocked and that access is controlled.`,
    });
  }
  if (peakAlertLabel !== "—") {
    out.push({
      label: "MEDIUM",
      tone: "warning",
      title: "Supervise the alert peak",
      body: `Most alerts happen during ${peakAlertLabel}. A supervisor check in that hour should reduce repeat detections.`,
    });
  }
  if (walkinsDelta <= -15) {
    out.push({
      label: "INFO",
      tone: "info",
      title: "Entries are dropping",
      body: `Entries are down ${Math.abs(walkinsDelta)}%. It is worth checking whether the cause is the weather, a local event, or a promotion that has ended.`,
    });
  }
  if (!out.length) {
    out.push({
      label: "LOW",
      tone: "success",
      title: "Hold the current routine",
      body: "Nothing in this period's entry or alert pattern needs action. Keep the existing staffing plan in place.",
    });
  }
  // Client keys recommendation cards off `priority`, so it must be unique.
  return out.slice(0, 4).map((r, i) => ({ ...r, priority: i + 1 }));
}

async function buildVenueBriefing(pool, from, to, user = null) {
  const spanDays = daysInclusive(from, to);
  const cmp = buildComparisonWindow(from, to);
  const { throughCurrent, throughPrior, compareLabel } = cmp;

  const priorTo = ymdSiteAddDays(from, -1);
  const priorFrom = from === to ? priorTo : ymdSiteAddDays(from, -spanDays);

  const [
    walkins,
    priorWalkins,
    alerts,
    priorAlerts,
    // One query each returns { byType, hourly } - the split-by-service and
    // split-by-hour views of the same rows, so they cannot disagree.
    current,
    prior,
    areaAlerts,
    priorAreaAlerts,
    areaWalkins,
    genderMix,
    walkinPeak,
    unattendedKitchen,
    priorUnattendedKitchen,
    topCameraByService,
  ] = await Promise.all([
    countWalkins(pool, from, to, throughCurrent),
    countWalkins(pool, priorFrom, priorTo, throughPrior),
    countAlerts(pool, from, to, throughCurrent),
    countAlerts(pool, priorFrom, priorTo, throughPrior),
    alertsByServiceAndHour(pool, from, to, throughCurrent),
    alertsByServiceAndHour(pool, priorFrom, priorTo, throughPrior),
    groupByCamera(pool, "alerts", from, to, throughCurrent),
    groupByCamera(pool, "alerts", priorFrom, priorTo, throughPrior),
    groupByCamera(pool, "walkins", from, to, throughCurrent),
    walkinsByGender(),
    peakWalkinHour(pool, from, to, throughCurrent),
    countAlerts(pool, from, to, throughCurrent, UNATTENDED_KITCHEN_CODES),
    countAlerts(pool, priorFrom, priorTo, throughPrior, UNATTENDED_KITCHEN_CODES),
    alertsByServiceAndCamera(pool, from, to, throughCurrent),
  ]);

  const byType = current.byType;
  const priorByType = prior.byType;
  const hourly = current.hourly;
  const priorHourly = prior.hourly;

  const topType = topAlertType(byType);
  const topTypeShare = alerts > 0 ? Math.round((topType.count / alerts) * 1000) / 10 : 0;
  const peakAlert = peakFrom(hourly);
  const priorPeak = peakFrom(priorHourly);
  const busiestArea = areaAlerts[0]?.name ?? null;
  const alertsDelta = pctDelta(alerts, priorAlerts);
  const walkinsDelta = pctDelta(walkins, priorWalkins);

  // EVERY alert type, including the ones that recorded nothing.
  //
  // This used to filter to `count > 0`, which silently dropped quiet modules
  // from the brief. A reader could not tell "After Hours saw no events" apart
  // from "After Hours was not monitored" - and a module that stops reporting
  // because its detector died looks identical to one with a clean day. The
  // zeros are the finding, so they are stated.
  //
  // Ordering is busiest first, with the declared ALERT_TYPES order breaking ties
  // so the block of zeros at the end keeps a stable, predictable sequence.
  const typeOrder = new Map(ALERT_TYPES.map((t, i) => [t.code, i]));
  const alertBreakdown = ALERT_TYPES
    .map((t) => {
      const count = Number(byType[t.code] || 0);
      const priorCount = Number(priorByType[t.code] || 0);
      return {
        code: t.code,
        label: t.label,
        count,
        priorCount,
        hasData: count > 0,
        sharePct: alerts > 0 ? Math.round((count / alerts) * 1000) / 10 : 0,
        ...changeFields(count, priorCount, compareLabel),
      };
    })
    .sort((a, b) => b.count - a.count || typeOrder.get(a.code) - typeOrder.get(b.code));

  /**
   * One section per monitoring type the venue runs - all five, always.
   *
   * The brief previously described only the alert modules that happened to fire,
   * so a reader had no way to see the shape of the whole system. Each entry
   * carries the figures that mean something for THAT module rather than a
   * uniform row: walk-ins report footfall and its busiest hour, the kitchen
   * pair reports uncovered-station incidents, and the three security modules
   * report event counts with their share of the alert total. A module with
   * nothing to report says so explicitly.
   *
   * Kitchen Unattended and Chef Absence are ONE section: they are two detectors
   * answering the same operational question, and only the second writes data at
   * this site. Listing them apart would show a permanent zero next to the real
   * figure and read as a broken module.
   */
  const NO_EVENTS = "No events recorded for this period.";

  const kitchenHourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: UNATTENDED_KITCHEN_CODES.reduce(
      (a, code) => a + Number(current.hourlyByType[code]?.[hour]?.total || 0),
      0
    ),
  }));
  const kitchenCamera = UNATTENDED_KITCHEN_CODES
    .map((code) => topCameraByService[code])
    .filter(Boolean)
    .sort((a, b) => b.total - a.total)[0] || null;

  /** Shared shape so every section lines up in the UI and the PDF. */
  const moduleSection = (key, label, count, priorCount, hourlyBuckets, camera, extra) => {
    const peak = peakFrom(hourlyBuckets);
    return {
      key,
      label,
      count,
      priorCount,
      hasData: count > 0,
      sharePct: alerts > 0 ? Math.round((count / alerts) * 1000) / 10 : 0,
      peakLabel: peak.hour == null ? null : peak.label,
      peakCount: peak.total,
      topCamera: camera?.camera || camera?.name || null,
      topCameraCount: camera?.total ?? 0,
      ...changeFields(count, priorCount, compareLabel),
      ...extra,
    };
  };

  const moduleBreakdown = [
    moduleSection(
      "walkins", "Walk-ins", walkins, priorWalkins,
      // Walk-ins are counted from walkin_detection, which the alert hour buckets
      // do not cover, so its peak comes from its own query.
      walkinPeak.hour == null ? [] : [{ hour: walkinPeak.hour, total: walkinPeak.total }],
      areaWalkins[0] ? { camera: areaWalkins[0].name, total: areaWalkins[0].total } : null,
      {
        kind: "footfall",
        // Footfall is not an alert, so a share of the alert total is meaningless.
        sharePct: null,
        eventNoun: walkins === 1 ? "entry" : "entries",
        cameras: areaWalkins.length,
        summary: walkins > 0
          ? `${walkins.toLocaleString()} ${walkins === 1 ? "entry" : "entries"} across ${areaWalkins.length} camera${areaWalkins.length === 1 ? "" : "s"}, busiest ${walkinPeak.label}.`
          : NO_EVENTS,
      }
    ),
    moduleSection(
      "kitchen", "Kitchen Unattended / Chef Absence", unattendedKitchen, priorUnattendedKitchen,
      kitchenHourly, kitchenCamera,
      {
        kind: "alert",
        eventNoun: unattendedKitchen === 1 ? "incident" : "incidents",
        codes: UNATTENDED_KITCHEN_CODES,
        summary: unattendedKitchen > 0
          ? `${unattendedKitchen.toLocaleString()} cooking-station ${unattendedKitchen === 1 ? "incident" : "incidents"} where no chef was covering the line.`
          : NO_EVENTS,
      }
    ),
    ...[
      ["loitering", "Loitering", "people lingering past the dwell threshold"],
      ["intrusion", "Intrusion", "crossings into restricted areas"],
      ["after_hours", "After Hours", "presence detected outside business hours"],
    ].map(([code, label, phrase]) => {
      const count = Number(byType[code] || 0);
      return moduleSection(
        code, label, count, Number(priorByType[code] || 0),
        current.hourlyByType[code] || [], topCameraByService[code] || null,
        {
          kind: "alert",
          eventNoun: count === 1 ? "event" : "events",
          summary: count > 0
            ? `${count.toLocaleString()} ${count === 1 ? "event" : "events"} — ${phrase}.`
            : NO_EVENTS,
        }
      );
    }),
  ];

  // One row per monitored area, merging footfall and alert counts.
  const priorAreaMap = new Map(priorAreaAlerts.map((a) => [a.cameraId, a.total]));
  const walkinAreaMap = new Map(areaWalkins.map((a) => [a.cameraId, a.total]));
  const alertAreaMap = new Map(areaAlerts.map((a) => [a.cameraId, a.total]));
  const nameMap = new Map([...areaWalkins, ...areaAlerts].map((a) => [a.cameraId, a.name]));

  const areaRanking = [...nameMap.keys()]
    .map((id) => {
      const areaAlertTotal = alertAreaMap.get(id) ?? 0;
      const priorTotal = priorAreaMap.get(id) ?? 0;
      const change = changeFields(areaAlertTotal, priorTotal, compareLabel);
      return {
        name: nameMap.get(id) ?? id,
        cameraId: id,
        walkins: walkinAreaMap.get(id) ?? 0,
        alerts: areaAlertTotal,
        alertSharePct: alerts > 0 ? Math.round((areaAlertTotal / alerts) * 1000) / 10 : 0,
        riskLevel: riskLevel(areaAlertTotal),
        trend: change.changeDirection,
        trendPct: change.changePct,
        changeLabel: change.changeLabel,
      };
    })
    .sort((a, b) => b.alerts - a.alerts || b.walkins - a.walkins)
    .map((row, i) => ({ rank: i + 1, ...row }));

  const periodLabel = formatReportDateLabel(from, to);
  const { generatedAt, generatedAtLabel } = resolveGeneratedAt();
  const opStatus = operationalStatus(alerts, alertsDelta, unattendedKitchen);
  const topTypeLabel = topType.code ? alertLabel(topType.code) : "No alert type";

  return {
    meta: {
      from,
      to,
      spanDays,
      comparisonPeriodLabel: compareLabel,
      comparisonWindowLabel: cmp.windowLabel,
      generatedAt,
      generatedAtLabel,
      generatedBy: "AI Venue Intelligence Engine",
      reportDateLabel: periodLabel,
      // The person who asked for the report, not a fixed string. Falls back to
      // the venue name when the caller is the internal service key.
      preparedFor: user && user.email
        ? `${user.email}${user.role ? ` · ${user.role}` : ""}`
        : `${SITE_BRANDING.productName} — Venue Operations`,
    },
    report: {
      operationalStatus: opStatus,
      operationalStatusLabel:
        opStatus === "HIGH_ALERT" ? "HIGH ALERT" : opStatus === "ELEVATED" ? "ELEVATED" : "NORMAL",
      aiConfidenceScore: confidenceScore({ walkins, alerts, areaCount: areaRanking.length }),
      executiveSummary: buildExecutiveSummary({
        periodLabel,
        isSingleDay: from === to,
        walkins,
        walkinsDelta,
        alerts,
        topTypeLabel,
        topTypeShare,
        busiestArea,
        peakWalkinLabel: walkinPeak.label,
        unattendedKitchen,
        proseCompare: cmp.proseCompare,
        windowLabel: cmp.windowLabel,
        isLiveSameTime: cmp.isLiveSameTime,
      }),
      aiNarrative: buildAiNarrative({
        walkins,
        walkinsDelta,
        alerts,
        busiestArea,
        peakWalkinLabel: walkinPeak.label,
        unattendedKitchen,
        proseCompare: cmp.proseCompare,
        quietAreas: areaRanking.filter((a) => a.alerts === 0 && a.walkins > 0).map((a) => a.name),
      }),
      comparisonPeriodLabel: compareLabel,
      comparisonProseLabel: cmp.proseCompare,
      comparisonWindowLabel: cmp.windowLabel,
      keyFindings: buildKeyFindings({
        compareLabel,
        currentDetail: cmp.currentDetail,
        priorDetail: cmp.priorDetail,
        walkins,
        priorWalkins,
        alerts,
        priorAlerts,
        topType,
        priorTopTypeCount: Number(priorByType[topType.code] || 0),
        topTypeShare,
        peakAlert,
        priorPeakAlertCount: priorPeak.total,
        unattendedKitchen,
        priorUnattendedKitchen,
      }),
      areaRanking,
      alertBreakdown,
      moduleBreakdown,
      recommendations: buildRecommendations({
        busiestArea,
        topTypeLabel,
        peakWalkinLabel: walkinPeak.label,
        peakAlertLabel: peakAlert.label,
        unattendedKitchen,
        alerts,
        walkinsDelta,
      }),
      archive: buildArchive(from, to, generatedAtLabel),
      genderMix,
      totalAlerts: alerts,
      totalWalkins: walkins,
    },
    executive: {
      walkins,
      alerts,
      unattendedKitchen,
      busiestArea: busiestArea ?? "—",
      busiestAreaAlerts: areaAlerts[0]?.total ?? 0,
      topAlertType: topType.code,
      topAlertTypeLabel: topTypeLabel,
      topAlertCount: topType.count,
      walkinsDelta,
      alertsDelta,
      peakAlertHour: peakAlert.label,
      peakWalkinHour: walkinPeak.label,
    },
  };
}

module.exports = {
  buildVenueBriefing,
  alertLabel,
  alertShortLabel,
  ALERT_TYPES,
};
