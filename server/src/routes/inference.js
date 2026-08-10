"use strict";

// Inference viewer API.
//
// Media policy: the bucket is private and stays private. Every row that has an
// asset is returned with a freshly minted short-TTL presigned URL inline, so
// the browser can render <img>/<video> directly from S3 without the 30-40 MB
// loitering clips ever transiting this box. Presigning is local HMAC - no
// network round trip - so doing it per row is cheap.

const express = require("express");
const { pool } = require("../db");
const { presignGet, probe } = require("../lib/inferenceS3");
const { runIngest } = require("../lib/inferenceIngest");
const {
  posterFile, hasPoster, ensurePoster, posterUrl, verifyPosterUrl, fetchBytesFor,
} = require("../lib/inferencePosters");
const {
  needsTranscode, probeCodec, clipFile, hasClip, streamTranscode, clipUrl, verifyClipUrl,
} = require("../lib/inferenceTranscodes");

// Above this, a still is worth downscaling before it reaches a grid. The
// walk-in crops are ~50 KB and are served as-is; the chef_absence intrusion
// PNGs are 2.7-3.4 MB and are not.
const THUMBNAIL_MIN_BYTES = 512 * 1024;
const fs = require("fs");

const router = express.Router();

const MAX_PAGE = 200;

function paginate(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE, Math.max(1, Number(req.query.pageSize) || 48));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * Shared date/camera filter. Columns differ per service, so the timestamp
 * column is passed in. Dates are interpreted in site time (IST) and compared
 * against TIMESTAMPTZ, so a "2026-08-06" filter means that IST calendar day.
 *
 * The ::timestamp cast is load-bearing. AT TIME ZONE has two overloads, and a
 * bare `date` selects the wrong one - it is preferentially cast to timestamptz,
 * so the result is a LOCAL timestamp that depends on the session's TimeZone.
 * This database runs UTC, so the bound meant 11:00 IST rather than midnight and
 * every filtered range was shifted by 11 hours. Casting to timestamp first
 * yields timezone(text, timestamp) -> timestamptz, an absolute instant.
 */
