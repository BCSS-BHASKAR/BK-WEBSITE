
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

/**
 * Render a fixed UTC offset as a Postgres zone specifier.
 *
 * `AT TIME ZONE '+05:30'` is ambiguous — Postgres reads a bare offset *string*
 * with the POSIX sign convention, where "+" means west of UTC. Passing an
 * INTERVAL instead uses the ISO convention ("+" is east), which is what the
 * config file means. Always go through this helper.
 */
function zone(offset) {
  if (!/^[+-]\d{2}:\d{2}$/.test(String(offset))) {
    throw new Error(`Invalid SQL UTC offset: ${offset}`);
  }
  return `INTERVAL '${offset}'`;
}

/**
 * MySQL's CONVERT_TZ(expr, from, to): read `expr` as a naive wall clock in
 * `from` and re-express it as a naive wall clock in `to`.
 *
 * In Postgres, `timestamp AT TIME ZONE z` attaches a zone (-> timestamptz) and
 * `timestamptz AT TIME ZONE z` strips one back off (-> timestamp), so the same
 * conversion is those two applied in sequence.
 */
function convertTz(expr, fromOffset, toOffset) {
  return `((${expr}) AT TIME ZONE ${zone(fromOffset)} AT TIME ZONE ${zone(toOffset)})`;
}

function sqlDateTime(expr) {
  return `TO_CHAR(${expr}, 'YYYY-MM-DD HH24:MI:SS')`;
}

function evManilaDateTimeFmt(createdRef = "created_at", timestampRef = null) {
  return sqlDateTime(evManilaExpr(createdRef, timestampRef));
}

function evDisplayFromCreatedAt(createdRef = "created_at") {
  return convertTz(createdRef, DB_WALL_TZ, DISPLAY_OFFSET);
}

/**
 * `timestamp` columns hold epoch milliseconds, which are absolute — there is no
 * source zone to interpret. to_timestamp() yields a timestamptz directly, so a
 * single AT TIME ZONE lands it on the display wall clock.
 *
 * NOTE: the MySQL original wrote CONVERT_TZ(FROM_UNIXTIME(ts/1000), '+00:00', display).
 * FROM_UNIXTIME resolves in the *session* zone, so on the documented
 * default-time-zone='+05:30' server that path double-counted the offset and ran
 * 5h30m fast. This is the intended conversion.
 */
function evDisplayFromTimestamp(timestampRef = "timestamp") {
  return `(TO_TIMESTAMP((${timestampRef}) / 1000.0) AT TIME ZONE ${zone(DISPLAY_OFFSET)})`;
}

function evManilaExpr(createdRef = "created_at", timestampRef = "timestamp") {
  if (timestampRef == null) {
    return evDisplayFromCreatedAt(createdRef);
  }
  const tsRef = timestampRef || "timestamp";
  return `(CASE WHEN ${tsRef} > 0 THEN ${evDisplayFromTimestamp(tsRef)} ELSE ${evDisplayFromCreatedAt(createdRef)} END)`;
}

function evManilaDate(createdRef = "created_at", timestampRef = "timestamp") {
  return `(${evManilaExpr(createdRef, timestampRef)})::date`;
}

function evManilaHour(createdRef = "created_at", timestampRef = "timestamp") {
  return `EXTRACT(HOUR FROM ${evManilaExpr(createdRef, timestampRef)})::int`;
}

function evManilaYmdFmt(createdRef = "created_at", timestampRef = "timestamp") {
  return `TO_CHAR(${evManilaExpr(createdRef, timestampRef)}, 'YYYY-MM-DD')`;
}

function evEventDatetimeExpr(createdRef = "created_at", timestampRef = "timestamp") {
  return convertTz(createdRef, DB_WALL_TZ, UTC_OFFSET);
}

/**
 * Epoch milliseconds for a naive wall-clock column stored at `offset`.
 *
 * Replaces MySQL's UNIX_TIMESTAMP(dt), which resolved a naive datetime against
 * whatever the session time zone happened to be. Stating the source offset
 * makes the result independent of server configuration.
 */
function epochMillis(expr, offset = DB_WALL_TZ) {
  return `(EXTRACT(EPOCH FROM ((${expr}) AT TIME ZONE ${zone(offset)})) * 1000)::bigint`;
}

module.exports = {
  DB_WALL_TZ,
  STORED_WALL_TZ: DB_WALL_TZ,
  DISPLAY_OFFSET,
  convertTz,
  zone,
  epochMillis,
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
