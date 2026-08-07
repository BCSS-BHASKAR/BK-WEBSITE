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
  parseChefAbsenceClip,
  parseKitchenIntrusion,
  parseChefRecord,
} = require("./inferenceParsers");
const { listObjects, getObjectText, PREFIX } = require("./inferenceS3");
const { ensurePoster, hasPoster, fetchBytesFor } = require("./inferencePosters");
const { probeMp4 } = require("./mp4Probe");

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
  const imageAssets = []; // large stills that need a downscaled thumbnail
  const cropIndex = new Map(); // basename -> asset id
  const snapshotIndex = new Map();
  // chef_absence crops share the walkins filename shape
  // (person_<track>_<epoch>.jpg), so they need their own index or a basename
  // collision would attach a kitchen crop to a walkins detection.
  const chefCropIndex = new Map();
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
    } else if (k.service === "chef_absence") {
      if (k.artefactType === "unattended") {
        parsed = parseChefAbsenceClip(k.filename);
        if (parsed) { cameraKey = parsed.cameraKey; capturedAt = parsed.startedAt; }
      } else if (k.artefactType === "intrusions") {
        // No camera id in the filename, and nothing else in the artefact set
        // identifies one, so these stay camera-less.
        parsed = parseKitchenIntrusion(k.filename);
        if (parsed) capturedAt = parsed.occurredAt;
      } else if (k.artefactType === "crops") {
        parsed = parseWalkinCrop(k.filename);
        if (parsed) capturedAt = parsed.capturedAt;
      }
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
    if (contentTypeFor(k.filename).startsWith("video")) {
      videoAssets.push({ assetId, key: o.Key, size: Number(o.Size) || 0 });
    }

    const base = k.filename.split("/").pop();
    if (k.service === "walkins") cropIndex.set(base, assetId);
    if (t === "intrusion/snapshots") snapshotIndex.set(base, assetId);
    if (t === "chef_absence/crops") chefCropIndex.set(base, assetId);

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
    } else if (t === "chef_absence/unattended") {
      // Reading the clip index costs one range request, so it is only done
      // once per clip - a repeat pass over an already-measured incident skips
      // straight past it.
      const [[known]] = await pool.query(
        `SELECT frame_count FROM chef_absence_incident WHERE asset_id = ?`,
        [assetId]
      );
      let probe = null;
      if (!known || known.frame_count == null) probe = await probeMp4(o.Key, o.Size);

      await pool.query(
        `INSERT INTO chef_absence_incident
           (camera_key, started_at, frame_count, clip_seconds, asset_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (asset_id) DO UPDATE SET
           camera_key   = EXCLUDED.camera_key,
           started_at   = EXCLUDED.started_at,
           frame_count  = COALESCE(EXCLUDED.frame_count, chef_absence_incident.frame_count),
           clip_seconds = COALESCE(EXCLUDED.clip_seconds, chef_absence_incident.clip_seconds)`,
        [
          parsed.cameraKey,
          parsed.startedAt,
          probe ? probe.frameCount : null,
          probe ? probe.durationSeconds : null,
          assetId,
        ]
      );
    } else if (t === "chef_absence/intrusions") {
      await pool.query(
        `INSERT INTO kitchen_intrusion (camera_key, occurred_at, daily_seq, asset_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (asset_id) DO UPDATE SET
           occurred_at = EXCLUDED.occurred_at, daily_seq = EXCLUDED.daily_seq`,
        [null, parsed.occurredAt, parsed.dailySeq, assetId]
      );
      // A 3 MB PNG per tile would be unusable in a grid, so these get the same
      // downscale treatment as video posters.
      imageAssets.push({ assetId, key: o.Key, size: Number(o.Size) || 0 });
    }
  }

  return { seen, assets, sidecars, cropIndex, snapshotIndex, chefCropIndex, videoAssets, imageAssets };
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

/**
 * Pass 2c - chef_absence detections. Upsert on (camera_key, track_id,
 * detected_at), matching the walkins contract.
 *
 * Both crop_path and frame_path point inside the same crops/ folder, so one
 * index resolves the close crop and the wider frame.
 */
