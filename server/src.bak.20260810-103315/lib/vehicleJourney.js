const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { pool } = require("../db");
const { normalizeCameraId, loadMergedCameraMap, resolveCameraName } = require("../cameras");
const { DIRECTION_TO_CLASSES } = require("../domain");
const { normalizePlate } = require("./demoOwners");
const { loadWatchPlateMatchers, plateMatches } = require("./watchlistDb");
const { ymdSite } = require("../siteTimeZone");
const { evManilaDate, evManilaExpr, evManilaDateTimeFmt } = require("../eventTimeSql");

dayjs.extend(utc);
dayjs.extend(timezone);

const { SITE_TIMEZONE } = require("../config/siteConfig");

const evDve = evManilaDate("ve.created_at", null);
const evDisplayVe = evManilaExpr("ve.created_at", null);
const evDisplayFmtVe = evManilaDateTimeFmt("ve.created_at", null);

const SITE_COORDS = {
  Highway: { lat: 14.736, lng: 121.205 },
  Luvers: { lat: 14.728, lng: 121.212 },
  Market: { lat: 14.742, lng: 121.198 },
  Baliwag: { lat: 14.751, lng: 121.185 },
  Chowking: { lat: 14.722, lng: 121.228 },
  Markey: { lat: 14.735, lng: 121.2 },
};

function plateMatchSql(colRef) {
  return `(
    UPPER(REPLACE(REPLACE(TRIM(${colRef}), '-', ''), ' ', '')) = ?
    OR UPPER(REPLACE(REPLACE(TRIM(COALESCE(vehicle_num_raw, '')), '-', ''), ' ', '')) = ?
  )`;
}

function coordsForSite(siteName) {
  if (siteName && SITE_COORDS[siteName]) return SITE_COORDS[siteName];
  return null;
}

