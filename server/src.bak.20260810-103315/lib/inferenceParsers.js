"use strict";

// Filename and JSONL parsing for the four on-prem CV services.
//
// Two of the services (after_hours, loitering) ship no sidecar at all, so the
// filename IS the metadata. These parsers are pure and side-effect free so
// they can be exercised against a real S3 key listing without touching a
// database.
//
// Timezone contract
// -----------------
// Anything derived from a FILENAME is local wall clock on the Windows host,
// i.e. Asia/Kolkata (+05:30), and is converted to an absolute instant here.
// The walkins JSONL carries an explicit +00:00 offset and is already absolute.
// The intrusion JSONL carries a NAIVE timestamp that is also Asia/Kolkata.

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const customParseFormat = require("dayjs/plugin/customParseFormat");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const SITE_TZ = "Asia/Kolkata";

/** Local (IST) wall clock -> JS Date (absolute instant). */
function localToDate(text, format) {
  const d = dayjs.tz(text, format, SITE_TZ);
  return d.isValid() ? d.toDate() : null;
}

/** Strip the directory portion of a path that may use either separator. */
function basename(p) {
  const norm = String(p || "").replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i === -1 ? norm : norm.slice(i + 1);
}

/**
 * Split an S3 key of the shape uploads/<service>/<artefact>/<YYYY-MM-DD>/<file>.
 * Returns null for anything that does not match (e.g. uploads/_healthcheck/...).
 */
// Services the ingester understands. kitchen_unattended is listed ahead of the
// on-prem service existing: the moment it starts writing
// uploads/kitchen_unattended/..., ingest picks it up with no code change.
const KNOWN_SERVICES = new Set([
  "walkins", "loitering", "intrusion", "after_hours", "kitchen_unattended",
  "chef_absence",
]);

function parseKey(key) {
  const parts = String(key || "").split("/");
  if (parts.length < 5 || parts[0] !== "uploads") return null;
  const [, service, artefactType, folderDate] = parts;
  const filename = parts.slice(4).join("/");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(folderDate)) return null;
  return { service, artefactType, folderDate, filename };
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const VIDEO_EXT = /\.(webm|mp4|mkv)$/i;

function contentTypeFor(filename) {
  const f = String(filename).toLowerCase();
  if (/\.jpe?g$/.test(f)) return "image/jpeg";
  if (/\.png$/.test(f)) return "image/png";
  if (/\.webp$/.test(f)) return "image/webp";
  if (/\.webm$/.test(f)) return "video/webm";
  if (/\.mp4$/.test(f)) return "video/mp4";
  if (/\.jsonl$/.test(f)) return "application/x-ndjson";
  return "application/octet-stream";
}

/**
 * after_hours frames: <camera_id>_person_<YYYYMMDD>_<HHMMSS>_<tag>.jpg
 *
 * The camera id contains spaces and sometimes a trailing space
 * ("cam-after hours -1 "), so it is NOT safe to split left-to-right. Split
 * from the right: the last four segments are always person/date/time/tag,
 * and everything before them is the camera id, preserved verbatim.
 */
function parseAfterHoursFrame(filename) {
  const stem = String(filename).replace(IMAGE_EXT, "");
  const idx = stem.lastIndexOf("_person_");
  if (idx === -1) return null;

  const cameraKey = stem.slice(0, idx); // verbatim, trailing space included
  const rest = stem.slice(idx + "_person_".length).split("_");
  if (rest.length < 2) return null;

  const [ymd, hms, tagRaw] = rest;
  if (!/^\d{8}$/.test(ymd) || !/^\d{6}$/.test(hms)) return null;

  const capturedAt = localToDate(`${ymd} ${hms}`, "YYYYMMDD HHmmss");
  if (!capturedAt) return null;

  const tag = tagRaw || null;
  let globalId = null;
  let sessionId = null;
  if (tag) {
    const g = /^GID(\d+)$/i.exec(tag);
    const s = /^S(\d+)$/i.exec(tag);
    if (g) globalId = Number(g[1]);
    else if (s) sessionId = Number(s[1]);
  }
  return { cameraKey, capturedAt, tag, globalId, sessionId };
}

/**
 * loitering events:
 *   <stream>_loiter_[GID<n>_]S<n>_<seconds>s_<YYYY-MM-DD>_<HH-MM-SS>.webm
 *
 * The stream name itself contains underscores ("Camera_Loitering-1"), so the
 * split is anchored on the literal "_loiter_" separator. The GID segment is
 * optional - present only when face re-identification matched a known person.
 */
