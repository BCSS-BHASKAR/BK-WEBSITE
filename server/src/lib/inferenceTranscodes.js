"use strict";

// Browser-playable renditions of clips the browser cannot decode.
//
// The chef_absence recorder writes MPEG-4 Part 2 (Simple Profile) inside an MP4
// container. No browser supports that codec - Chrome reports
// canPlayType('video/mp4; codecs="mp4v.20.8"') as unsupported and the element
// fails with MEDIA_ERR_SRC_NOT_SUPPORTED - so every one of those clips rendered
// as a silent black rectangle. The recordings themselves are fine; only the
// encoding is wrong. This transcodes them to H.264 on first view.
//
// Shape follows lib/inferencePosters.js deliberately: same on-demand generation,
// same disk cache, same HMAC-signed URL. A <video> cannot send an Authorization
// header, which is why access control is a signature on the URL rather than the
// bearer token - identical reasoning to posters, and no weaker than the S3
// presigned URL the player was being handed before.
//
// Cost, measured on the deployment box (2 vCPU): 2.6x realtime, so a 64 s clip
// takes ~55 s end to end and lands at ~700 KB against a 30 MB source. The viewer
// does not wait for that - ffmpeg emits a FRAGMENTED mp4 which is streamed
// straight to the socket, so playback starts within a few seconds and the
// encoder stays ahead of the player. The same bytes are captured to disk and
// remuxed to faststart afterwards, so every later view is instant and seekable.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const TRANSCODE_DIR = process.env.INFERENCE_TRANSCODE_DIR || "/var/lib/anpr/transcodes";
const CLIP_TTL_SECONDS = Number(process.env.INFERENCE_CLIP_TTL || 6 * 3600);
/** Cache ceiling. The box has ~2 GB free, and the whole archive is ~600 MB. */
const CACHE_MAX_BYTES = Number(process.env.INFERENCE_TRANSCODE_CACHE_MAX || 768 * 1024 * 1024);
/** One per vCPU. Live HLS already shares this box, so this stays deliberately low. */
const MAX_CONCURRENT = Number(process.env.INFERENCE_TRANSCODE_CONCURRENCY || 2);
const MAX_QUEUE = Number(process.env.INFERENCE_TRANSCODE_QUEUE || 12);
const TARGET_HEIGHT = Number(process.env.INFERENCE_TRANSCODE_HEIGHT || 720);
const CRF = String(process.env.INFERENCE_TRANSCODE_CRF || 28);
const PRESET = process.env.INFERENCE_TRANSCODE_PRESET || "veryfast";

function ffmpegPath() {
  try {
    return require("ffmpeg-static");
  } catch {
    return process.env.FFMPEG_PATH || "ffmpeg";
  }
}

function ffprobePath() {
  try {
    return require("ffprobe-static").path;
  } catch {
    return process.env.FFPROBE_PATH || "ffprobe";
  }
}

function ensureDir() {
  fs.mkdirSync(TRANSCODE_DIR, { recursive: true });
}

function clipFile(assetId) {
  return path.join(TRANSCODE_DIR, `${Number(assetId)}.mp4`);
}

function hasClip(assetId) {
  try {
    return fs.statSync(clipFile(assetId)).size > 0;
  } catch {
    return false;
  }
}

/**
 * Which assets are routed through here.
 *
 * Every MP4 in this archive is MPEG-4 Part 2; the WebM clips are VP9 and play
 * natively, so they are left on their S3 URL and cost nothing. The container is
 * the trigger, but it is not the verdict - the codec is probed below, and an MP4
 * that turns out to be H.264 is remuxed rather than re-encoded. That is what
 * makes this safe to leave in place after the recorder is fixed: correct files
 * get a cheap copy, not a needless generation loss.
 */
function needsTranscode(contentType) {
  return /^video\/(mp4|quicktime|x-m4v)/i.test(String(contentType || ""));
}

/** Probe the source's video codec. Cached - the answer cannot change. */
const codecCache = new Map();
async function probeCodec(assetId, srcUrl) {
  const id = Number(assetId);
  if (codecCache.has(id)) return codecCache.get(id);
  let codec = null;
  try {
    const { stdout } = await execFileAsync(
      ffprobePath(),
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name",
       "-of", "default=nw=1:nk=1", srcUrl],
      { timeout: 60_000, maxBuffer: 1024 * 1024 }
    );
    codec = String(stdout || "").trim().split("\n")[0] || null;
  } catch {
    codec = null;
  }
  codecCache.set(id, codec);
  return codec;
}

