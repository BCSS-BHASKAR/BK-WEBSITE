const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { SITE_TIMEZONE, ymdSite, ymdSiteAddDays } = require("../siteTimeZone");
const { crowdCameraMap, walkinCameraMap } = require("../config/reportFilters");
const { SITE_BRANDING } = require("../config/lang");

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Daily briefing for a hospitality venue.
 *
 * Reads guest footfall (`walkins`) and AI alerts (`crowds`) — the two things
 * this deployment actually monitors. Returns { meta, report, executive }, the
 * shape the briefing page, the PDF export and the email endpoint consume.
 *
 * Both tables store `trigger_date` already in site time, so no CONVERT_TZ is
 * needed here (unlike the vehicle tables the traffic briefing reads).
 */

// Keep in sync with CROWD_ALERT_TYPES in client/src/lib/crowdAlertTypes.ts.
const ALERT_TYPES = [
  { code: "intrusion", label: "Intrusion", short: "Intrusion" },
  { code: "unauthorized_access", label: "Unauthorized Access", short: "Unauthorized" },
  { code: "camera_tampering", label: "Camera Tampering", short: "Tampering" },
  { code: "unattended_kitchen", label: "Unattended Kitchen", short: "Unattended" },
  { code: "understaffed_kitchen", label: "Understaffed Kitchen", short: "Understaffed" },
];

// Kitchen coverage counts ONLY "no staff in the kitchen at all". Understaffed
// kitchen is a separate, less severe signal and is deliberately excluded, so
// this figure matches the Chef Presence module (ALERT_TYPE in
// client/src/pages/ChefPresencePage.tsx and CHEF_PRESENCE_ALERT_TYPE in
// client/src/pages/DashboardPage.tsx).
const UNATTENDED_KITCHEN_CODES = ["unattended_kitchen"];

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

function cap(through) {
  return through ? { sql: " AND trigger_date <= ? ", params: [through] } : { sql: "", params: [] };
}

async function countWalkins(pool, from, to, through) {
  const c = cap(through);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n FROM walkins WHERE DATE(trigger_date) BETWEEN ? AND ? ${c.sql}`,
    [from, to, ...c.params]
  );
  return Number(row?.n || 0);
}

async function countAlerts(pool, from, to, through, codes = null) {
  const c = cap(through);
  const codeSql = codes?.length ? ` AND alert_type IN (${codes.map(() => "?").join(",")}) ` : "";
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n FROM crowds WHERE DATE(trigger_date) BETWEEN ? AND ? ${c.sql} ${codeSql}`,
    [from, to, ...c.params, ...(codes || [])]
  );
  return Number(row?.n || 0);
}

async function alertsByType(pool, from, to, through) {
  const c = cap(through);
  const [rows] = await pool.query(
    `SELECT alert_type, COUNT(*) AS n FROM crowds
     WHERE DATE(trigger_date) BETWEEN ? AND ? ${c.sql}
     GROUP BY alert_type`,
    [from, to, ...c.params]
  );
  const out = {};
  for (const t of ALERT_TYPES) out[t.code] = 0;
  for (const r of rows || []) {
    const code = String(r.alert_type || "");
    if (code in out) out[code] = Number(r.n || 0);
  }
  return out;
}

async function hourlyAlerts(pool, from, to, through) {
  const c = cap(through);
  const [rows] = await pool.query(
    `SELECT HOUR(trigger_date) AS h, COUNT(*) AS n FROM crowds
     WHERE DATE(trigger_date) BETWEEN ? AND ? ${c.sql}
     GROUP BY h ORDER BY h ASC`,
    [from, to, ...c.params]
  );
  const map = new Map((rows || []).map((r) => [Number(r.h), Number(r.n || 0)]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, total: map.get(hour) || 0 }));
}

async function groupByCamera(pool, table, from, to, through) {
  const c = cap(through);
  const [rows] = await pool.query(
    `SELECT camera_id, COUNT(*) AS n FROM \`${table}\`
     WHERE DATE(trigger_date) BETWEEN ? AND ? ${c.sql}
     GROUP BY camera_id ORDER BY n DESC`,
    [from, to, ...c.params]
  );
  const names = { ...crowdCameraMap(), ...walkinCameraMap() };
  return (rows || []).map((r) => {
    const id = String(r.camera_id || "");
    return { cameraId: id, name: names[id] || id, total: Number(r.n || 0) };
  });
}

