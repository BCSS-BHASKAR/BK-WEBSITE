"use strict";

// Ingester: discovers objects under uploads/ and loads them into PostgreSQL.
//
// IDEMPOTENCY IS THE WHOLE GAME HERE.
// The JSONL sidecars (detections.jsonl, intrusion_events_*.jsonl) are
// append-only files that get RE-UPLOADED IN FULL every time they grow, under
// the same key. So a pass must be safe to repeat: every write is an upsert on
// a natural key, never on line number or object version.
//
//   intrusion -> (camera_key, occurred_at)
//   walkins   -> (camera_key, track_id, detected_at)
//   media     -> (s3_key)
//
// Media objects are ingested before sidecars so the JSONL rows can resolve
// their crop/snapshot asset by basename.

const {
  parseKey,
  contentTypeFor,
  parseAfterHoursFrame,
  parseLoiteringEvent,
  parseIntrusionSnapshot,
  parseWalkinCrop,
  parseIntrusionRecord,
  parseWalkinRecord,
} = require("./inferenceParsers");
const { listObjects, getObjectText, PREFIX } = require("./inferenceS3");
const { generatePoster, hasPoster } = require("./inferencePosters");

const SIDECAR_RE = /\.jsonl$/i;

function log(...args) {
  console.log("[inference-ingest]", ...args);
}

/**
 * Render an int array as a Postgres array literal.
 *
 * db.js keeps mysql2 semantics, where an Array parameter means "expand this
 * into a comma-separated list" for `IN (?)`. Passing rgb=[128,128,128] straight
 * through would therefore become three placeholders and blow up with
 * "INSERT has more expressions than target columns". A literal keeps it one
 * value bound to the integer[] column.
 */
function toPgIntArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const nums = arr.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  return nums.length ? `{${nums.join(",")}}` : null;
}

