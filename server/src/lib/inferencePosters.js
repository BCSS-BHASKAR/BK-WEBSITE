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

/** Generate and cache a poster. Returns true if a poster exists afterwards. */
async function generatePoster(assetId, s3Key) {
  if (hasPoster(assetId)) return true;
  ensureDir();

  const tmp = path.join(POSTER_DIR, `.${assetId}.part`);
  try {
    const head = await getObjectHead(s3Key, HEAD_BYTES);
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
  posterFile,
  hasPoster,
  generatePoster,
  posterUrl,
  verifyPosterUrl,
};
