const express = require("express");
const multer = require("multer");
const {
  forwardJson,
  forwardMultipart,
  forwardSearchFace,
  forwardBinary,
  sendJson,
  unavailable,
} = require("../lib/walkingEnrollProxy");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

const mediaRouter = express.Router();
mediaRouter.use(async (req, res) => {
  const subPath = String(req.path || "").replace(/^\//, "");
  if (!subPath.startsWith("data/")) {
    return res.status(404).end();
  }
  try {
    const result = await forwardBinary("GET", `/${subPath}`);
    if (result.statusCode >= 400) {
      return res.status(result.statusCode).end();
    }
    const contentType = result.headers["content-type"] || "image/jpeg";
    res.status(result.statusCode);
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, max-age=300");
    return res.send(result.body);
  } catch {
    return res.status(502).end();
  }
});

router.get("/health", async (_req, res) => {
  try {
    const result = await forwardJson("GET", "/api/health");
    return sendJson(res, result);
  } catch {
    return unavailable(res);
  }
});

router.get("/config", async (_req, res) => {
  try {
    const result = await forwardJson("GET", "/api/enroll/config");
    return sendJson(res, result);
  } catch {
    return unavailable(res);
  }
});

router.get("/", async (_req, res) => {
  try {
    const result = await forwardJson("GET", "/api/enroll");
    return sendJson(res, result);
  } catch {
    return unavailable(res);
  }
});

router.post("/search/face", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "file is required" });
  const top_k = req.body?.top_k;
  const threshold = req.body?.threshold;
  try {
    const result = await forwardSearchFace(req.file, { top_k, threshold });
    return sendJson(res, result);
  } catch {
    return unavailable(res);
  }
});

router.get("/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ detail: "Invalid id" });
  try {
    const result = await forwardJson("GET", `/api/enroll/${id}`);
    return sendJson(res, result);
  } catch {
    return unavailable(res);
  }
});

router.post("/", upload.single("file"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ detail: "name is required" });
  if (!req.file) return res.status(400).json({ detail: "file is required" });
  try {
    const result = await forwardMultipart(name, req.file);
    return sendJson(res, result);
  } catch {
    return unavailable(res);
  }
});

router.delete("/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ detail: "Invalid id" });
  try {
    const result = await forwardJson("DELETE", `/api/enroll/${id}`);
    return sendJson(res, result);
  } catch {
    return unavailable(res);
  }
});

module.exports = { walkingEnrollRouter: router, walkingEnrollMediaRouter: mediaRouter };