function buildFilters(req, tsCol, cameraCol) {
  const where = [];
  const params = [];
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  if (dateRe.test(from)) {
    where.push(`${tsCol} >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    params.push(from);
  }
  if (dateRe.test(to)) {
    where.push(`${tsCol} < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    params.push(to);
  }
  const camera = String(req.query.camera || "").trim();
  if (camera) {
    where.push(`${cameraCol} = ?`);
    params.push(camera);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

/** Attach a presigned URL to each row that carries an s3_key. */
async function withMedia(rows) {
  return Promise.all(
    rows.map(async (r) => {
      const out = { ...r };
      if (r.s3_key) {
        out.mediaUrl = await presignGet(r.s3_key, { downloadName: r.s3_key.split("/").pop() });
        out.isVideo = String(r.content_type || "").startsWith("video");
        // MP4s here are MPEG-4 Part 2, which no browser decodes, so the player
        // is pointed at a transcoded rendition instead. sourceUrl keeps the
        // untouched original one click away - it is the evidence of record, and
        // the rendition is a downscaled re-encode of it.
        if (out.isVideo && needsTranscode(r.content_type)) {
          const assetIdForClip = r.asset_id != null ? r.asset_id : r.id;
          out.sourceUrl = out.mediaUrl;
          out.mediaUrl = clipUrl(assetIdForClip);
        }
        // Posters are keyed by media_asset.id. Most rows here are SERVICE rows
        // (loitering_event.id etc.) whose id is unrelated to the asset id, so
        // keying on r.id would miss - or worse, silently return another clip's
        // frame. Always use the explicitly selected asset id.
        const assetId = r.asset_id != null ? r.asset_id : r.id;
        // A poster is offered for anything that needs one - every video, plus
        // stills too large to drop straight into a grid. The URL is handed out
        // whether or not the file exists yet; the poster route renders it on
        // first request, so nothing is generated for tiles nobody opens.
        const wantsPoster = out.isVideo || (
          String(r.content_type || "").startsWith("image") &&
          Number(r.size_bytes || 0) >= THUMBNAIL_MIN_BYTES
        );
        if (wantsPoster || hasPoster(assetId)) out.posterUrl = posterUrl(assetId);
      }
      delete out.s3_key;
      if (r.face_s3_key) {
        out.faceUrl = await presignGet(r.face_s3_key);
        delete out.face_s3_key;
      }
      return out;
    })
  );
}

async function listEndpoint(res, { countSql, rowsSql, params, page, pageSize, offset }) {
  const [[{ total }]] = await pool.query(countSql, params);
  const [rows] = await pool.query(rowsSql, [...params, pageSize, offset]);
  res.json({ total: Number(total || 0), page, pageSize, rows: await withMedia(rows) });
}


// ---------------------------------------------------------------------------
// Shared query helpers
// ---------------------------------------------------------------------------

/** Module key -> the service table + its identity/timestamp columns. */
const MODULES = {
  walkins:    { table: "walkin_detection",     alias: "d", ts: "d.detected_at",  cam: "d.camera_key" },
  loitering:  { table: "loitering_event",      alias: "l", ts: "l.started_at",   cam: "l.stream" },
  intrusion:  { table: "intrusion_event",      alias: "i", ts: "i.occurred_at",  cam: "i.camera_key" },
  after_hours:{ table: "after_hours_sighting", alias: "s", ts: "s.captured_at",  cam: "s.camera_key" },
  // Empty until the on-prem service writes uploads/kitchen_unattended/, but
  // wired up so the module behaves like the others rather than 404ing.
  kitchen_unattended: { table: "kitchen_unattended_event", alias: "k", ts: "k.started_at", cam: "k.camera_key" },
  chef_absence: { table: "chef_absence_incident", alias: "c", ts: "c.started_at", cam: "c.camera_key" },
};

/**
 * Streams that accept feedback but have no entry in MODULES - either because
 * the service table is not yet written (kitchen_unattended) or because they are
 * secondary streams of a module that already has one (the chef_absence
 * intrusion snapshots and person classifications).
 */
const FEEDBACK_ONLY_MODULES = new Set(["kitchen_unattended", "chef_intrusion", "chef_detection"]);

/**
 * Suppress detections a human has marked as a false positive.
 *
 * This is a READ-time filter, never a delete: the detection row, its S3 media
 * and its timestamps are untouched, so a mistaken thumbs-down is reversible and
 * the sample stays available for model retraining. Applied to every KPI,
 * analytics series and table so the numbers agree everywhere.
 */
function notFalsePositive(module, idCol) {
  return `NOT EXISTS (SELECT 1 FROM false_positive_detection f
                       WHERE f.module = '${module}' AND f.detection_id = ${idCol})`;
}

/** Whitelisted sort, so an arbitrary query param can never reach the SQL. */
function orderBy(req, allowed, fallback) {
  const raw = String(req.query.sortBy || "").trim();
  const dir = String(req.query.sortDir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const col = allowed[raw];
  return col ? `${col} ${dir}` : fallback;
}

/** Free-text search across camera / site / event id, per the Monitoring spec. */
function searchClause(req, cols) {
  const q = String(req.query.q || req.query.search || "").trim();
  if (!q || !cols.length) return null;
  const ors = cols.map((c) => `${c}::text ILIKE ?`);
  return { sql: `(${ors.join(" OR ")})`, params: cols.map(() => `%${q}%`) };
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  // Date is an object, so it must be handled before the JSON.stringify branch -
  // otherwise it comes back already quoted and then gets escaped a second time.
  if (v instanceof Date) return v.toISOString();
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(res, filename, rows) {
  if (!rows.length) {
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send("");
  }
  const cols = Object.keys(rows[0]);
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))].join("\n");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(body);
}

// ---------------------------------------------------------------------------

router.get("/health", async (_req, res) => {
  try {
    const s3 = await probe();
    const [[state]] = await pool.query(
      `SELECT last_run_at, objects_seen, rows_upserted, last_error
         FROM inference_ingest_state ORDER BY last_run_at DESC NULLS LAST LIMIT 1`
    );
    res.json({ ok: true, s3, ingest: state || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/cameras", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT service, camera_key, display_name FROM inference_camera
        ORDER BY service, camera_key`
    );
    res.json({ cameras: rows });
  } catch (e) {
    console.error("inference cameras", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    // Optional range, applied identically to every service so the tiles and the
    // Monitoring pages agree. Omitted range = all time (the dashboard default).
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const rng = (col) => {
      const parts = [];
      if (dateRe.test(from)) parts.push(`${col} >= '${from}'::date::timestamp AT TIME ZONE 'Asia/Kolkata'`);
      if (dateRe.test(to)) parts.push(`${col} < ('${to}'::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'`);
      return parts.length ? ` AND ${parts.join(" AND ")}` : "";
    };
    const [[counts]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM after_hours_sighting s
           WHERE ${notFalsePositive("after_hours", "s.id")}${rng("s.captured_at")}) AS after_hours,
         (SELECT COUNT(*) FROM loitering_event l
           WHERE ${notFalsePositive("loitering", "l.id")}${rng("l.started_at")})   AS loitering,
         (SELECT COUNT(*) FROM intrusion_event i
           WHERE ${notFalsePositive("intrusion", "i.id")}${rng("i.occurred_at")})  AS intrusion,
         (SELECT COUNT(*) FROM walkin_detection d
           WHERE ${notFalsePositive("walkins", "d.id")}${rng("d.detected_at")})    AS walkins,
         -- These two were absent, so the dashboard could only ever report four
         -- of the six modules - its "events captured" total silently excluded
         -- them, and no tile could be built on them.
         (SELECT COUNT(*) FROM kitchen_unattended_event k
           WHERE ${notFalsePositive("kitchen_unattended", "k.id")}${rng("k.started_at")}) AS kitchen_unattended,
         (SELECT COUNT(*) FROM chef_absence_incident c
           WHERE ${notFalsePositive("chef_absence", "c.id")}${rng("c.started_at")})       AS chef_absence,
         (SELECT COUNT(*) FROM media_asset)          AS assets,
         (SELECT COALESCE(SUM(size_bytes),0) FROM media_asset) AS bytes,
         (SELECT COUNT(*) FROM reinforcement_feedback WHERE feedback_type='false_positive') AS suppressed`
    );
    const [recent] = await pool.query(
      `SELECT service, COUNT(*) AS n, MAX(occurred_at) AS latest
         FROM inference_timeline
        WHERE occurred_at > now() - interval '24 hours'
        GROUP BY service ORDER BY service`
    );
    const [colours] = await pool.query(
      `SELECT c.name, COUNT(DISTINCT c.detection_id) AS n
         FROM walkin_colour c WHERE c.region = 'upper'
        GROUP BY c.name ORDER BY n DESC LIMIT 12`
    );
    res.json({ counts, last24h: recent, topUpperColours: colours });
  } catch (e) {
    console.error("inference summary", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/after-hours", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "s.captured_at", "s.camera_key");
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    const params = [...f.params];
    w.push(notFalsePositive("after_hours", "s.id"));
    const search = searchClause(req, ["s.camera_key", "s.tag", "s.id"]);
    if (search) { w.push(search.sql); params.push(...search.params); }
    const sql = `WHERE ${w.join(" AND ")}`;
    const ord = orderBy(req, { detectedAt: "s.captured_at", camera: "s.camera_key" }, "s.captured_at DESC");
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM after_hours_sighting s ${sql}`,
      rowsSql: `SELECT s.id, s.camera_key, s.captured_at, s.tag, s.global_id, s.session_id,
                       m.s3_key, m.size_bytes, m.content_type, m.id AS asset_id
                  FROM after_hours_sighting s JOIN media_asset m ON m.id = s.asset_id
                  ${sql} ORDER BY ${ord} LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference after-hours", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/loitering", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "l.started_at", "l.stream");
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    const params = [...f.params];
    const minDwell = Number(req.query.minDwell);
    if (Number.isFinite(minDwell) && minDwell > 0) { w.push("l.dwell_seconds >= ?"); params.push(minDwell); }
    w.push(notFalsePositive("loitering", "l.id"));
    const search = searchClause(req, ["l.stream", "l.global_id", "l.id"]);
    if (search) { w.push(search.sql); params.push(...search.params); }
    const sql = `WHERE ${w.join(" AND ")}`;
    const ord = orderBy(req, {
      detectedAt: "l.started_at", duration: "l.dwell_seconds", camera: "l.stream",
    }, "l.started_at DESC");
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM loitering_event l ${sql}`,
      rowsSql: `SELECT l.id, l.stream AS camera_key, l.started_at, l.dwell_seconds,
                       l.global_id, l.session_id, m.s3_key, m.size_bytes, m.content_type, m.id AS asset_id
                  FROM loitering_event l JOIN media_asset m ON m.id = l.asset_id
                  ${sql} ORDER BY ${ord} LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference loitering", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/intrusion", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "i.occurred_at", "i.camera_key");
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    const params = [...f.params];
    w.push(notFalsePositive("intrusion", "i.id"));
    const search = searchClause(req, ["i.camera_key", "i.id"]);
    if (search) { w.push(search.sql); params.push(...search.params); }
    const sql = `WHERE ${w.join(" AND ")}`;
    const ord = orderBy(req, { detectedAt: "i.occurred_at", camera: "i.camera_key" }, "i.occurred_at DESC");
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM intrusion_event i ${sql}`,
      rowsSql: `SELECT i.id, i.camera_key, i.occurred_at, m.s3_key, m.size_bytes, m.content_type, m.id AS asset_id
                  FROM intrusion_event i LEFT JOIN media_asset m ON m.id = i.asset_id
                  ${sql} ORDER BY ${ord} LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference intrusion", e);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * Walk-ins, with the marquee feature: "show me everyone in a red upper today".
 * colour/garment filters run as EXISTS against the indexed walkin_colour table
 * rather than scanning jsonb.
 */
router.get("/walkins", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "d.detected_at", "d.camera_key");
    const where = f.sql ? [f.sql.replace(/^WHERE /, "")] : [];
    const params = [...f.params];

    const colour = String(req.query.colour || "").trim();
    const region = ["upper", "lower"].includes(String(req.query.region)) ? String(req.query.region) : null;
    if (colour) {
      const minPct = Number(req.query.minPct) || 0;
      where.push(
        `EXISTS (SELECT 1 FROM walkin_colour c
                  WHERE c.detection_id = d.id
                    AND lower(c.name) = lower(?)
                    ${region ? "AND c.region = ?" : ""}
                    AND COALESCE(c.percentage, 0) >= ?)`
      );
      params.push(colour);
      if (region) params.push(region);
      params.push(minPct);
    }
    const garment = String(req.query.garment || "").trim();
    if (garment) {
      where.push(`(d.upper_garment = ? OR d.lower_garment = ?)`);
      params.push(garment, garment);
    }
    const mode = String(req.query.mode || "").trim();
    if (mode) { where.push(`d.mode = ?`); params.push(mode); }

    const minConf = Number(req.query.minConfidence);
    if (Number.isFinite(minConf) && minConf > 0) {
      where.push("d.confidence >= ?"); params.push(minConf);
    }
    where.push(notFalsePositive("walkins", "d.id"));
    const search = searchClause(req, ["d.camera_key", "d.track_id", "d.id"]);
    if (search) { where.push(search.sql); params.push(...search.params); }

    const sql = `WHERE ${where.join(" AND ")}`;
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM walkin_detection d ${sql}`, params
    );
    const [rows] = await pool.query(
      `SELECT d.id, d.camera_key, d.track_id, d.raw_track_id, d.detected_at,
              d.bbox, d.confidence, d.upper_garment, d.lower_garment,
              d.face_quality, d.mode,
              m.s3_key, m.size_bytes, m.content_type, m.id AS asset_id,
              fm.s3_key AS face_s3_key
         FROM walkin_detection d
         LEFT JOIN media_asset m  ON m.id  = d.crop_asset_id
         LEFT JOIN media_asset fm ON fm.id = d.face_asset_id
         ${sql} ORDER BY ${orderBy(req, {
           detectedAt: "d.detected_at", confidence: "d.confidence", camera: "d.camera_key",
         }, "d.detected_at DESC")} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // Colour chips for the page in one query rather than N.
    const ids = rows.map((r) => r.id);
    const byDetection = new Map();
    if (ids.length) {
      const [colourRows] = await pool.query(
        `SELECT detection_id, region, name, percentage, rgb
           FROM walkin_colour WHERE detection_id IN (?)
          ORDER BY percentage DESC NULLS LAST`,
        [ids]
      );
      for (const c of colourRows) {
        if (!byDetection.has(c.detection_id)) byDetection.set(c.detection_id, []);
        byDetection.get(c.detection_id).push({
          region: c.region, name: c.name,
          percentage: c.percentage == null ? null : Number(c.percentage),
          rgb: c.rgb || null,
        });
      }
    }
    const withUrls = await withMedia(rows);
    res.json({
      total: Number(total || 0), page, pageSize,
      rows: withUrls.map((r) => ({ ...r, colours: byDetection.get(r.id) || [] })),
    });
  } catch (e) {
    console.error("inference walkins", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Distinct colours/garments available, for populating filter dropdowns. */
router.get("/facets", async (_req, res) => {
  try {
    const [colours] = await pool.query(
      `SELECT region, name, COUNT(DISTINCT detection_id) AS n,
              (ARRAY_AGG(rgb ORDER BY percentage DESC))[1] AS rgb
         FROM walkin_colour GROUP BY region, name ORDER BY region, n DESC`
    );
    const [garments] = await pool.query(
      `SELECT DISTINCT upper_garment AS name FROM walkin_detection WHERE upper_garment IS NOT NULL
        UNION SELECT DISTINCT lower_garment FROM walkin_detection WHERE lower_garment IS NOT NULL`
    );
    res.json({ colours, garments: garments.map((g) => g.name).filter(Boolean) });
  } catch (e) {
    console.error("inference facets", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Unified cross-service timeline. */
router.get("/timeline", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "t.occurred_at", "t.camera_key");
    const where = f.sql ? [f.sql.replace(/^WHERE /, "")] : [];
    const params = [...f.params];
    const service = String(req.query.service || "").trim();
    if (service) { where.push("t.service = ?"); params.push(service); }
    // The timeline view spans all services, so match on (service, id) pairs.
    where.push(`NOT EXISTS (SELECT 1 FROM false_positive_detection f
                             WHERE f.module = t.service AND f.detection_id = t.id)`);
    const sql = `WHERE ${where.join(" AND ")}`;
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM inference_timeline t ${sql}`,
      rowsSql: `SELECT t.service, t.id, t.camera_key, t.occurred_at, t.dwell_seconds, t.global_id,
                       m.s3_key, m.content_type, m.id AS asset_id
                  FROM inference_timeline t LEFT JOIN media_asset m ON m.id = t.asset_id
                  ${sql} ORDER BY t.occurred_at DESC LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference timeline", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Fresh presigned URL for one asset (lightbox / video player). */
router.get("/media/:assetId", async (req, res) => {
  try {
    const id = Number(req.params.assetId);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_request" });
    const [[row]] = await pool.query(
      `SELECT s3_key, content_type FROM media_asset WHERE id = ?`, [id]
    );
    if (!row) return res.status(404).json({ error: "not_found" });
    const url = await presignGet(row.s3_key, { downloadName: row.s3_key.split("/").pop() });
    if (String(req.query.redirect) === "1") return res.redirect(302, url);
    res.json({ url, contentType: row.content_type, expiresInSeconds: 900 });
  } catch (e) {
    console.error("inference media", e);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * Cached video poster frame. Authenticated by a short-lived HMAC in the query
 * string rather than a bearer token, because <img src> cannot set headers.
 * Exported as its OWN router and mounted ahead of the authenticated one in
 * index.js, so requireAuth never sees it.
 */
const posterRouter = express.Router();
posterRouter.get("/:assetId", async (req, res) => {
  // Every other handler in this file is wrapped; this one generates media on
  // demand, so it has the most ways to fail (DB, S3, ffmpeg, disk). Without the
  // wrapper a rejection here escapes an async handler, which Express 4 does not
  // forward - the request hangs until the client times out and the process logs
  // an unhandled rejection.
  try {
    const id = Number(req.params.assetId);
    if (!Number.isFinite(id)) return res.status(400).end();
    // Signature first: nothing below runs for an unsigned caller.
    if (!verifyPosterUrl(id, req.query.e, req.query.s)) return res.status(403).end();

    // A miss is normal, not an error: thumbnails are made on first view so the
    // 5.6 GB chef_absence backlog is never fetched wholesale.
    if (!hasPoster(id)) {
      const [[asset]] = await pool.query(
        `SELECT s3_key, size_bytes, content_type FROM media_asset WHERE id = ?`,
        [id]
      );
      if (!asset) return res.status(404).end();
      const made = await ensurePoster(id, asset.s3_key, {
        headBytes: fetchBytesFor({
          sizeBytes: asset.size_bytes,
          isImage: String(asset.content_type || "").startsWith("image"),
        }),
      });
      if (!made) return res.status(404).end();
    }

    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "private, max-age=3600");
    const stream = fs.createReadStream(posterFile(id));
    // The file can vanish between hasPoster() and the open (cache eviction, a
    // manual clear). Headers may already be sent by then, so the only safe move
    // is to destroy the response rather than try to write a status onto it.
    stream.on("error", () => {
      if (!res.headersSent) res.status(404).end();
      else res.destroy();
    });
    stream.pipe(res);
  } catch (e) {
    console.error("inference poster", e);
    if (!res.headersSent) res.status(500).end();
  }
});

/**
 * Browser-playable rendition of a clip the browser cannot decode.
 *
 * Mounted outside requireAuth for the same reason the poster route is: a
 * <video> element cannot send an Authorization header, so the HMAC on the URL
 * is the access control. It is scoped to one asset id and expires, and is no
 * weaker than the S3 presigned URL the player was previously handed directly.
 *
 * A cached clip is served with range support so the scrubber works. A miss is
 * transcoded straight into the response as fragmented mp4, which starts playing
 * in about two seconds rather than after the ~35 s the full encode takes.
 */
const clipRouter = express.Router();
clipRouter.get("/:assetId", async (req, res) => {
  try {
    const id = Number(req.params.assetId);
    if (!Number.isFinite(id)) return res.status(400).end();
    if (!verifyClipUrl(id, req.query.e, req.query.s)) return res.status(403).end();

    // Cache hit: a plain file, so honour Range and let the player seek.
    if (hasClip(id)) {
      const file = clipFile(id);
      const { size } = fs.statSync(file);
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
      res.set("Content-Type", "video/mp4");
      res.set("Accept-Ranges", "bytes");
      res.set("Cache-Control", "private, max-age=3600");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (!(start <= end && start < size)) {
          return res.status(416).set("Content-Range", `bytes */${size}`).end();
        }
        res.status(206);
        res.set("Content-Range", `bytes ${start}-${end}/${size}`);
        res.set("Content-Length", String(end - start + 1));
        const stream = fs.createReadStream(file, { start, end });
        stream.on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); });
        return stream.pipe(res);
      }
      res.set("Content-Length", String(size));
      const stream = fs.createReadStream(file);
      stream.on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); });
      return stream.pipe(res);
    }

    const [[asset]] = await pool.query(
      `SELECT s3_key, content_type FROM media_asset WHERE id = ?`, [id]
    );
    if (!asset) return res.status(404).end();

    const srcUrl = await presignGet(asset.s3_key);
    const codec = await probeCodec(id, srcUrl);

    // Fragmented mp4 has no length and cannot be seeked while it is being made.
    // Saying so keeps the player from asking, and the next view is the cached
    // file above, which can.
    res.set("Content-Type", "video/mp4");
    res.set("Accept-Ranges", "none");
    res.set("Cache-Control", "no-store");
    return streamTranscode({
      assetId: id,
      srcUrl,
      codec,
      res,
      onError: (status, message) => {
        console.warn(`[clip ${id}] ${message}`);
        if (!res.headersSent) res.status(status).end();
        else res.destroy();
      },
    });
  } catch (e) {
    console.error("inference clip", e);
    if (!res.headersSent) res.status(500).end();
  }
});

/**
 * Every media object, including the ~390 walk-in crops and face crops that
 * have no JSONL metadata and therefore appear in no service table. Without
 * this, most of what the cameras captured would be invisible in the UI.
 */
router.get("/media", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "m.captured_at", "m.camera_key");
    const where = f.sql ? [f.sql.replace(/^WHERE /, "")] : [];
    const params = [...f.params];

    const service = String(req.query.service || "").trim();
    if (service) { where.push("m.service = ?"); params.push(service); }
    const artefact = String(req.query.artefact || "").trim();
    if (artefact) { where.push("m.artefact_type = ?"); params.push(artefact); }
    const kind = String(req.query.kind || "").trim();
    if (kind === "image") where.push("m.content_type LIKE 'image/%'");
    if (kind === "video") where.push("m.content_type LIKE 'video/%'");
    if (String(req.query.orphans || "") === "1") {
      // Crops with no detection row - the metadata gap made visible.
      where.push(`NOT EXISTS (SELECT 1 FROM walkin_detection d
                               WHERE d.crop_asset_id = m.id OR d.face_asset_id = m.id)`);
      where.push("m.service = 'walkins'");
    }
    const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM media_asset m ${sql}`,
      rowsSql: `SELECT m.id, m.id AS asset_id, m.camera_key, m.service, m.artefact_type, m.content_type,
                       m.size_bytes, m.captured_at, m.folder_date, m.s3_key
                  FROM media_asset m ${sql}
                 ORDER BY m.captured_at DESC NULLS LAST, m.id DESC
                 LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference media list", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Activity buckets for the dashboard charts. */
router.get("/stats", async (req, res) => {
  try {
    // Accepts an explicit from/to range (what the dashboard's date filter
    // sends) and falls back to a rolling window when none is given.
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));

    const where = [];
    const params = [];
    if (dateRe.test(from)) { where.push("occurred_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')"); params.push(from); }
    if (dateRe.test(to)) { where.push("occurred_at < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')"); params.push(to); }
    if (!where.length) { where.push("occurred_at > now() - (?::int * interval '1 day')"); params.push(days); }
    // Suppressed detections never appear in any chart.
    where.push(`NOT EXISTS (SELECT 1 FROM false_positive_detection f
                             WHERE f.module = inference_timeline.service
                               AND f.detection_id = inference_timeline.id)`);
    const rangeSql = `WHERE ${where.join(" AND ")}`;

    const [byDay] = await pool.query(
      `SELECT (occurred_at AT TIME ZONE 'Asia/Kolkata')::date AS day, service, COUNT(*) AS n
         FROM inference_timeline ${rangeSql}
        GROUP BY 1, 2 ORDER BY 1`,
      params
    );
    const [byHour] = await pool.query(
      `SELECT EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'Asia/Kolkata')::int AS hour, COUNT(*) AS n
         FROM inference_timeline ${rangeSql} GROUP BY 1 ORDER BY 1`,
      params
    );
    const [byCamera] = await pool.query(
      `SELECT service, camera_key, COUNT(*) AS n, MAX(occurred_at) AS latest
         FROM inference_timeline ${rangeSql} GROUP BY 1, 2 ORDER BY n DESC`,
      params
    );
    res.json({ byDay, byHour, byCamera });
  } catch (e) {
    console.error("inference stats", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Kitchen unattended. Empty until the on-prem service starts writing. */
router.get("/kitchen-unattended", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "k.started_at", "k.camera_key");
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    const params = [...f.params];
    w.push(notFalsePositive("kitchen_unattended", "k.id"));
    const search = searchClause(req, ["k.camera_key", "k.id"]);
    if (search) { w.push(search.sql); params.push(...search.params); }
    const sql = `WHERE ${w.join(" AND ")}`;
    const ord = orderBy(req, {
      detectedAt: "k.started_at", duration: "k.duration_seconds", camera: "k.camera_key",
    }, "k.started_at DESC");
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM kitchen_unattended_event k ${sql}`,
      rowsSql: `SELECT k.id, k.camera_key, k.started_at, k.duration_seconds AS dwell_seconds,
                       m.s3_key, m.size_bytes, m.content_type, m.id AS asset_id
                  FROM kitchen_unattended_event k LEFT JOIN media_asset m ON m.id = k.asset_id
                  ${sql} ORDER BY ${ord} LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference kitchen-unattended", e);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------------------------------------------------------------------------
// chef_absence
//
// Three artefact streams, so three list endpoints rather than one gallery:
// absence clips, kitchen intrusions, and the people seen in the kitchen.
//
// CLIP LENGTH IS NOT ABSENCE DURATION. The service is documented as recording
// only after 60 s of an empty kitchen, but 150 of 151 clips in the bucket are
// shorter than that (median ~1 s) because the writer tags every clip 15 fps
// while storing only the frames the detector emitted. clip_seconds is
// therefore returned as clipSeconds - the length of the recording - and no KPI
// is derived from it. See sql/chef_absence.sql.
// ---------------------------------------------------------------------------

/** Absence incidents: one row per unattended clip. */
router.get("/chef-absence", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "c.started_at", "c.camera_key");
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    const params = [...f.params];
    w.push(notFalsePositive("chef_absence", "c.id"));
    const search = searchClause(req, ["c.camera_key", "c.id"]);
    if (search) { w.push(search.sql); params.push(...search.params); }
    const sql = `WHERE ${w.join(" AND ")}`;
    const ord = orderBy(req, {
      detectedAt: "c.started_at", camera: "c.camera_key", clip: "c.clip_seconds",
    }, "c.started_at DESC");
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM chef_absence_incident c ${sql}`,
      rowsSql: `SELECT c.id, c.camera_key, c.started_at, c.frame_count,
                       c.clip_seconds AS "clipSeconds",
                       m.s3_key, m.size_bytes, m.content_type, m.id AS asset_id
                  FROM chef_absence_incident c LEFT JOIN media_asset m ON m.id = c.asset_id
                  ${sql} ORDER BY ${ord} LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference chef-absence", e);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * Kitchen intrusions: one row per snapshot.
 *
 * The filename carries no camera id and nothing else in the artefact set
 * supplies one, so a camera filter is deliberately NOT applied here - it would
 * silently return nothing rather than "camera unknown".
 */
router.get("/chef-absence/intrusions", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters({ query: { from: req.query.from, to: req.query.to } }, "k.occurred_at", "k.camera_key");
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    const params = [...f.params];
    w.push(notFalsePositive("chef_intrusion", "k.id"));
    const sql = w.length ? `WHERE ${w.join(" AND ")}` : "";
    const ord = orderBy(req, { detectedAt: "k.occurred_at", seq: "k.daily_seq" }, "k.occurred_at DESC");
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM kitchen_intrusion k ${sql}`,
      rowsSql: `SELECT k.id, k.camera_key, k.occurred_at, k.daily_seq AS "dailySeq",
                       m.s3_key, m.size_bytes, m.content_type, m.id AS asset_id
                  FROM kitchen_intrusion k LEFT JOIN media_asset m ON m.id = k.asset_id
                  ${sql} ORDER BY ${ord} LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference chef intrusions", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** People seen in the kitchen, with their classification and crop. */
router.get("/chef-absence/detections", async (req, res) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const f = buildFilters(req, "d.detected_at", "d.camera_key");
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    const params = [...f.params];
    w.push(notFalsePositive("chef_detection", "d.id"));

    const status = String(req.query.status || "").trim();
    if (status) { w.push(`d.status_chef = ?`); params.push(status); }
    // "Who is not wearing a cap" is the question this module exists to answer,
    // so it is a first-class filter rather than something to eyeball.
    if (String(req.query.noCap || "") === "1") w.push(`d.cap_garment IS NULL`);

    const search = searchClause(req, ["d.camera_key", "d.status_chef", "d.upper_garment", "d.track_id"]);
    if (search) { w.push(search.sql); params.push(...search.params); }
    const sql = `WHERE ${w.join(" AND ")}`;
    const ord = orderBy(req, {
      detectedAt: "d.detected_at", camera: "d.camera_key",
      status: "d.status_chef", confidence: "d.confidence",
    }, "d.detected_at DESC");

    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM chef_detection d ${sql}`,
      rowsSql: `SELECT d.id, d.camera_key, d.detected_at, d.track_id,
                       d.status_chef AS "statusChef", d.confidence,
                       d.upper_garment AS "upperGarment", d.lower_garment AS "lowerGarment",
                       d.cap_garment AS "capGarment",
                       (d.cap_garment IS NOT NULL) AS "hasCap",
                       m.s3_key, m.size_bytes, m.content_type, m.id AS asset_id
                  FROM chef_detection d LEFT JOIN media_asset m ON m.id = d.crop_asset_id
                  ${sql} ORDER BY ${ord} LIMIT ? OFFSET ?`,
      params, page, pageSize, offset,
    });
  } catch (e) {
    console.error("inference chef detections", e);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * The chef_absence KPI block.
 *
 * Built from the counts and classifications that are trustworthy - incidents,
 * intrusions, who was in the kitchen, and whether they wore headwear. Absence
 * duration is absent by design; see the note at the top of this section.
 */
router.get("/chef-absence/kpis", async (req, res) => {
  try {
    const inc = buildFilters(req, "c.started_at", "c.camera_key");
    const det = buildFilters(req, "d.detected_at", "d.camera_key");
    const intr = buildFilters({ query: { from: req.query.from, to: req.query.to } }, "k.occurred_at", "k.camera_key");

    const incWhere = `WHERE ${[inc.sql.replace(/^WHERE /, ""), notFalsePositive("chef_absence", "c.id")].filter(Boolean).join(" AND ")}`;
    const detWhere = `WHERE ${[det.sql.replace(/^WHERE /, ""), notFalsePositive("chef_detection", "d.id")].filter(Boolean).join(" AND ")}`;
    const intrWhere = `WHERE ${[intr.sql.replace(/^WHERE /, ""), notFalsePositive("chef_intrusion", "k.id")].filter(Boolean).join(" AND ")}`;

    const [[incidents]] = await pool.query(
      `SELECT COUNT(*) AS "total",
              COUNT(DISTINCT c.camera_key) AS "cameras",
              MAX(c.started_at) AS "latest",
              MIN(c.clip_seconds) AS "minClip",
              MAX(c.clip_seconds) AS "maxClip",
              AVG(c.clip_seconds)::numeric(10,2) AS "avgClip",
              COUNT(*) FILTER (WHERE c.clip_seconds >= 60) AS "clipsOver60s"
         FROM chef_absence_incident c ${incWhere}`,
      inc.params
    );
    const [[people]] = await pool.query(
      `SELECT COUNT(*) AS "total",
              COUNT(*) FILTER (WHERE d.status_chef = 'chef')         AS "chef",
              COUNT(*) FILTER (WHERE d.status_chef = 'non-chef')     AS "nonChef",
              COUNT(*) FILTER (WHERE d.status_chef = 'housekeeping') AS "housekeeping",
              COUNT(*) FILTER (WHERE d.cap_garment IS NOT NULL)      AS "withCap",
              COUNT(*) FILTER (WHERE d.status_chef = 'chef' AND d.cap_garment IS NOT NULL) AS "chefWithCap",
              MAX(d.detected_at) AS "latest"
         FROM chef_detection d ${detWhere}`,
      det.params
    );
    const [[intrusions]] = await pool.query(
      `SELECT COUNT(*) AS "total", MAX(k.occurred_at) AS "latest"
         FROM kitchen_intrusion k ${intrWhere}`,
      intr.params
    );
    const [peak] = await pool.query(
      `SELECT EXTRACT(HOUR FROM c.started_at AT TIME ZONE 'Asia/Kolkata')::int AS "hour",
              COUNT(*) AS "n"
         FROM chef_absence_incident c ${incWhere}
        GROUP BY 1 ORDER BY "n" DESC, "hour" ASC LIMIT 1`,
      inc.params
    );

    const chefTotal = Number(people.chef || 0);
    const chefCapped = Number(people.chefWithCap || 0);

    res.json({
      module: "chef_absence",
      incidents: Number(incidents.total || 0),
      cameras: Number(incidents.cameras || 0),
      latestIncident: incidents.latest,
      intrusions: Number(intrusions.total || 0),
      latestIntrusion: intrusions.latest,
      peopleSeen: Number(people.total || 0),
      chef: chefTotal,
      nonChef: Number(people.nonChef || 0),
      housekeeping: Number(people.housekeeping || 0),
      // Food-hygiene compliance: the share of chef sightings with headwear
      // detected. Null rather than 0 when no chef was seen, so the UI can say
      // "no data" instead of implying total non-compliance.
      capCompliancePct: chefTotal ? Number(((chefCapped / chefTotal) * 100).toFixed(1)) : null,
      chefWithCap: chefCapped,
      chefWithoutCap: chefTotal - chefCapped,
      peakHour: peak.length ? Number(peak[0].hour) : null,
      peakHourCount: peak.length ? Number(peak[0].n) : 0,
      // Recording length, reported for completeness only.
      clip: {
        minSeconds: incidents.minClip == null ? null : Number(incidents.minClip),
        maxSeconds: incidents.maxClip == null ? null : Number(incidents.maxClip),
        avgSeconds: incidents.avgClip == null ? null : Number(incidents.avgClip),
        over60s: Number(incidents.clipsOver60s || 0),
        isAbsenceDuration: false,
      },
    });
  } catch (e) {
    console.error("inference chef kpis", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Charts for the chef_absence dashboard. */
router.get("/chef-absence/analytics", async (req, res) => {
  try {
    const inc = buildFilters(req, "c.started_at", "c.camera_key");
    const det = buildFilters(req, "d.detected_at", "d.camera_key");
    const intr = buildFilters({ query: { from: req.query.from, to: req.query.to } }, "k.occurred_at", "k.camera_key");

    const incWhere = `WHERE ${[inc.sql.replace(/^WHERE /, ""), notFalsePositive("chef_absence", "c.id")].filter(Boolean).join(" AND ")}`;
    const detWhere = `WHERE ${[det.sql.replace(/^WHERE /, ""), notFalsePositive("chef_detection", "d.id")].filter(Boolean).join(" AND ")}`;
    const intrWhere = `WHERE ${[intr.sql.replace(/^WHERE /, ""), notFalsePositive("chef_intrusion", "k.id")].filter(Boolean).join(" AND ")}`;

    const incLocal = `c.started_at AT TIME ZONE 'Asia/Kolkata'`;
    const detLocal = `d.detected_at AT TIME ZONE 'Asia/Kolkata'`;
    const intrLocal = `k.occurred_at AT TIME ZONE 'Asia/Kolkata'`;

    const [byDay] = await pool.query(
      `SELECT (${incLocal})::date AS "day", COUNT(*) AS "n"
         FROM chef_absence_incident c ${incWhere} GROUP BY 1 ORDER BY 1`, inc.params);
    const [byHour] = await pool.query(
      `SELECT EXTRACT(HOUR FROM ${incLocal})::int AS "hour", COUNT(*) AS "n"
         FROM chef_absence_incident c ${incWhere} GROUP BY 1 ORDER BY 1`, inc.params);
    const [byCamera] = await pool.query(
      `SELECT c.camera_key AS "cameraKey", COUNT(*) AS "n", MAX(c.started_at) AS "latest"
         FROM chef_absence_incident c ${incWhere} GROUP BY 1 ORDER BY "n" DESC`, inc.params);

    // Who was in the kitchen, per day - the mix is the story, not the total.
    const [presenceByDay] = await pool.query(
      `SELECT (${detLocal})::date AS "day",
              COUNT(*) FILTER (WHERE d.status_chef = 'chef')         AS "chef",
              COUNT(*) FILTER (WHERE d.status_chef = 'non-chef')     AS "nonChef",
              COUNT(*) FILTER (WHERE d.status_chef = 'housekeeping') AS "housekeeping"
         FROM chef_detection d ${detWhere} GROUP BY 1 ORDER BY 1`, det.params);

    const [capByStatus] = await pool.query(
      `SELECT COALESCE(d.status_chef, 'unknown') AS "statusChef",
              COUNT(*) AS "total",
              COUNT(*) FILTER (WHERE d.cap_garment IS NOT NULL) AS "withCap"
         FROM chef_detection d ${detWhere} GROUP BY 1 ORDER BY "total" DESC`, det.params);

    const [intrusionsByDay] = await pool.query(
      `SELECT (${intrLocal})::date AS "day", COUNT(*) AS "n"
         FROM kitchen_intrusion k ${intrWhere} GROUP BY 1 ORDER BY 1`, intr.params);
    const [intrusionsByHour] = await pool.query(
      `SELECT EXTRACT(HOUR FROM ${intrLocal})::int AS "hour", COUNT(*) AS "n"
         FROM kitchen_intrusion k ${intrWhere} GROUP BY 1 ORDER BY 1`, intr.params);

    res.json({
      module: "chef_absence",
      byDay, byHour, byCamera,
      presenceByDay, capByStatus,
      intrusionsByDay, intrusionsByHour,
    });
  } catch (e) {
    console.error("inference chef analytics", e);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * Per-module KPI block for a Monitoring page header.
 *
 * Every figure here comes from the same suppressed row set the tables and
 * analytics use, so a thumbs-down moves the KPI, the chart and the table
 * together instead of leaving them disagreeing.
 */
router.get("/kpis/:module", async (req, res) => {
  const m = MODULES[req.params.module];
  if (!m) return res.status(404).json({ error: "unknown_module" });
  try {
    const f = buildFilters(req, m.ts, m.cam);
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    w.push(notFalsePositive(req.params.module, `${m.alias}.id`));
    const where = `WHERE ${w.join(" AND ")}`;
    const A = m.alias;

    // Duration only exists on loitering; confidence only on walk-ins. Selecting
    // NULL keeps one query shape without inventing columns the data lacks.
    const dur = req.params.module === "loitering" ? "l.dwell_seconds"
      : req.params.module === "kitchen_unattended" ? "k.duration_seconds" : "NULL::int";
    const conf = req.params.module === "walkins" ? "d.confidence" : "NULL::numeric";

    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT ${m.cam}) AS cameras,
              MAX(${m.ts}) AS latest,
              MAX(${dur}) AS longest_seconds,
              AVG(${dur})::numeric(10,1) AS avg_seconds,
              AVG(${conf})::numeric(6,3) AS avg_confidence
         FROM ${m.table} ${A} ${where}`,
      f.params
    );
    const [hours] = await pool.query(
      `SELECT EXTRACT(HOUR FROM ${m.ts} AT TIME ZONE 'Asia/Kolkata')::int AS hour, COUNT(*) AS n
         FROM ${m.table} ${A} ${where} GROUP BY 1 ORDER BY n DESC, hour ASC LIMIT 1`,
      f.params
    );
    const [[span]] = await pool.query(
      `SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (MAX(${m.ts}) - MIN(${m.ts}))) / 3600.0))::int AS hours
         FROM ${m.table} ${A} ${where}`,
      f.params
    );
    const total = Number(row.total || 0);
    res.json({
      module: req.params.module,
      total,
      cameras: Number(row.cameras || 0),
      latest: row.latest,
      longestSeconds: row.longest_seconds == null ? null : Number(row.longest_seconds),
      avgSeconds: row.avg_seconds == null ? null : Number(row.avg_seconds),
      avgConfidence: row.avg_confidence == null ? null : Number(row.avg_confidence),
      peakHour: hours.length ? Number(hours[0].hour) : null,
      peakHourCount: hours.length ? Number(hours[0].n) : 0,
      avgPerHour: span && span.hours ? Number((total / Number(span.hours)).toFixed(2)) : null,
    });
  } catch (e) {
    console.error("inference kpis", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Per-module analytics: daily, hourly, per-camera. Same suppression applied. */
router.get("/analytics/:module", async (req, res) => {
  const m = MODULES[req.params.module];
  if (!m) return res.status(404).json({ error: "unknown_module" });
  try {
    const f = buildFilters(req, m.ts, m.cam);
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    w.push(notFalsePositive(req.params.module, `${m.alias}.id`));
    const where = `WHERE ${w.join(" AND ")}`;
    const A = m.alias;
    const local = `${m.ts} AT TIME ZONE 'Asia/Kolkata'`;

    const [byDay] = await pool.query(
      `SELECT (${local})::date AS day, COUNT(*) AS n FROM ${m.table} ${A} ${where} GROUP BY 1 ORDER BY 1`, f.params);
    const [byHour] = await pool.query(
      `SELECT EXTRACT(HOUR FROM ${local})::int AS hour, COUNT(*) AS n FROM ${m.table} ${A} ${where} GROUP BY 1 ORDER BY 1`, f.params);
    const [byCamera] = await pool.query(
      `SELECT ${m.cam} AS camera_key, COUNT(*) AS n, MAX(${m.ts}) AS latest
         FROM ${m.table} ${A} ${where} GROUP BY 1 ORDER BY n DESC`, f.params);
    const [byWeekday] = await pool.query(
      `SELECT EXTRACT(DOW FROM ${local})::int AS weekday, COUNT(*) AS n
         FROM ${m.table} ${A} ${where} GROUP BY 1 ORDER BY 1`, f.params);
    // Day x hour grid for the heatmap.
    const [heatmap] = await pool.query(
      `SELECT EXTRACT(DOW FROM ${local})::int AS weekday,
              EXTRACT(HOUR FROM ${local})::int AS hour, COUNT(*) AS n
         FROM ${m.table} ${A} ${where} GROUP BY 1,2`, f.params);
    res.json({ module: req.params.module, byDay, byHour, byCamera, byWeekday, heatmap });
  } catch (e) {
    console.error("inference analytics", e);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------------------------------------------------------------------------
// Reinforcement feedback
// ---------------------------------------------------------------------------

/**
 * Record a human verdict on a detection.
 *
 * A thumbs-down does NOT delete: the detection, its S3 media and its timestamps
 * are all left intact. Only this side table records the judgement, and read
 * paths filter on it - so the sample survives for retraining and the call is
 * reversible.
 */
router.post("/feedback", async (req, res) => {
  const body = req.body || {};
  const module = String(body.module || "").trim();
  const detectionId = Number(body.detectionId);
  const type = String(body.feedbackType || "").trim();
  // chef_intrusion and chef_detection are separate feedback streams rather
  // than tables in MODULES: a false-positive intrusion snapshot and a
  // misclassified person are different judgements about different rows, so
  // they must not share a suppression namespace with the absence clips.
  if (!MODULES[module] && !FEEDBACK_ONLY_MODULES.has(module)) {
    return res.status(400).json({ error: "bad_request", message: "unknown module" });
  }
  if (!Number.isFinite(detectionId)) {
    return res.status(400).json({ error: "bad_request", message: "detectionId required" });
  }
  if (!["verified", "false_positive"].includes(type)) {
    return res.status(400).json({ error: "bad_request", message: "feedbackType must be verified|false_positive" });
  }
  try {
    await pool.query(
      `INSERT INTO reinforcement_feedback
         (detection_id, module, camera_id, media_url, confidence, feedback_type, feedback_by, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (module, detection_id) DO UPDATE SET
         feedback_type = EXCLUDED.feedback_type,
         feedback_by   = EXCLUDED.feedback_by,
         remarks       = EXCLUDED.remarks,
         feedback_at   = now()`,
      [
        detectionId, module,
        body.cameraId || null,
        body.mediaKey || null,           // s3 key, not a presigned link - those expire
        body.confidence == null ? null : Number(body.confidence),
        type,
        (req.user && (req.user.email || req.user.sub)) || null,
        body.remarks || null,
      ]
    );
    res.json({ ok: true, module, detectionId, feedbackType: type });
  } catch (e) {
    console.error("inference feedback", e);
    res.status(500).json({ error: "server_error", message: e.message });
  }
});

/** Remove a verdict (undo). The detection was never modified, so this restores it. */
router.delete("/feedback/:module/:detectionId", async (req, res) => {
  try {
    const [r] = await pool.query(
      `DELETE FROM reinforcement_feedback WHERE module = ? AND detection_id = ?`,
      [req.params.module, Number(req.params.detectionId)]
    );
    res.json({ ok: true, removed: r.affectedRows || 0 });
  } catch (e) {
    console.error("inference feedback delete", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Verdicts for a set of detections, so the table can badge rows. */
router.get("/feedback", async (req, res) => {
  try {
    const module = String(req.query.module || "").trim();
    const [rows] = await pool.query(
      module
        ? `SELECT module, detection_id, feedback_type, feedback_by, feedback_at, remarks
             FROM reinforcement_feedback WHERE module = ? ORDER BY feedback_at DESC LIMIT 2000`
        : `SELECT module, detection_id, feedback_type, feedback_by, feedback_at, remarks
             FROM reinforcement_feedback ORDER BY feedback_at DESC LIMIT 2000`,
      module ? [module] : []
    );
    res.json({ rows });
  } catch (e) {
    console.error("inference feedback list", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Suppressed detections, for an administrator review screen. */
router.get("/feedback/false-positives", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM reinforcement_feedback WHERE feedback_type='false_positive'
        ORDER BY feedback_at DESC LIMIT 500`
    );
    res.json({ total: rows.length, rows });
  } catch (e) {
    console.error("inference false positives", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** CSV export of a module's current (filtered, suppressed) rows. */
router.get("/export/:module.csv", async (req, res) => {
  const m = MODULES[req.params.module];
  if (!m) return res.status(404).json({ error: "unknown_module" });
  try {
    const f = buildFilters(req, m.ts, m.cam);
    const w = [f.sql.replace(/^WHERE /, "")].filter(Boolean);
    w.push(notFalsePositive(req.params.module, `${m.alias}.id`));
    const where = `WHERE ${w.join(" AND ")}`;
    const extra =
      req.params.module === "loitering" ? ", l.dwell_seconds AS duration_seconds, l.global_id"
      : req.params.module === "kitchen_unattended" ? ", k.duration_seconds"
      : req.params.module === "walkins" ? ", d.track_id, d.confidence, d.upper_garment, d.lower_garment"
      : req.params.module === "after_hours" ? ", s.tag"
      // clip_seconds is the recording length, not the absence duration - the
      // column name says so rather than letting a spreadsheet assume otherwise.
      : req.params.module === "chef_absence" ? ", c.frame_count, c.clip_seconds AS clip_length_seconds"
      : "";
    const [rows] = await pool.query(
      `SELECT ${m.alias}.id, ${m.cam} AS camera, ${m.ts} AS detected_at${extra}
         FROM ${m.table} ${m.alias} ${where} ORDER BY ${m.ts} DESC LIMIT 10000`,
      f.params
    );
    sendCsv(res, `${req.params.module}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  } catch (e) {
    console.error("inference export", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Manual ingest trigger (the scheduler also runs on an interval). */
router.post("/ingest", async (_req, res) => {
  try {
    res.json({ ok: true, ...(await runIngest(pool)) });
  } catch (e) {
    console.error("inference ingest", e);
    res.status(500).json({ error: "server_error", message: e.message });
  }
});

module.exports = {
  inferenceRouter: router,
  inferencePosterRouter: posterRouter,
  inferenceClipRouter: clipRouter,
};
