"use strict";

// Poster frames for video assets.
//
// Loitering clips are the bulk of the archive, and a <video> with no poster
// renders as a black rectangle - so the timeline was a wall of black boxes with
// no visual information at all. This extracts frame 0 from each clip and caches
// it as a small JPEG.
//
// Cost control: a clip is 30-40 MB, but only the opening few MB are needed to
// decode the first frame, so we range-fetch a head slice instead of the whole
// object. 114 clips therefore cost ~340 MB of one-off transfer rather than the
// full 2.9 GB, and nothing is re-fetched once a poster exists on disk.
//
// Access control: posters are frames of surveillance footage, so they are not
// world-readable. <img> tags cannot send an Authorization header, so each
// poster URL carries a short-lived HMAC scoped to that one asset id - the same
// idea as an S3 presigned URL, signed with JWT_SECRET.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { getObjectHead } = require("./inferenceS3");

const execFileAsync = promisify(execFile);

const POSTER_DIR = process.env.INFERENCE_POSTER_DIR || "/var/lib/anpr/posters";
const HEAD_BYTES = Number(process.env.INFERENCE_POSTER_HEAD_BYTES || 3 * 1024 * 1024);
// Ceiling for pulling a whole object instead of just its head. See fetchBytesFor.
const FULL_FETCH_MAX = Number(process.env.INFERENCE_POSTER_FULL_MAX || 32 * 1024 * 1024);
const POSTER_TTL_SECONDS = Number(process.env.INFERENCE_POSTER_TTL || 3600);
const POSTER_WIDTH = 480;

function ffmpegPath() {
  try {
    return require("ffmpeg-static");
  } catch {
    return process.env.FFMPEG_PATH || "ffmpeg";
  }
}

function ensureDir() {
  fs.mkdirSync(POSTER_DIR, { recursive: true });
}

/**
 * How many bytes of an object are needed to decode one frame.
 *
 * The loitering WebMs put their cues up front, so a head slice is enough. The
 * chef_absence MP4s do not: they are written without faststart, so moov sits at
 * the END and a head slice alone decodes to nothing. Since almost all of them
 * are only a few MB, the whole object is pulled when it is small enough, and
 * anything larger falls back to the head slice (which still works for formats
 * that front-load their index).
 *
 * A still always needs to arrive whole.
 */
function fetchBytesFor({ sizeBytes, isImage }) {
  const size = Number(sizeBytes) || 0;
  if (isImage) return size || HEAD_BYTES;
  if (size && size <= FULL_FETCH_MAX) return size;
  return HEAD_BYTES;
}

function posterFile(assetId) {
  return path.join(POSTER_DIR, `${Number(assetId)}.jpg`);
}

function hasPoster(assetId) {
  try {
    return fs.statSync(posterFile(assetId)).size > 0;
  } catch {
    return false;
  }
}

/**
 * Generate and cache a poster. Returns true if a poster exists afterwards.
 *
 * `headBytes` overrides how much of the object is pulled. A video only needs
 * its opening megabytes, but a still has to arrive whole or it cannot be
 * decoded - the chef_absence intrusion PNGs are 3 MB each and pass their own
 * size here. ffmpeg reads a PNG as a single-frame input, so the same command
 * serves both cases.
 */
async function generatePoster(assetId, s3Key, { headBytes = HEAD_BYTES } = {}) {
  if (hasPoster(assetId)) return true;
  ensureDir();

  const tmp = path.join(POSTER_DIR, `.${assetId}.part`);
  try {
    const head = await getObjectHead(s3Key, headBytes);
    fs.writeFileSync(tmp, head);
    // -frames:v 1 stops after the first decoded frame. A truncated container
    // makes ffmpeg noisy on stderr but it still emits the frame, so failure is
    // judged by whether the output file exists and is non-empty.
    await execFileAsync(
      ffmpegPath(),
      ["-v", "error", "-i", tmp, "-frames:v", "1", "-vf", `scale=${POSTER_WIDTH}:-1`, "-y", posterFile(assetId)],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }
    ).catch(() => {});
    return hasPoster(assetId);
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// Dedupe concurrent generation. A grid renders ~48 tiles at once and a browser
// will happily open them in parallel; without this, a cache miss on a fresh
// page would pull the same object several times over.
const inflight = new Map();

// Remember what could NOT be rendered.
//
// Some assets can never produce a poster - a clip larger than FULL_FETCH_MAX
// whose moov sits past the head slice, a truncated upload, a codec ffmpeg here
// cannot decode. Without this, every page view re-downloads that object and
// re-runs ffmpeg to fail again, which for a 341 MB clip means 341 MB of
// transfer per viewer. Entries expire so a genuinely transient failure (a
// throttled S3 call) is retried rather than written off for good.
const failed = new Map(); // assetId -> retry-after epoch ms
const FAILURE_TTL_MS = Number(process.env.INFERENCE_POSTER_FAILURE_TTL_MS || 6 * 60 * 60 * 1000);

function recentlyFailed(assetId) {
  const until = failed.get(Number(assetId));
  if (until == null) return false;
  if (until > Date.now()) return true;
  failed.delete(Number(assetId));
  return false;
}

/**
 * Generate on first request rather than up front.
 *
 * chef_absence is ~5.6 GB and the fastest-growing source in the system, so
 * pre-rendering every intrusion still would move gigabytes to thumbnail images
 * nobody has asked to see. Paging through the UI touches a few dozen at a time,
 * and each one is cached permanently once made.
 */
function ensurePoster(assetId, s3Key, opts) {
  if (hasPoster(assetId)) return Promise.resolve(true);
  const id = Number(assetId);
  if (recentlyFailed(id)) return Promise.resolve(false);
  if (inflight.has(id)) return inflight.get(id);

  const p = generatePoster(id, s3Key, opts)
    .then((ok) => {
      if (!ok) failed.set(id, Date.now() + FAILURE_TTL_MS);
      return ok;
    })
    .catch(() => {
      // generatePoster swallows its own errors, but a throw here would leave
      // the entry in `inflight` forever without the finally below.
      failed.set(id, Date.now() + FAILURE_TTL_MS);
      return false;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

// --- signed poster URLs ----------------------------------------------------

function secret() {
  return process.env.JWT_SECRET || "inference-poster-fallback";
}

function sign(assetId, expiresAt) {
  return crypto
    .createHmac("sha256", secret())
    .update(`poster:${assetId}:${expiresAt}`)
    .digest("hex")
    .slice(0, 32);
}

/** Relative URL an <img> can use directly; valid for POSTER_TTL_SECONDS. */
function posterUrl(assetId) {
  const exp = Math.floor(Date.now() / 1000) + POSTER_TTL_SECONDS;
  return `/api/inference/poster/${assetId}?e=${exp}&s=${sign(assetId, exp)}`;
}

function verifyPosterUrl(assetId, exp, sig) {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(assetId, e);
  const a = Buffer.from(String(sig || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  POSTER_DIR,
  fetchBytesFor,
  posterFile,
  hasPoster,
  generatePoster,
  ensurePoster,
  posterUrl,
  verifyPosterUrl,
};