function parseEventTime(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const d = dayjs.tz(s.replace("T", " ").slice(0, 19), "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
  return d.isValid() ? d : null;
}

function formatDisplayDateTime(raw) {
  const d = parseEventTime(raw);
  if (!d) return String(raw || "—");
  return d.format("D MMM YYYY, HH:mm:ss");
}

function formatTimeShort(raw) {
  const d = parseEventTime(raw);
  if (!d) return "—";
  return d.format("hh:mm A");
}

function formatTimelineDateTime(raw) {
  const d = parseEventTime(raw);
  if (!d) return "—";
  return d.format("D MMM YYYY, hh:mm A");
}

function formatElapsedMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} sec`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function directionLabel(category) {
  const c = Number(category);
  if (DIRECTION_TO_CLASSES.IN.includes(c)) return "Inbound";
  if (DIRECTION_TO_CLASSES.OUT.includes(c)) return "Outbound";
  return "—";
}

function vehicleClassLabel(category, vehicleType) {
  const cat = Number(category);
  const typeMap = {
    1: "Car",
    2: "Car",
    3: "Truck",
    4: "Truck",
    5: "Motorcycle",
    6: "Motorcycle",
    7: "Mini-truck",
    8: "Mini-truck",
    9: "Bus",
    10: "Bus",
    11: "Tuk-tuk",
    12: "Tuk-tuk",
  };
  const base = typeMap[cat] || "Vehicle";
  const vt = String(vehicleType || "").trim();
  if (vt && vt !== "UNKNOWN") return `${base} — ${vt}`;
  return base;
}

function haversineKm(a, b) {
  if (!a?.lat || !b?.lat) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function riskLevel(violationCount, watchlistHit) {
  if (watchlistHit) return "High";
  if (violationCount >= 2) return "High";
  if (violationCount === 1) return "Medium";
  return "Low";
}

function journeyDateClause(from, to) {
  if (from && to) return { sql: ` AND ${evDve} BETWEEN ? AND ? `, params: [from, to] };
  return { sql: "", params: [] };
}

async function fetchJourneyStops(pool, plateNorm, from, to, limit = 500) {
  const range = journeyDateClause(from, to);
  const [rows] = await pool.query(
    `
    SELECT
      ve.id,
      ve.event_id,
      ve.camera_id,
      ve.vehicle_num,
      ve.vehicle_category,
      ve.vehicle_type,
      ve.ocr_confidence,
      ve.full_image_url,
      ve.plate_url,
      ${evDisplayFmtVe} AS detected_at
    FROM vehicle_events ve
    WHERE ${plateMatchSql("ve.vehicle_num")}
      ${range.sql}
    ORDER BY ${evDisplayVe} ASC, ve.id ASC
    LIMIT ?
  `,
    [plateNorm, plateNorm, ...range.params, limit]
  );
  return rows || [];
}

async function fetchViolationsForPlate(pool, plateNorm, from, to) {
  try {
    const range = journeyDateClause(from, to);
    const [rows] = await pool.query(
      `
      SELECT tv.id, tv.violation_type, tv.event_id, ${evDisplayFmtVe} AS detected_at, ve.camera_id
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      WHERE ${plateMatchSql("ve.vehicle_num")}
        ${range.sql}
      ORDER BY ${evDisplayVe} ASC
    `,
      [plateNorm, plateNorm, ...range.params]
    );
    return rows || [];
  } catch {
    return [];
  }
}

async function checkWatchlist(pool, plate, cameraId) {
  try {
    const { matchers } = await loadWatchPlateMatchers(pool);
    if (!matchers.length) return false;
    return matchers.some((m) => plateMatches(plate, [m], cameraId));
  } catch {
    return false;
  }
}

function buildMovementPattern(stops) {
  const sites = [];
  for (const s of stops) {
    const name = s.siteName;
    if (!name || sites[sites.length - 1] === name) continue;
    sites.push(name);
  }
  return sites.length ? sites.join(" → ") : "—";
}

function buildAiNarrative(ctx) {
  const {
    plate,
    stopCount,
    sitesCount,
    durationLabel,
    avgInterval,
    violationCount,
    movementPattern,
    risk,
    watchlistHit,
  } = ctx;
  let text = `Vehicle ${plate} generated ${stopCount} ANPR detection${stopCount === 1 ? "" : "s"} across ${sitesCount} camera site${sitesCount === 1 ? "" : "s"} during the selected period. `;
  text += `The observed movement pattern (${movementPattern}) ${durationLabel !== "—" ? `spanned ${durationLabel}` : "was recorded"} with an average interval of ${avgInterval} between consecutive sightings. `;
  if (violationCount > 0) {
    text += `${violationCount} linked violation${violationCount === 1 ? "" : "s"} were detected along this journey, indicating enforcement attention is warranted. `;
  } else {
    text += `No linked violations were detected along this journey under current records. `;
  }
  if (watchlistHit) {
    text += "This plate matched an active watchlist rule and should be prioritized for supervisor review.";
  } else if (risk === "Low") {
    text += "Overall movement appears consistent with routine traffic flow with low investigative risk.";
  } else {
    text += `Risk assessment: ${risk} — continue monitoring and validate against field intelligence.`;
  }
  return text;
}

async function buildVehicleJourney(pool, plateRaw, from, to) {
  const plate = normalizePlate(plateRaw);
  if (!plate || plate.length < 3) {
    return { error: "bad_request", message: "Valid plate number required." };
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const fromStr = from ? String(from).trim() : "";
  const toStr = to ? String(to).trim() : "";
  const hasRange = Boolean(fromStr || toStr);
  if (hasRange) {
    if (!dateRe.test(fromStr) || !dateRe.test(toStr) || toStr < fromStr) {
      return { error: "bad_request", message: "Invalid from/to (YYYY-MM-DD)." };
    }
  }
  const rangeFrom = hasRange ? fromStr : null;
  const rangeTo = hasRange ? toStr : null;

  const cameraMap = await loadMergedCameraMap(pool);
  const rawStops = await fetchJourneyStops(pool, plate, rangeFrom, rangeTo);
  const violationRows = await fetchViolationsForPlate(pool, plate, rangeFrom, rangeTo);
  const violationsByEvent = new Map();
  for (const v of violationRows) {
    violationsByEvent.set(String(v.event_id), {
      id: Number(v.id),
      violationType: String(v.violation_type),
      detectedAt: String(v.detected_at || ""),
    });
  }

  const stops = [];
  for (let i = 0; i < rawStops.length; i++) {
    const r = rawStops[i];
    const camId = normalizeCameraId(r.camera_id);
    const siteName = resolveCameraName(camId, cameraMap);
    const coords = coordsForSite(siteName);
    const detectedAt = String(r.detected_at || "");
    const prev = i > 0 ? stops[i - 1] : null;
    const prevTime = prev ? parseEventTime(prev.detectedAt) : null;
    const curTime = parseEventTime(detectedAt);
    const elapsedMs =
      prevTime && curTime ? curTime.diff(prevTime) : null;
    const violation = violationsByEvent.get(String(r.event_id)) || null;

    stops.push({
      sequence: i + 1,
      id: Number(r.id),
      eventId: String(r.event_id),
      detectedAt,
      detectedAtDisplay: formatDisplayDateTime(detectedAt),
      timeShort: formatTimeShort(detectedAt),
      timelineAt: formatTimelineDateTime(detectedAt),
      cameraId: camId,
      siteName,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      plate: String(r.vehicle_num || plate).trim(),
      vehicleCategory: Number(r.vehicle_category || 0),
      vehicleClass: vehicleClassLabel(r.vehicle_category, r.vehicle_type),
      direction: directionLabel(r.vehicle_category),
      confidence: r.ocr_confidence != null ? Math.round(Number(r.ocr_confidence) * 100) / 100 : null,
      fullImageUrl: r.full_image_url ? String(r.full_image_url) : null,
      plateUrl: r.plate_url ? String(r.plate_url) : null,
      violation,
      elapsedFromPrevious: elapsedMs != null ? formatElapsedMs(elapsedMs) : null,
      isFirst: i === 0,
      isLast: i === rawStops.length - 1,
    });
  }

  if (stops.length) {
    stops[0].siteLabel = stops.length === 1 ? stops[0].siteName : `${stops[0].siteName} (Entry)`;
    stops[stops.length - 1].siteLabel =
      stops.length === 1 ? stops[stops.length - 1].siteName : `${stops[stops.length - 1].siteName} (Last seen)`;
  }

  const first = stops[0];
  const last = stops[stops.length - 1];
  const firstTime = first ? parseEventTime(first.detectedAt) : null;
  const lastTime = last ? parseEventTime(last.detectedAt) : null;
  const journeyMs = firstTime && lastTime ? lastTime.diff(firstTime) : 0;
  const journeyDuration = formatElapsedMs(journeyMs);

  const siteSet = new Set(stops.map((s) => s.siteName));
  const sitesVisited = [...siteSet];

  let routeKm = 0;
  const routeCoords = [];
  for (const s of stops) {
    if (s.lat != null && s.lng != null) {
      const pt = { lat: s.lat, lng: s.lng };
      if (routeCoords.length) {
        routeKm += haversineKm(routeCoords[routeCoords.length - 1], pt);
      }
      routeCoords.push([s.lng, s.lat]);
    }
  }

  const avgSpeed = journeyMs > 0 && routeKm > 0 ? Math.round((routeKm / (journeyMs / 3600000)) * 10) / 10 : null;

  const avgIntervalMs =
    stops.length > 1 && journeyMs > 0 ? journeyMs / (stops.length - 1) : null;

  const watchlistHit = last ? await checkWatchlist(pool, last.plate, last.cameraId) : false;
  const violationCount = violationRows.length;
  const risk = riskLevel(violationCount, watchlistHit);
  const movementPattern = buildMovementPattern(stops);

  const sitesOverview = [];
  const seenSites = new Set();
  for (const s of stops) {
    if (seenSites.has(s.siteName)) continue;
    seenSites.add(s.siteName);
    sitesOverview.push({
      siteName: s.siteName,
      cameraId: s.cameraId,
      firstSeen: s.detectedAt,
      firstSeenShort: s.timeShort,
      sequence: s.sequence,
    });
  }

  const ai = {
    totalDetections: stops.length,
    movementPattern,
    journeyDuration,
    averageInterval: avgIntervalMs != null ? formatElapsedMs(avgIntervalMs) : "—",
    violationsEncountered: violationCount,
    violationSummary:
      violationCount > 0
        ? violationRows.map((v) => String(v.violation_type).replace(/_/g, " ")).join(", ")
        : "None",
    riskLevel: risk,
    narrative: buildAiNarrative({
      plate,
      stopCount: stops.length,
      sitesCount: sitesVisited.length,
      durationLabel: journeyDuration,
      avgInterval: avgIntervalMs != null ? formatElapsedMs(avgIntervalMs) : "—",
      violationCount,
      movementPattern,
      risk,
      watchlistHit,
    }),
  };

  return {
    plate,
    from: rangeFrom,
    to: rangeTo,
    generatedAt: new Date().toISOString(),
    summary: {
      plate,
      firstSeen: first?.detectedAtDisplay || "—",
      firstSeenSite: first?.siteName || "—",
      lastSeen: last?.detectedAtDisplay || "—",
      lastSeenSite: last?.siteName || "—",
      totalHits: stops.length,
      journeyDuration,
      sitesVisited: sitesVisited.length,
      averageInterval: avgIntervalMs != null ? formatElapsedMs(avgIntervalMs) : "—",
    },
    route: {
      coordinates: routeCoords,
      distanceKm: Math.round(routeKm * 10) / 10,
      duration: journeyDuration,
      averageSpeedKmh: avgSpeed,
    },
    stops,
    sitesOverview,
    violations: violationRows.map((v) => ({
      id: Number(v.id),
      violationType: String(v.violation_type),
      detectedAt: String(v.detected_at || ""),
      cameraId: normalizeCameraId(v.camera_id),
      siteName: resolveCameraName(normalizeCameraId(v.camera_id), cameraMap),
    })),
    currentStatus: last
      ? {
          plate: last.plate,
          vehicleClass: last.vehicleClass,
          lastSeenLocation: last.siteName,
          lastSeenTime: last.detectedAtDisplay,
          direction: last.direction,
          watchlistStatus: watchlistHit ? "Watchlist match" : "Clear",
          watchlistHit,
          violationCount,
          active: true,
          imageUrl: last.fullImageUrl,
        }
      : null,
    ai,
    cameraMap,
  };
}

module.exports = { buildVehicleJourney };