function parseLoiteringEvent(filename) {
  const stem = String(filename).replace(VIDEO_EXT, "");
  const marker = "_loiter_";
  const idx = stem.indexOf(marker);
  if (idx === -1) return null;

  const stream = stem.slice(0, idx);
  const tail = stem.slice(idx + marker.length).split("_");
  // Tail is [GID<n>?, S<n>, <secs>s, YYYY-MM-DD, HH-MM-SS] - read from the right.
  if (tail.length < 4) return null;

  const time = tail.pop();
  const date = tail.pop();
  const secs = tail.pop();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}-\d{2}-\d{2}$/.test(time)) return null;

  const startedAt = localToDate(`${date} ${time}`, "YYYY-MM-DD HH-mm-ss");
  if (!startedAt) return null;

  const dwellMatch = /^(\d+)s$/.exec(secs || "");
  const dwellSeconds = dwellMatch ? Number(dwellMatch[1]) : null;

  let globalId = null;
  let sessionId = null;
  for (const seg of tail) {
    const g = /^GID(\d+)$/i.exec(seg);
    const s = /^S(\d+)$/i.exec(seg);
    if (g) globalId = Number(g[1]);
    else if (s) sessionId = Number(s[1]);
  }
  return { stream, globalId, sessionId, dwellSeconds, startedAt };
}

/** intrusion snapshots: <camera_id>_<YYYYMMDD>_<HHMMSS>.jpg */
function parseIntrusionSnapshot(filename) {
  const stem = String(filename).replace(IMAGE_EXT, "");
  const m = /^(.*)_(\d{8})_(\d{6})$/.exec(stem);
  if (!m) return null;
  const capturedAt = localToDate(`${m[2]} ${m[3]}`, "YYYYMMDD HHmmss");
  if (!capturedAt) return null;
  return { cameraKey: m[1], capturedAt };
}

/**
 * walkins crops:
 *   person_<track_id>_<epoch_ms>.jpg
 *   face_live_<track_id>_<epoch_ms>.jpg
 *   upload_<track_id>_<epoch_ms>.jpg              (crop of a manual upload)
 *   <epoch_ms>_person_<track_id>_<epoch_ms>.jpg   (manual uploads/ prefix)
 *
 * No camera id in the filename - that only comes from the JSONL join.
 * epoch_ms is absolute, so no timezone conversion applies.
 */
function parseWalkinCrop(filename) {
  const stem = String(filename).replace(IMAGE_EXT, "");
  const m = /(^|_)(face_live|person|upload)_(\d+)_(\d{10,})$/.exec(stem);
  if (!m) return null;
  const kind = m[2] === "face_live" ? "face" : m[2] === "upload" ? "upload" : "person";
  const trackId = Number(m[3]);
  const epochMs = Number(m[4]);
  const capturedAt = Number.isFinite(epochMs) && epochMs > 0 ? new Date(epochMs) : null;
  return { kind, trackId, epochMs, capturedAt };
}

/**
 * intrusion JSONL line.
 * timestamp is NAIVE local time (IST) - localise before treating as absolute.
 * image_path is relative to the on-prem captures root ("intrusions/<file>"),
 * NOT an S3 key; only its basename is usable.
 */
function parseIntrusionRecord(line) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return null;
  }
  if (!rec || !rec.timestamp || !rec.camera_id) return null;

  const naive = String(rec.timestamp).replace(/([+-]\d{2}:?\d{2}|Z)$/, "");
  const occurredAt = dayjs.tz(naive, SITE_TZ);
  if (!occurredAt.isValid()) return null;

  return {
    cameraKey: String(rec.camera_id),
    occurredAt: occurredAt.toDate(),
    imageBasename: rec.image_path ? basename(rec.image_path) : null,
  };
}

/**
 * walkins detections.jsonl line.
 * timestamp already carries +00:00. crop_path uses Windows backslashes in some
 * records and forward slashes in others, so both are normalised.
 * upper_hist / lower_hist (512 floats each) are dropped - re-identification
 * vectors that no UI can use.
 */
function parseWalkinRecord(line) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return null;
  }
  if (!rec || rec.track_id == null || !rec.timestamp) return null;

  const detectedAt = dayjs(String(rec.timestamp));
  if (!detectedAt.isValid()) return null;

  const colours = [];
  for (const region of ["upper", "lower"]) {
    for (const c of rec[`${region}_colors`] || []) {
      if (!c || !c.name) continue;
      colours.push({
        region,
        name: String(c.name),
        percentage: c.percentage == null ? null : Number(c.percentage),
        rgb: Array.isArray(c.rgb) ? c.rgb.map(Number) : null,
      });
    }
  }

  return {
    cameraKey: String(rec.camera_id || ""),
    trackId: Number(rec.track_id),
    rawTrackId: rec.raw_track_id == null ? null : Number(rec.raw_track_id),
    detectedAt: detectedAt.toDate(),
    bbox: Array.isArray(rec.bbox) ? rec.bbox : null,
    confidence: rec.confidence == null ? null : Number(rec.confidence),
    upperGarment: rec.upper_garment || null,
    lowerGarment: rec.lower_garment || null,
    faceQuality: rec.face_quality || null,
    mode: rec.mode || null,
    cropBasename: rec.crop_path ? basename(rec.crop_path) : null,
    faceBasename: rec.face_crop_path ? basename(rec.face_crop_path) : null,
    colours,
  };
}

