
const { SITE_CONFIG } = require("./config/siteConfig");

const UTC_OFFSET = "+00:00";

function resolveStoredWallTz() {
  const raw = String(process.env.DB_EVENTS_WALL_TZ || "").trim();
  if (raw) {
    if (raw === "UTC" || raw === "Z") return "+00:00";
    if (raw === "Asia/Kolkata" || raw === "IST") return "+05:30";
    if (/^[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  }
  return SITE_CONFIG.timezone.db.sqlOffset;
}

const DB_WALL_TZ = resolveStoredWallTz();
const DISPLAY_OFFSET = SITE_CONFIG.timezone.display.sqlOffset;

function sqlDateTime(expr) {
  return `DATE_FORMAT(${expr}, '%Y-%m-%d %H:%i:%s')`;
}

function evManilaDateTimeFmt(createdRef = "created_at", timestampRef = null) {
  return sqlDateTime(evManilaExpr(createdRef, timestampRef));
}

function evDisplayFromCreatedAt(createdRef = "created_at") {
  return `CONVERT_TZ(${createdRef}, '${DB_WALL_TZ}', '${DISPLAY_OFFSET}')`;
}

function evDisplayFromTimestamp(timestampRef = "timestamp") {
  return `CONVERT_TZ(FROM_UNIXTIME(${timestampRef} / 1000), '${UTC_OFFSET}', '${DISPLAY_OFFSET}')`;
}

function evManilaExpr(createdRef = "created_at", timestampRef = "timestamp") {
  if (timestampRef == null) {
    return evDisplayFromCreatedAt(createdRef);
  }
  const tsRef = timestampRef || "timestamp";
  return `IF(${tsRef} > 0, ${evDisplayFromTimestamp(tsRef)}, ${evDisplayFromCreatedAt(createdRef)})`;
}

function evManilaDate(createdRef = "created_at", timestampRef = "timestamp") {
  return `DATE(${evManilaExpr(createdRef, timestampRef)})`;
}

function evManilaHour(createdRef = "created_at", timestampRef = "timestamp") {
  return `HOUR(${evManilaExpr(createdRef, timestampRef)})`;
}

function evManilaYmdFmt(createdRef = "created_at", timestampRef = "timestamp") {
  return `DATE_FORMAT(${evManilaExpr(createdRef, timestampRef)}, '%Y-%m-%d')`;
}

function evEventDatetimeExpr(createdRef = "created_at", timestampRef = "timestamp") {
  return `CONVERT_TZ(${createdRef}, '${DB_WALL_TZ}', '${UTC_OFFSET}')`;
}

module.exports = {
  DB_WALL_TZ,
  STORED_WALL_TZ: DB_WALL_TZ,
  DISPLAY_OFFSET,
  evDisplayFromCreatedAt,
  evDisplayFromTimestamp,
  evEventDatetimeExpr,
  evManilaExpr,
  evManilaDate,
  evManilaDateTimeFmt,
  evManilaHour,
  evManilaYmdFmt,
  sqlDateTime,
};
