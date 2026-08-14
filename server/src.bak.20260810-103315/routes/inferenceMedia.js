const express = require("express");
const { fetchInferenceMedia } = require("../lib/inferenceMediaStore");

const router = express.Router();

router.get("/*", async (req, res) => {
  let key = String(req.path || "").replace(/^\//, "");
  try {
    key = decodeURIComponent(key);
  } catch {
    return res.status(400).json({ error: "bad_request", message: "invalid image key encoding" });
  }
  if (!key) {
    return res.status(400).json({ error: "bad_request", message: "missing image key" });
  }

  try {
    const asset = await fetchInferenceMedia(key);
    if (!asset) {
      return res.status(404).end();
    }
    res.set("Content-Type", asset.contentType);
    res.set("Cache-Control", "public, max-age=300");
    return res.send(asset.body);
  } catch (err) {
    console.error("inference-media", key, err);
    return res.status(500).end();
  }
});

module.exports = { inferenceMediaRouter: router };