// --- cache eviction --------------------------------------------------------

/**
 * Trim the cache to CACHE_MAX_BYTES, oldest-accessed first.
 *
 * Posters are a few KB each and never needed this; clips are ~1.5 MB and the
 * archive grows daily, so without a ceiling this would eventually take the disk
 * with it - and the box has ~2 GB free.
 */
function pruneCache() {
  let entries;
  try {
    entries = fs
      .readdirSync(TRANSCODE_DIR)
      .filter((f) => f.endsWith(".mp4"))
      .map((f) => {
        const full = path.join(TRANSCODE_DIR, f);
        const st = fs.statSync(full);
        return { full, size: st.size, atime: st.atimeMs };
      });
  } catch {
    return;
  }
  let total = entries.reduce((a, e) => a + e.size, 0);
  if (total <= CACHE_MAX_BYTES) return;
  entries.sort((a, b) => a.atime - b.atime);
  for (const e of entries) {
    if (total <= CACHE_MAX_BYTES) break;
    try {
      fs.unlinkSync(e.full);
      total -= e.size;
    } catch {
      /* another worker got there first */
    }
  }
}

// --- concurrency -----------------------------------------------------------

let running = 0;
const waiting = [];

function acquireSlot() {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return Promise.resolve(true);
  }
  if (waiting.length >= MAX_QUEUE) return Promise.resolve(false);
  return new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot() {
  const next = waiting.shift();
  if (next) {
    next(true);
    return;
  }
  running = Math.max(0, running - 1);
}

// --- transcoding -----------------------------------------------------------

/**
 * Remux a finished fragmented capture into a faststart file, stream-copying.
 *
 * No re-encode, so this costs about a second and loses nothing. It exists
 * because the fragmented mp4 the player is fed has no global index - fine to
 * play through once, poor to seek in - whereas the cached copy is what every
 * later view is served from and wants a real moov at the front.
 */
async function remuxToFaststart(fragFile, outFile) {
  await execFileAsync(
    ffmpegPath(),
    // -f mp4 is required: the target is a .part scratch file, and ffmpeg picks
    // its muxer from the extension unless told otherwise, so without this it
    // refuses with "Unable to choose an output format".
    ["-v", "error", "-nostdin", "-i", fragFile, "-c", "copy",
     "-movflags", "+faststart", "-f", "mp4", "-y", outFile],
    { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }
  );
}

/**
 * Transcode `srcUrl` into `res`, caching the result.
 *
 * ffmpeg emits ONE output - a fragmented mp4 on stdout - which Node fans out to
 * both the response and a scratch file. The obvious alternative, ffmpeg's `tee`
 * muxer writing the socket and the cache in a single pass, is what this
 * originally did and it produced a corrupt pipe branch: ffprobe rejected the
 * streamed bytes with "No start code is found" while the file branch of the very
 * same command was valid H.264, and the browser failed it with MEDIA_ERR_DECODE.
 * Emitting one output and duplicating it downstream avoids that entirely.
 *
 * The cache is built from a scratch file and renamed only after a clean exit, so
 * an aborted transcode can never leave a truncated clip that a later view then
 * serves as though it were complete.
 */
