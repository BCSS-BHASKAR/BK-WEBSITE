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
 */
function buildFilters(req, tsCol, cameraCol) {
  const where = [];
  const params = [];
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  if (dateRe.test(from)) {
    where.push(`${tsCol} >= (?::date AT TIME ZONE 'Asia/Kolkata')`);
    params.push(from);
  }
  if (dateRe.test(to)) {
    where.push(`${tsCol} < ((?::date + 1) AT TIME ZONE 'Asia/Kolkata')`);
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
    const f = (ts) => buildFilters(req, ts, "'x'");
    const a = f("captured_at");
    const [[counts]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM after_hours_sighting) AS after_hours,
         (SELECT COUNT(*) FROM loitering_event)      AS loitering,
         (SELECT COUNT(*) FROM intrusion_event)      AS intrusion,
         (SELECT COUNT(*) FROM walkin_detection)     AS walkins,
         (SELECT COUNT(*) FROM media_asset)          AS assets,
         (SELECT COALESCE(SUM(size_bytes),0) FROM media_asset) AS bytes`,
      a.params.slice(0, 0)
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
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM after_hours_sighting s ${f.sql}`,
      rowsSql: `SELECT s.id, s.camera_key, s.captured_at, s.tag, s.global_id, s.session_id,
                       m.s3_key, m.size_bytes, m.content_type
                  FROM after_hours_sighting s JOIN media_asset m ON m.id = s.asset_id
                  ${f.sql} ORDER BY s.captured_at DESC LIMIT ? OFFSET ?`,
      params: f.params, page, pageSize, offset,
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
    const extra = [...f.params];
    let sql = f.sql;
    const minDwell = Number(req.query.minDwell);
    if (Number.isFinite(minDwell) && minDwell > 0) {
      sql = sql ? `${sql} AND l.dwell_seconds >= ?` : `WHERE l.dwell_seconds >= ?`;
      extra.push(minDwell);
    }
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM loitering_event l ${sql}`,
      rowsSql: `SELECT l.id, l.stream AS camera_key, l.started_at, l.dwell_seconds,
                       l.global_id, l.session_id, m.s3_key, m.size_bytes, m.content_type
                  FROM loitering_event l JOIN media_asset m ON m.id = l.asset_id
                  ${sql} ORDER BY l.started_at DESC LIMIT ? OFFSET ?`,
      params: extra, page, pageSize, offset,
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
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM intrusion_event i ${f.sql}`,
      rowsSql: `SELECT i.id, i.camera_key, i.occurred_at, m.s3_key, m.size_bytes, m.content_type
                  FROM intrusion_event i LEFT JOIN media_asset m ON m.id = i.asset_id
                  ${f.sql} ORDER BY i.occurred_at DESC LIMIT ? OFFSET ?`,
      params: f.params, page, pageSize, offset,
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

    const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM walkin_detection d ${sql}`, params
    );
    const [rows] = await pool.query(
      `SELECT d.id, d.camera_key, d.track_id, d.raw_track_id, d.detected_at,
              d.bbox, d.confidence, d.upper_garment, d.lower_garment,
              d.face_quality, d.mode,
              m.s3_key, m.size_bytes, m.content_type,
              fm.s3_key AS face_s3_key
         FROM walkin_detection d
         LEFT JOIN media_asset m  ON m.id  = d.crop_asset_id
         LEFT JOIN media_asset fm ON fm.id = d.face_asset_id
         ${sql} ORDER BY d.detected_at DESC LIMIT ? OFFSET ?`,
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
    const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    await listEndpoint(res, {
      countSql: `SELECT COUNT(*) AS total FROM inference_timeline t ${sql}`,
      rowsSql: `SELECT t.service, t.id, t.camera_key, t.occurred_at, t.dwell_seconds, t.global_id,
                       m.s3_key, m.content_type
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

/** Manual ingest trigger (the scheduler also runs on an interval). */
router.post("/ingest", async (_req, res) => {
  try {
    res.json({ ok: true, ...(await runIngest(pool)) });
  } catch (e) {
    console.error("inference ingest", e);
    res.status(500).json({ error: "server_error", message: e.message });
  }
});

module.exports = { inferenceRouter: router };