/** Upsert a media_asset row, returning its id. */
async function upsertAsset(pool, o, meta) {
  const [res] = await pool.query(
    `INSERT INTO media_asset
       (s3_key, service, artefact_type, camera_key, captured_at, folder_date,
        size_bytes, content_type, etag, last_modified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (s3_key) DO UPDATE SET
       camera_key    = COALESCE(EXCLUDED.camera_key, media_asset.camera_key),
       captured_at   = COALESCE(EXCLUDED.captured_at, media_asset.captured_at),
       size_bytes    = EXCLUDED.size_bytes,
       etag          = EXCLUDED.etag,
       last_modified = EXCLUDED.last_modified
     RETURNING id`,
    [
      o.Key,
      meta.service,
      meta.artefactType,
      meta.cameraKey || null,
      meta.capturedAt || null,
      meta.folderDate || null,
      o.Size == null ? null : Number(o.Size),
      contentTypeFor(meta.filename),
      o.ETag ? String(o.ETag).replace(/"/g, "") : null,
      o.LastModified || null,
    ]
  );
  return res.insertId;
}

async function noteCamera(pool, service, cameraKey) {
  if (!cameraKey) return;
  await pool.query(
    `INSERT INTO inference_camera (service, camera_key)
     VALUES (?, ?) ON CONFLICT (service, camera_key) DO NOTHING`,
    [service, cameraKey]
  );
}

/**
 * Pass 1 - media objects. Builds the basename -> asset_id map the sidecar pass
 * needs, and records the sidecar keys to process afterwards.
 */
async function ingestMedia(pool, { since = null } = {}) {
  const sidecars = [];
  const videoAssets = [];
  const cropIndex = new Map(); // basename -> asset id
  const snapshotIndex = new Map();
  let seen = 0;
  let assets = 0;

  for await (const o of listObjects({ prefix: PREFIX, startAfter: since })) {
    seen++;
    const k = parseKey(o.Key);
    if (!k) continue; // _healthcheck and anything else non-conforming

    if (SIDECAR_RE.test(k.filename)) {
      sidecars.push({ key: o.Key, etag: o.ETag, ...k });
      continue;
    }

    const t = `${k.service}/${k.artefactType}`;
    let parsed = null;
    let cameraKey = null;
    let capturedAt = null;

    if (t === "after_hours/frames") {
      parsed = parseAfterHoursFrame(k.filename);
      if (parsed) ({ cameraKey, capturedAt } = parsed);
    } else if (t === "loitering/events") {
      parsed = parseLoiteringEvent(k.filename);
      if (parsed) { cameraKey = parsed.stream; capturedAt = parsed.startedAt; }
    } else if (t === "intrusion/snapshots") {
      parsed = parseIntrusionSnapshot(k.filename);
      if (parsed) ({ cameraKey, capturedAt } = parsed);
    } else if (k.service === "walkins") {
      parsed = parseWalkinCrop(k.filename);
      // No camera id in a crop filename - it only arrives via the JSONL join.
      if (parsed) capturedAt = parsed.capturedAt;
    }
    if (!parsed) continue;

    const assetId = await upsertAsset(pool, o, {
      service: k.service,
      artefactType: k.artefactType,
      folderDate: k.folderDate,
      filename: k.filename,
      cameraKey,
      capturedAt,
    });
    assets++;
    await noteCamera(pool, k.service, cameraKey);

    // Videos need a poster frame or the UI shows a black rectangle.
    if (contentTypeFor(k.filename).startsWith("video")) videoAssets.push({ assetId, key: o.Key });

    const base = k.filename.split("/").pop();
    if (k.service === "walkins") cropIndex.set(base, assetId);
    if (t === "intrusion/snapshots") snapshotIndex.set(base, assetId);

    // Service tables for the two sidecar-less services.
    if (t === "after_hours/frames") {
      await pool.query(
        `INSERT INTO after_hours_sighting
           (camera_key, captured_at, tag, global_id, session_id, asset_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (asset_id) DO UPDATE SET
           camera_key = EXCLUDED.camera_key, captured_at = EXCLUDED.captured_at,
           tag = EXCLUDED.tag, global_id = EXCLUDED.global_id,
           session_id = EXCLUDED.session_id`,
        [parsed.cameraKey, parsed.capturedAt, parsed.tag, parsed.globalId, parsed.sessionId, assetId]
      );
    } else if (t === "loitering/events") {
      await pool.query(
        `INSERT INTO loitering_event
           (stream, global_id, session_id, dwell_seconds, started_at, asset_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (asset_id) DO UPDATE SET
           stream = EXCLUDED.stream, global_id = EXCLUDED.global_id,
           session_id = EXCLUDED.session_id, dwell_seconds = EXCLUDED.dwell_seconds,
           started_at = EXCLUDED.started_at`,
        [parsed.stream, parsed.globalId, parsed.sessionId, parsed.dwellSeconds, parsed.startedAt, assetId]
      );
    }
  }

  return { seen, assets, sidecars, cropIndex, snapshotIndex, videoAssets };
}

/** Pass 2a - intrusion sidecars. Upsert on (camera_key, occurred_at). */
async function ingestIntrusionLog(pool, key, snapshotIndex) {
  const text = await getObjectText(key);
  let rows = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const rec = parseIntrusionRecord(line);
    if (!rec) continue;
    // image_path is relative to the on-prem captures root, so only the
    // basename is usable; the real S3 key lives under snapshots/<date>/.
    const assetId = rec.imageBasename ? snapshotIndex.get(rec.imageBasename) || null : null;
    await pool.query(
      `INSERT INTO intrusion_event (camera_key, occurred_at, asset_id, source_key)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (camera_key, occurred_at) DO UPDATE SET
         asset_id   = COALESCE(EXCLUDED.asset_id, intrusion_event.asset_id),
         source_key = EXCLUDED.source_key`,
      [rec.cameraKey, rec.occurredAt, assetId, key]
    );
    await noteCamera(pool, "intrusion", rec.cameraKey);
    rows++;
  }
  return rows;
}

/** Pass 2b - walkins detections. Upsert on (camera_key, track_id, detected_at). */
async function ingestWalkinLog(pool, key, cropIndex) {
  const text = await getObjectText(key);
  let rows = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const rec = parseWalkinRecord(line);
    if (!rec) continue;

    const cropId = rec.cropBasename ? cropIndex.get(rec.cropBasename) || null : null;
    const faceId = rec.faceBasename ? cropIndex.get(rec.faceBasename) || null : null;

    const [res] = await pool.query(
      `INSERT INTO walkin_detection
         (camera_key, track_id, raw_track_id, detected_at, bbox, confidence,
          upper_garment, lower_garment, face_quality, mode,
          crop_asset_id, face_asset_id, source_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (camera_key, track_id, detected_at) DO UPDATE SET
         raw_track_id  = EXCLUDED.raw_track_id,
         bbox          = EXCLUDED.bbox,
         confidence    = EXCLUDED.confidence,
         upper_garment = EXCLUDED.upper_garment,
         lower_garment = EXCLUDED.lower_garment,
         face_quality  = EXCLUDED.face_quality,
         mode          = EXCLUDED.mode,
         crop_asset_id = COALESCE(EXCLUDED.crop_asset_id, walkin_detection.crop_asset_id),
         face_asset_id = COALESCE(EXCLUDED.face_asset_id, walkin_detection.face_asset_id),
         source_key    = EXCLUDED.source_key
       RETURNING id`,
      [
        rec.cameraKey,
        rec.trackId,
        rec.rawTrackId,
        rec.detectedAt,
        rec.bbox ? JSON.stringify(rec.bbox) : null,
        rec.confidence,
        rec.upperGarment,
        rec.lowerGarment,
        rec.faceQuality ? JSON.stringify(rec.faceQuality) : null,
        rec.mode,
        cropId,
        faceId,
        key,
      ]
    );
    const detectionId = res.insertId;
    await noteCamera(pool, "walkins", rec.cameraKey);

    // Colours are a full replace per detection: the sidecar is the source of
    // truth and a rewritten line may have different colour extraction.
    if (detectionId) {
      await pool.query(`DELETE FROM walkin_colour WHERE detection_id = ?`, [detectionId]);
      for (const c of rec.colours) {
        await pool.query(
          `INSERT INTO walkin_colour (detection_id, region, name, percentage, rgb)
           VALUES (?, ?, ?, ?, ?)`,
          [detectionId, c.region, c.name, c.percentage, toPgIntArray(c.rgb)]
        );
      }
      // Back-fill the crop's camera now that the JSONL has told us which
      // camera it came from - crop filenames carry no camera id.
      if (cropId) {
        await pool.query(
          `UPDATE media_asset SET camera_key = ? WHERE id = ? AND camera_key IS NULL`,
          [rec.cameraKey, cropId]
        );
      }
    }
    rows++;
  }
  return rows;
}

