const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const { listStreamConfigs, listCameraRegistry } = require("../cameras");

const STREAMS = listStreamConfigs();

const HLS_BASE = path.join(os.tmpdir(), "anpr-streams");
const IDLE_KILL_MS = 60_000;
const STATUS_TTL_MS = 15_000;
const NEGATIVE_TTL_MS = 5_000;
const PROBE_TIMEOUT_MS = 6_000;
const STATUS_WAIT_BUDGET_MS = 8_000;
const PROBE_CONCURRENCY = 3;

fs.mkdirSync(HLS_BASE, { recursive: true });

const procs = new Map();
const statusCache = new Map();
const inFlightChecks = new Map();

function listStreams() {
  return STREAMS.map((s) => ({ id: s.id, name: s.name, url: s.url }));
}

function getStreamById(id) {
  return STREAMS.find((s) => s.id === id);
}

function hlsDir(id) {
  return path.join(HLS_BASE, id);
}

function touchStream(id) {
  const p = procs.get(id);
  if (p) p.lastTouch = Date.now();
}

function killStream(id) {
  const p = procs.get(id);
  if (!p) return;
  procs.delete(id);
  try {
    p.proc.kill("SIGKILL");
  } catch {
  }
  try {
    fs.rmSync(p.dir, { recursive: true, force: true });
  } catch {
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, p] of procs.entries()) {
    if (now - p.lastTouch > IDLE_KILL_MS) {
      killStream(id);
    }
  }
}, 15_000).unref?.();

process.on("exit", () => {
  for (const id of [...procs.keys()]) killStream(id);
});
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

let ffmpegBin = "ffmpeg";
let ffprobeBin = "ffprobe";
try {
  const staticFfmpeg = require("ffmpeg-static");
  if (staticFfmpeg) ffmpegBin = staticFfmpeg;
} catch {
}
try {
  const staticFfprobe = require("ffprobe-static")?.path;
  if (staticFfprobe) ffprobeBin = staticFfprobe;
} catch {
}

function ensureStreamRunning(id) {
  const stream = getStreamById(id);
  if (!stream) return null;
  const existing = procs.get(id);
  if (existing && !existing.proc.killed) {
    existing.lastTouch = Date.now();
    return existing;
  }

  const dir = hlsDir(id);
  fs.mkdirSync(dir, { recursive: true });

  for (const f of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
    }
  }

  const args = [
    "-loglevel",
    "error",
    "-fflags",
    "nobuffer",
    "-rtsp_transport",
    "tcp",
    "-timeout",
    "5000000",
    "-i",
    stream.url,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-sc_threshold",
    "0",
    "-r",
    "15",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "4",
    "-hls_flags",
    "delete_segments+independent_segments+omit_endlist",
    "-hls_segment_type",
    "mpegts",
    "-hls_segment_filename",
    path.join(dir, "seg%05d.ts"),
    path.join(dir, "index.m3u8"),
  ];

  const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
  const entry = { proc, dir, lastTouch: Date.now(), startedAt: Date.now() };
  procs.set(id, entry);

  let errBuf = "";
  proc.stderr.on("data", (d) => {
    errBuf += String(d);
    if (errBuf.length > 4_000) errBuf = errBuf.slice(-4_000);
  });
  proc.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[stream ${id}] ffmpeg exited code=${code} tail=`, errBuf.slice(-400));
    }
    if (procs.get(id) === entry) procs.delete(id);
  });

  return entry;
}

function isHlsProcessHealthy(id) {
  const p = procs.get(id);
  if (!p || p.proc.killed) return false;
  try {
    const playlist = path.join(p.dir, "index.m3u8");
    if (!fs.existsSync(playlist)) return false;
    const stat = fs.statSync(playlist);
    return Date.now() - stat.mtimeMs < 10_000;
  } catch {
    return false;
  }
}

function runFfprobe(stream) {
  return new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-rtsp_transport",
      "tcp",
      "-stimeout",
      "8000000",
      "-show_streams",
      "-select_streams",
      "v:0",
      "-of",
      "json",
      stream.url,
    ];
    const proc = spawn(ffprobeBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finalize = (online, error) => {
      if (settled) return;
      settled = true;
      resolve({ online, error: error || null });
    };

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
      finalize(false, "timeout");
    }, PROBE_TIMEOUT_MS);

    proc.stdout.on("data", (d) => {
      stdout += String(d);
    });
    proc.stderr.on("data", (d) => {
      stderr += String(d);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      finalize(false, "spawn_error");
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try {
          const json = JSON.parse(stdout || "{}");
          const hasVideo = (json.streams || []).some((s) => s.codec_type === "video");
          finalize(hasVideo, hasVideo ? null : "no_video");
        } catch {
          finalize(false, "parse_error");
        }
      } else {
        finalize(false, stderr.slice(-200) || `ffprobe_exit_${code}`);
      }
    });
  });
}

function checkStreamStatus(id, force = false) {
  const stream = getStreamById(id);
  if (!stream) return Promise.resolve({ id, online: false, checkedAt: Date.now(), error: "unknown" });

  if (isHlsProcessHealthy(id)) {
    const entry = { online: true, checkedAt: Date.now(), error: null };
    statusCache.set(id, entry);
    return Promise.resolve({ id, ...entry });
  }

  if (!force) {
    const cached = statusCache.get(id);
    const ttl = cached?.online ? STATUS_TTL_MS : NEGATIVE_TTL_MS;
    if (cached && Date.now() - cached.checkedAt < ttl) {
      return Promise.resolve({ id, ...cached });
    }
  }

  const inflight = inFlightChecks.get(id);
  if (inflight) return inflight;

  const p = runFfprobe(stream).then(({ online, error }) => {
    const entry = { online, checkedAt: Date.now(), error };
    statusCache.set(id, entry);
    return { id, ...entry };
  }).finally(() => {
    inFlightChecks.delete(id);
  });

  inFlightChecks.set(id, p);
  return p;
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function runOne() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runOne());
  await Promise.all(runners);
  return results;
}

function snapshotStatuses() {
  const streamStatuses = STREAMS.map((s) => {
    const cached = statusCache.get(s.id);
    const checking = !cached;
    return {
      id: s.id,
      name: s.name,
      online: cached ? !!cached.online : false,
      checkedAt: cached?.checkedAt || 0,
      error: cached?.error || null,
      checking,
    };
  });

  const streamIds = new Set(STREAMS.map((s) => s.id));
  const noStreamCameras = listCameraRegistry()
    .filter((c) => !c.hasStream && !streamIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      online: false,
      checkedAt: Date.now(),
      error: "No stream configured",
      checking: false,
    }));

  return [...streamStatuses, ...noStreamCameras];
}

async function getAllStatuses(force = false) {
  const probeTask = mapPool(STREAMS, PROBE_CONCURRENCY, (s) => checkStreamStatus(s.id, force));
  const budget = new Promise((resolve) => setTimeout(resolve, STATUS_WAIT_BUDGET_MS));
  await Promise.race([probeTask, budget]);
  void probeTask.catch(() => {});
  return snapshotStatuses();
}

module.exports = {
  listStreams,
  getStreamById,
  hlsDir,
  ensureStreamRunning,
  touchStream,
  checkStreamStatus,
  getAllStatuses,
  snapshotStatuses,
  killStream,
};
