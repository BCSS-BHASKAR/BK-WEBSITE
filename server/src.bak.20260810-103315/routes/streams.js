const express = require("express");
const path = require("path");
const fs = require("fs");
const {
  listStreams,
  getStreamById,
  hlsDir,
  ensureStreamRunning,
  touchStream,
  getAllStatuses,
} = require("../lib/streamManager");

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const rows = await getAllStatuses(false);
    const checking = rows.some((r) => r.checking);
    const onlineCount = rows.filter((r) => r.online).length;
    const allOnline = !checking && rows.length > 0 && onlineCount === rows.length;
    res.json({
      streams: rows,
      onlineCount,
      total: rows.length,
      allOnline,
      checking,
    });
  } catch (e) {
    res.status(500).json({ error: "stream_status_failed", message: e?.message });
  }
});

router.post("/:id/start", (req, res) => {
  const s = getStreamById(req.params.id);
  if (!s) return res.status(404).json({ error: "not_found" });
  ensureStreamRunning(s.id);
  res.json({ ok: true });
});

async function servePlaylist(req, res) {
  const s = getStreamById(req.params.id);
  if (!s) return res.status(404).end();
  ensureStreamRunning(s.id);
  touchStream(s.id);

  const file = path.join(hlsDir(s.id), "index.m3u8");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(file);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  res.status(504).json({ error: "stream_warmup_timeout" });
}

router.get("/:id/hls/index.m3u8", servePlaylist);

router.get("/:id/hls/:segment", (req, res) => {
  const s = getStreamById(req.params.id);
  if (!s) return res.status(404).end();
  const seg = String(req.params.segment);
  if (!/^[A-Za-z0-9._-]+\.ts$/.test(seg)) return res.status(400).end();
  touchStream(s.id);
  const file = path.join(hlsDir(s.id), seg);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Cache-Control", "no-store");
  return res.sendFile(file);
});

module.exports = { streamsRouter: router, listStreams };