/** Run one full ingest pass. Safe to call repeatedly. */
async function runIngest(pool, { since = null } = {}) {
  const startedAt = Date.now();
  const media = await ingestMedia(pool, { since });
  let sidecarRows = 0;

  for (const s of media.sidecars) {
    try {
      if (s.service === "intrusion") {
        sidecarRows += await ingestIntrusionLog(pool, s.key, media.snapshotIndex);
      } else if (s.service === "walkins") {
        sidecarRows += await ingestWalkinLog(pool, s.key, media.cropIndex);
      }
    } catch (e) {
      console.error("[inference-ingest] sidecar failed", s.key, e.message);
      await pool.query(
        `INSERT INTO inference_ingest_state (prefix, last_error, last_run_at)
         VALUES (?, ?, now())
         ON CONFLICT (prefix) DO UPDATE SET last_error = EXCLUDED.last_error,
                                            last_run_at = EXCLUDED.last_run_at`,
        [s.key.slice(0, 120), String(e.message).slice(0, 500)]
      );
    }
  }

  // Poster frames, bounded per pass: each costs a few MB of range-fetch, so a
  // cold start spreads the work over consecutive runs rather than blocking.
  const pending = media.videoAssets.filter((v) => !hasPoster(v.assetId));
  const budget = Number(process.env.INFERENCE_POSTER_PER_PASS || 40);
  let postersMade = 0;
  for (const v of pending.slice(0, budget)) {
    if (await generatePoster(v.assetId, v.key)) postersMade++;
  }
  if (pending.length) {
    log(`posters: ${postersMade} generated, ${Math.max(0, pending.length - budget)} still pending`);
  }

  const summary = {
    postersMade,
    postersPending: Math.max(0, pending.length - budget),
    objectsSeen: media.seen,
    assetsUpserted: media.assets,
    sidecarFiles: media.sidecars.length,
    sidecarRows,
    ms: Date.now() - startedAt,
  };

  await pool.query(
    `INSERT INTO inference_ingest_state
       (prefix, last_run_at, objects_seen, rows_upserted, last_error)
     VALUES (?, now(), ?, ?, NULL)
     ON CONFLICT (prefix) DO UPDATE SET
       last_run_at   = now(),
       objects_seen  = EXCLUDED.objects_seen,
       rows_upserted = EXCLUDED.rows_upserted,
       last_error    = NULL`,
    [PREFIX, summary.objectsSeen, summary.assetsUpserted + summary.sidecarRows]
  );

  log(
    `pass complete: ${summary.objectsSeen} objects, ${summary.assetsUpserted} assets, ` +
      `${summary.sidecarRows} sidecar rows in ${summary.ms}ms`
  );
  return summary;
}

/** Background poller. Interval in minutes; 0 disables. */
function startIngestScheduler(pool) {
  const minutes = Number(process.env.INFERENCE_INGEST_INTERVAL_MIN || 5);
  if (!minutes || minutes <= 0) {
    log("scheduler disabled (INFERENCE_INGEST_INTERVAL_MIN=0)");
    return null;
  }
  const tick = async () => {
    try {
      await runIngest(pool);
    } catch (e) {
      console.error("[inference-ingest] pass failed:", e.message);
    }
  };
  setTimeout(tick, 10_000).unref?.();
  const handle = setInterval(tick, minutes * 60 * 1000);
  handle.unref?.();
  log(`scheduler started - every ${minutes} min`);
  return handle;
}

module.exports = { runIngest, startIngestScheduler };