/**
 * chef_absence unattended clip: <YYYY-MM-DD>_<HH-MM-SS>_<camera>.mp4
 *   e.g. "2026-08-06_16-02-57_Side View.mp4"
 *
 * The camera id comes LAST and contains spaces, so this splits from the left:
 * the first two segments are always date and time, and everything after them
 * is the camera name, preserved verbatim (a loitering filename is the mirror
 * image of this, which is why they need separate parsers).
 *
 * The timestamp is the moment the kitchen was first seen empty. There is no
 * end timestamp anywhere in the artefact set - see the note in
 * sql/chef_absence.sql about why clip length is not absence duration.
 */
function parseChefAbsenceClip(filename) {
  const stem = basename(filename).replace(VIDEO_EXT, "");
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})_(.+)$/.exec(stem);
  if (!m) return null;

  const startedAt = localToDate(`${m[1]} ${m[2]}`, "YYYY-MM-DD HH-mm-ss");
  if (!startedAt) return null;

  // Trailing space is meaningful on these camera ids elsewhere in the system,
  // so it is kept rather than trimmed.
  return { cameraKey: m[3], startedAt };
}

/**
 * chef_absence intrusion snapshot: <YYYY-MM-DD>-<HH-MM-SS>_<seq>.png
 *   e.g. "2026-08-06-21-28-00_1.png"
 *
 * Every component is dash-separated, so the date and time cannot be told apart
 * positionally - the six groups are matched explicitly. seq restarts each day
 * and runs to four digits; it is kept for ordering within the same second.
 * No camera id is present in the filename.
 */
function parseKitchenIntrusion(filename) {
  const stem = basename(filename).replace(IMAGE_EXT, "");
  const m = /^(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})_(\d{1,4})$/.exec(stem);
  if (!m) return null;

  const occurredAt = localToDate(`${m[1]} ${m[2]}${m[3]}${m[4]}`, "YYYY-MM-DD HHmmss");
  if (!occurredAt) return null;

  return { occurredAt, dailySeq: Number(m[5]) };
}

/**
 * chef_absence detections.jsonl line.
 *
 * Same detector family as walkins, so most fields match - but this stream adds
 * the three the kitchen actually cares about:
 *   status_chef  'chef' | 'non-chef' | 'housekeeping'
 *   cap_garment  null when no headwear was detected (the hygiene signal)
 *   frame_path   the full frame, not just the crop
 *
 * timestamp carries an explicit +00:00 and is already absolute. crop_path uses
 * Windows backslashes in every record observed, so it is normalised. The
 * *_hist arrays (512 floats each) are re-identification vectors and are
 * dropped - no UI can use them.
 */
function parseChefRecord(line) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return null;
  }
  if (!rec || rec.track_id == null || !rec.timestamp) return null;

  const detectedAt = dayjs(String(rec.timestamp));
  if (!detectedAt.isValid()) return null;

  const colours = [];
  for (const region of ["upper", "lower", "cap"]) {
    for (const c of rec[`${region}_colors`] || []) {
      if (!c || !c.name) continue;
      colours.push({
        region,
        name: String(c.name),
        percentage: c.percentage == null ? null : Number(c.percentage),
        rgb: Array.isArray(c.rgb) ? c.rgb.map(Number) : null,
      });
    }
  }

  return {
    cameraKey: String(rec.camera_id || ""),
    trackId: Number(rec.track_id),
    rawTrackId: rec.raw_track_id == null ? null : Number(rec.raw_track_id),
    detectedAt: detectedAt.toDate(),
    statusChef: rec.status_chef || null,
    bbox: Array.isArray(rec.bbox) ? rec.bbox : null,
    confidence: rec.confidence == null ? null : Number(rec.confidence),
    upperGarment: rec.upper_garment || null,
    lowerGarment: rec.lower_garment || null,
    capGarment: rec.cap_garment || null,
    faceQuality: rec.face_quality || null,
    identityName: rec.identity_name || null,
    identitySimilarity: rec.identity_similarity == null ? null : Number(rec.identity_similarity),
    mode: rec.mode || null,
    cropBasename: rec.crop_path ? basename(rec.crop_path) : null,
    frameBasename: rec.frame_path ? basename(rec.frame_path) : null,
    colours,
  };
}

module.exports = {
  SITE_TZ,
  KNOWN_SERVICES,
  basename,
  parseKey,
  contentTypeFor,
  parseAfterHoursFrame,
  parseLoiteringEvent,
  parseIntrusionSnapshot,
  parseWalkinCrop,
  parseIntrusionRecord,
  parseWalkinRecord,
  parseChefAbsenceClip,
  parseKitchenIntrusion,
  parseChefRecord,
};