async function streamTranscode({ assetId, srcUrl, codec, res, onError }) {
  ensureDir();
  const id = Number(assetId);
  // Scratch capture of the fragmented stream, then the faststart remux target.
  const fragFile = path.join(TRANSCODE_DIR, `.${id}.frag`);
  const partFile = path.join(TRANSCODE_DIR, `.${id}.part`);
  const cleanupScratch = () => {
    for (const f of [fragFile, partFile]) {
      try { fs.unlinkSync(f); } catch { /* never written, or already gone */ }
    }
  };
  const gotSlot = await acquireSlot();
  if (!gotSlot) {
    onError(503, "transcode_busy");
    return;
  }

  // An H.264 source only needs its container rebuilt, which costs no quality
  // and almost no CPU. Anything else has to be re-encoded.
  const copyOnly = codec === "h264";
  const videoArgs = copyOnly
    ? ["-c:v", "copy"]
    : ["-c:v", "libx264", "-preset", PRESET, "-crf", CRF, "-pix_fmt", "yuv420p",
       "-vf", `scale=-2:${TARGET_HEIGHT}`];

  const args = [
    "-v", "error", "-nostdin",
    "-i", srcUrl,
    "-map", "0:v:0",
    // Optional: these recordings carry no audio track, but a future one might,
    // and without the `?` ffmpeg would abort on every clip that has none.
    "-map", "0:a:0?",
    ...videoArgs,
    "-c:a", "aac", "-b:a", "96k",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4", "pipe:1",
  ];

  const proc = spawn(ffmpegPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  let finished = false;

  proc.stderr.on("data", (d) => {
    if (stderr.length < 4000) stderr += d.toString();
  });

  // One source, two sinks: the socket and the scratch file. Node's pipe handles
  // the backpressure, so a slow viewer throttles the encode rather than buffering.
  const fragStream = fs.createWriteStream(fragFile);
  let fragFinished = false;
  let exitCode = null;
  fragStream.on("error", () => { /* cache is best-effort; the view still plays */ });

  /**
   * Build the cache once BOTH the encoder has exited cleanly and the scratch
   * file has flushed.
   *
   * The two events race, and the write stream is ended by pipe() itself - so
   * calling fragStream.end(cb) to sequence them, as this first did, ran the
   * callback against an already-finished stream and the remux simply never
   * happened. Waiting on 'finish' is what actually guarantees the bytes are on
   * disk before ffmpeg is asked to read them back.
   */
  const buildCacheWhenReady = () => {
    if (exitCode !== 0 || !fragFinished) return;
    remuxToFaststart(fragFile, partFile)
      .then(() => {
        fs.renameSync(partFile, clipFile(id));
        pruneCache();
      })
      .catch((e) => console.warn(`[transcode ${id}] cache remux failed:`, e.message))
      .finally(cleanupScratch);
  };
  fragStream.on("finish", () => { fragFinished = true; buildCacheWhenReady(); });
  proc.stdout.pipe(res);
  proc.stdout.pipe(fragStream);

  // The viewer closing mid-clip must kill ffmpeg, or a few impatient operators
  // leave the box transcoding recordings nobody is watching.
  //
  // `close` fires on a NORMAL completion as well as on an abort, so it cannot be
  // treated as "the client gave up" on its own. It also arrives BEFORE the
  // process 'exit' event, so `finished` is still false at that point - checking
  // only that flag killed ffmpeg and deleted the part file at the end of every
  // successful transcode, which is why nothing was ever cached and every view
  // re-encoded from scratch. writableEnded is the discriminator: the pipe calls
  // res.end() when ffmpeg's stdout closes, so it is true only on a clean finish.
  const onClose = () => {
    if (finished || res.writableEnded) return;
    try { proc.kill("SIGKILL"); } catch { /* already gone */ }
    cleanupScratch();
  };
  res.on("close", onClose);

  proc.on("error", (e) => {
    finished = true;
    releaseSlot();
    cleanupScratch();
    onError(500, `transcode_spawn_failed: ${e.message}`);
  });

  proc.on("exit", (code) => {
    finished = true;
    releaseSlot();
    if (code !== 0) {
      cleanupScratch();
      if (!res.headersSent) onError(500, `transcode_failed: ${stderr.slice(-300)}`);
      else res.end();
      console.warn(`[transcode ${id}] ffmpeg exit=${code} tail=`, stderr.slice(-300));
      return;
    }
    // The viewer already has every byte it needs; the remux only builds the
    // cache, so it runs after the response and its failure costs nothing but a
    // repeated transcode next time.
    exitCode = code;
    buildCacheWhenReady();
  });
}

// --- signed clip URLs ------------------------------------------------------

function secret() {
  return process.env.JWT_SECRET || "inference-clip-fallback";
}

// Domain-separated from the poster signature, so a poster URL can never be
// replayed as a clip URL for the same asset id.
function sign(assetId, expiresAt) {
  return crypto
    .createHmac("sha256", secret())
    .update(`clip:${assetId}:${expiresAt}`)
    .digest("hex")
    .slice(0, 32);
}

function clipUrl(assetId) {
  const exp = Math.floor(Date.now() / 1000) + CLIP_TTL_SECONDS;
  return `/api/inference/clip/${assetId}?e=${exp}&s=${sign(assetId, exp)}`;
}

function verifyClipUrl(assetId, exp, sig) {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(assetId, e);
  const a = Buffer.from(String(sig || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  TRANSCODE_DIR,
  needsTranscode,
  probeCodec,
  clipFile,
  hasClip,
  streamTranscode,
  pruneCache,
  clipUrl,
  verifyClipUrl,
};
