const { getCameraMap, normalizeCameraId, resolveCameraName } = require("./cameras");
const CAMERA_MAP = getCameraMap();
const { SITE_CONFIG } = require("./config/siteConfig");
const { evEventDatetimeExpr, evManilaDate, evManilaHour, evManilaYmdFmt } = require("./eventTimeSql");
const { ymdSite, eachHourSlotInRange } = require("./siteTimeZone");

const evD = evManilaDate("created_at", null);
const evH = evManilaHour("created_at", null);
const evYmd = evManilaYmdFmt("created_at", null);

function staleMinutesFromConfig() {
  const n = Number(SITE_CONFIG.cameraOnlineStaleMinutes);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

async function loadCameraLiveStatus(pool) {
  const staleMinutes = staleMinutesFromConfig();
  const cutoffMs = Date.now() - staleMinutes * 60 * 1000;
  const dtExpr = evEventDatetimeExpr("created_at", "timestamp");

  const [rows] = await pool.query(
    `
    SELECT camera_id,
      MAX(
        CASE
          WHEN timestamp > 0 THEN timestamp
          ELSE UNIX_TIMESTAMP(${dtExpr}) * 1000
        END
      ) AS last_ms
    FROM vehicle_events
    GROUP BY camera_id
  `
  );

  const lastByCam = new Map();
  for (const row of rows || []) {
    const id = normalizeCameraId(row.camera_id);
    if (!id) continue;
    const ms = Number(row.last_ms) || 0;
    const prev = lastByCam.get(id) || 0;
    if (ms > prev) lastByCam.set(id, ms);
  }

  const camerasLive = Object.entries(CAMERA_MAP).map(([camera_id, label]) => {
    const name = resolveCameraName(camera_id, CAMERA_MAP) || label;
    const lastEventMs = lastByCam.get(camera_id) || 0;
    const online = lastEventMs > 0 && lastEventMs >= cutoffMs;
    return { camera_id, name, online, lastEventMs: lastEventMs || null };
  });

  const camerasDeployed = camerasLive.length;
  const camerasOnline = camerasLive.filter((c) => c.online).length;

  return {
    camerasOnline,
    camerasDeployed,
    camerasLive,
    cameraOnlineStaleMinutes: staleMinutes,
  };
}

function hourSlotKey(ymd, hr) {
  const y = String(ymd).slice(0, 10);
  const h = Number(hr);
  if (!y || !Number.isFinite(h)) return "";
  return `${y} ${String(h).padStart(2, "0")}:00`;
}

async function loadCameraUptime(pool, from, to, hourCap = null) {
  const todayYmd = ymdSite();
  const clipNow = to >= todayYmd;
  let slots = eachHourSlotInRange(from, to, clipNow);
  if (hourCap != null && from === to) {
    slots = slots.filter((s) => Number(s.slice(11, 13)) <= hourCap);
  }
  const expectedHours = slots.length;
  const slotSet = new Set(slots);
  const deployedIds = Object.keys(CAMERA_MAP);

  if (expectedHours === 0) {
    return { cameraUptimePercent: 0, expectedHoursPerCamera: 0, cameras: [] };
  }

  const hourClip = hourCap != null && from === to ? ` AND ${evH} <= ?` : "";
  const params = hourCap != null && from === to ? [from, to, hourCap] : [from, to];

  const [rows] = await pool.query(
    `
    SELECT camera_id, ${evYmd} AS ymd, ${evH} AS hr
    FROM vehicle_events
    WHERE ${evD} BETWEEN ? AND ?
    ${hourClip}
    GROUP BY camera_id, ${evYmd}, ${evH}
  `,
    params
  );

  const activeByCam = new Map();
  for (const row of rows || []) {
    const id = normalizeCameraId(row.camera_id);
    const key = hourSlotKey(row.ymd, row.hr);
    if (!id || !key || !slotSet.has(key)) continue;
    if (!activeByCam.has(id)) activeByCam.set(id, new Set());
    activeByCam.get(id).add(key);
  }

  let sumPct = 0;
  const cameras = deployedIds.map((id) => {
    const activeHours = activeByCam.get(id)?.size ?? 0;
    const uptimePercent = Math.round((activeHours / expectedHours) * 100);
    sumPct += uptimePercent;
    return {
      camera_id: id,
      name: resolveCameraName(id, CAMERA_MAP),
      uptimePercent,
      activeHours,
      expectedHours,
    };
  });

  const cameraUptimePercent = deployedIds.length ? Math.round(sumPct / deployedIds.length) : 0;
  return { cameraUptimePercent, expectedHoursPerCamera: expectedHours, cameras };
}

module.exports = {
  loadCameraLiveStatus,
  loadCameraUptime,
  staleMinutesFromConfig,
};