async function walkinsByGender(pool, from, to, through) {
  const c = cap(through);
  const [rows] = await pool.query(
    `SELECT gender, COUNT(*) AS n FROM walkins
     WHERE DATE(trigger_date) BETWEEN ? AND ? ${c.sql}
     GROUP BY gender`,
    [from, to, ...c.params]
  );
  const out = { male: 0, female: 0, unknown: 0 };
  for (const r of rows || []) {
    const g = String(r.gender || "");
    if (g in out) out[g] = Number(r.n || 0);
  }
  return out;
}

async function peakWalkinHour(pool, from, to, through) {
  const c = cap(through);
  const [rows] = await pool.query(
    `SELECT HOUR(trigger_date) AS h, COUNT(*) AS n FROM walkins
     WHERE DATE(trigger_date) BETWEEN ? AND ? ${c.sql}
     GROUP BY h ORDER BY n DESC, h ASC LIMIT 1`,
    [from, to, ...c.params]
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

function resolveGeneratedAt(from, to) {
  const isToday = from === to && to === ymdSite();
  const stamp = isToday ? siteNow() : dayjs.tz(to, "YYYY-MM-DD", SITE_TIMEZONE).endOf("day");
  return { generatedAt: stamp.toISOString(), generatedAtLabel: stamp.format("h:mm A") };
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

function operationalStatus(alerts, alertsDelta, unattendedKitchen) {
  if (alerts >= 30 || alertsDelta >= 50 || unattendedKitchen >= 10) return "HIGH_ALERT";
  if (alerts >= 12 || alertsDelta >= 20 || unattendedKitchen >= 3) return "ELEVATED";
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

async function buildVenueBriefing(pool, from, to) {
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
    byType,
    priorByType,
    hourly,
    priorHourly,
    areaAlerts,
    priorAreaAlerts,
    areaWalkins,
    genderMix,
    walkinPeak,
    unattendedKitchen,
    priorUnattendedKitchen,
  ] = await Promise.all([
    countWalkins(pool, from, to, throughCurrent),
    countWalkins(pool, priorFrom, priorTo, throughPrior),
    countAlerts(pool, from, to, throughCurrent),
    countAlerts(pool, priorFrom, priorTo, throughPrior),
    alertsByType(pool, from, to, throughCurrent),
    alertsByType(pool, priorFrom, priorTo, throughPrior),
    hourlyAlerts(pool, from, to, throughCurrent),
    hourlyAlerts(pool, priorFrom, priorTo, throughPrior),
    groupByCamera(pool, "crowds", from, to, throughCurrent),
    groupByCamera(pool, "crowds", priorFrom, priorTo, throughPrior),
    groupByCamera(pool, "walkins", from, to, throughCurrent),
    walkinsByGender(pool, from, to, throughCurrent),
    peakWalkinHour(pool, from, to, throughCurrent),
    countAlerts(pool, from, to, throughCurrent, UNATTENDED_KITCHEN_CODES),
    countAlerts(pool, priorFrom, priorTo, throughPrior, UNATTENDED_KITCHEN_CODES),
  ]);

  const topType = topAlertType(byType);
  const topTypeShare = alerts > 0 ? Math.round((topType.count / alerts) * 1000) / 10 : 0;
  const peakAlert = peakFrom(hourly);
  const priorPeak = peakFrom(priorHourly);
  const busiestArea = areaAlerts[0]?.name ?? null;
  const alertsDelta = pctDelta(alerts, priorAlerts);
  const walkinsDelta = pctDelta(walkins, priorWalkins);

  const alertBreakdown = ALERT_TYPES.filter((t) => Number(byType[t.code] || 0) > 0)
    .map((t) => {
      const count = Number(byType[t.code] || 0);
      const priorCount = Number(priorByType[t.code] || 0);
      return {
        code: t.code,
        label: t.label,
        count,
        priorCount,
        sharePct: alerts > 0 ? Math.round((count / alerts) * 1000) / 10 : 0,
        ...changeFields(count, priorCount, compareLabel),
      };
    })
    .sort((a, b) => b.count - a.count);

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
  const { generatedAt, generatedAtLabel } = resolveGeneratedAt(from, to);
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
      preparedFor: `${SITE_BRANDING.productName} — Venue Operations`,
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