async function ingestChefLog(pool, key, chefCropIndex) {
  const text = await getObjectText(key);
  let rows = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const rec = parseChefRecord(line);
    if (!rec) continue;

    const cropId = rec.cropBasename ? chefCropIndex.get(rec.cropBasename) || null : null;
    const frameId = rec.frameBasename ? chefCropIndex.get(rec.frameBasename) || null : null;

    const [res] = await pool.query(
      `INSERT INTO chef_detection
         (camera_key, track_id, raw_track_id, detected_at, status_chef, bbox, confidence,
          upper_garment, lower_garment, cap_garment, face_quality,
          identity_name, identity_similarity, mode,
          crop_asset_id, frame_asset_id, source_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (camera_key, track_id, detected_at) DO UPDATE SET
         raw_track_id        = EXCLUDED.raw_track_id,
         status_chef         = EXCLUDED.status_chef,
         bbox                = EXCLUDED.bbox,
         confidence          = EXCLUDED.confidence,
         upper_garment       = EXCLUDED.upper_garment,
         lower_garment       = EXCLUDED.lower_garment,
         cap_garment         = EXCLUDED.cap_garment,
         face_quality        = EXCLUDED.face_quality,
         identity_name       = EXCLUDED.identity_name,
         identity_similarity = EXCLUDED.identity_similarity,
         mode                = EXCLUDED.mode,
         crop_asset_id       = COALESCE(EXCLUDED.crop_asset_id, chef_detection.crop_asset_id),
         frame_asset_id      = COALESCE(EXCLUDED.frame_asset_id, chef_detection.frame_asset_id),
         source_key          = EXCLUDED.source_key
       RETURNING id`,
      [
        rec.cameraKey,
        rec.trackId,
        rec.rawTrackId,
        rec.detectedAt,
        rec.statusChef,
        rec.bbox ? JSON.stringify(rec.bbox) : null,
        rec.confidence,
        rec.upperGarment,
        rec.lowerGarment,
        rec.capGarment,
        rec.faceQuality ? JSON.stringify(rec.faceQuality) : null,
        rec.identityName,
        rec.identitySimilarity,
        rec.mode,
        cropId,
        frameId,
        key,
      ]
    );
    const detectionId = res.insertId;
    await noteCamera(pool, "chef_absence", rec.cameraKey);

    if (detectionId) {
      // Full replace per detection: the sidecar is the source of truth and a
      // rewritten line may carry different colour extraction.
      await pool.query(`DELETE FROM chef_colour WHERE detection_id = ?`, [detectionId]);
      for (const c of rec.colours) {
        await pool.query(
          `INSERT INTO chef_colour (detection_id, region, name, percentage, rgb)
           VALUES (?, ?, ?, ?, ?)`,
          [detectionId, c.region, c.name, c.percentage, toPgIntArray(c.rgb)]
        );
      }
      // Crop filenames carry no camera id; the JSONL is the only thing that
      // knows which camera produced them.
      for (const id of [cropId, frameId]) {
        if (!id) continue;
        await pool.query(
          `UPDATE media_asset SET camera_key = ? WHERE id = ? AND camera_key IS NULL`,
          [rec.cameraKey, id]
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
      } else if (s.service === "chef_absence") {
        sidecarRows += await ingestChefLog(pool, s.key, media.chefCropIndex);
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
    if (await ensurePoster(v.assetId, v.key, { headBytes: fetchBytesFor({ sizeBytes: v.size, isImage: false }) })) {
      postersMade++;
    }
  }
  if (pending.length) {
    log(`posters: ${postersMade} generated, ${Math.max(0, pending.length - budget)} still pending`);
  }

  // Intrusion stills are made on demand by the poster route, so this is only a
  // warm-up: the NEWEST few, which is what the first page of the UI shows.
  // Rendering the whole backlog eagerly would move ~5 GB to produce thumbnails
  // for tiles nobody has opened. S3 lists keys in lexicographic order and these
  // keys lead with the date, so the newest are at the end.
  const pendingThumbs = media.imageAssets.filter((v) => !hasPoster(v.assetId));
  const thumbBudget = Number(process.env.INFERENCE_THUMB_PER_PASS || 24);
  let thumbsMade = 0;
  for (const v of pendingThumbs.slice(-thumbBudget)) {
    // A still must arrive whole to decode, so the object's own size is the
    // fetch bound rather than the video head slice.
    if (await ensurePoster(v.assetId, v.key, { headBytes: v.size || undefined })) thumbsMade++;
  }
  if (pendingThumbs.length) {
    log(`thumbnails: ${thumbsMade} warmed, ${Math.max(0, pendingThumbs.length - thumbBudget)} left to the poster route`);
  }

  const summary = {
    postersMade,
    thumbsMade,
    thumbsPending: Math.max(0, pendingThumbs.length - thumbBudget),
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
