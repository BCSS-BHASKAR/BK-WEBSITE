const http = require("http");
const https = require("https");
const { URL } = require("url");

const UPSTREAM = String(process.env.WALKING_ENROLL_UPSTREAM_URL || "http://127.0.0.1:8010")
  .trim()
  .replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.WALKING_ENROLL_TIMEOUT_MS || 60_000);

function forwardJson(method, targetPath, body, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetPath, `${UPSTREAM}/`);
    const lib = url.protocol === "https:" ? https : http;
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = {
      Accept: "application/json",
      ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
    };

    const req = lib.request(url, { method, headers, timeout: timeoutMs }, (upstream) => {
      const chunks = [];
      upstream.on("data", (chunk) => chunks.push(chunk));
      upstream.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        resolve({ statusCode: upstream.statusCode || 502, raw, json });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      const err = new Error("Walking enroll upstream timed out");
      err.code = "TIMEOUT";
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function forwardMultipart(name, file) {
  const form = new FormData();
  form.append("name", name);
  form.append("file", new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" }), file.originalname || "photo.jpg");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${UPSTREAM}/api/enroll`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const raw = await res.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { statusCode: res.status, raw, json };
  } finally {
    clearTimeout(timer);
  }
}

async function forwardSearchFace(file, { top_k, threshold } = {}) {
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" }), file.originalname || "photo.jpg");
  if (top_k != null && top_k !== "") form.append("top_k", String(top_k));
  if (threshold != null && threshold !== "") form.append("threshold", String(threshold));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${UPSTREAM}/api/search/face`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const raw = await res.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { statusCode: res.status, raw, json };
  } finally {
    clearTimeout(timer);
  }
}

function forwardBinary(method, targetPath, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetPath, `${UPSTREAM}/`);
    const lib = url.protocol === "https:" ? https : http;

    const req = lib.request(url, { method, timeout: timeoutMs }, (upstream) => {
      const chunks = [];
      upstream.on("data", (chunk) => chunks.push(chunk));
      upstream.on("end", () => {
        resolve({
          statusCode: upstream.statusCode || 502,
          headers: upstream.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      const err = new Error("Walking enroll upstream timed out");
      err.code = "TIMEOUT";
      reject(err);
    });
    req.end();
  });
}

function sendJson(res, result) {
  res.status(result.statusCode);
  res.set("Content-Type", "application/json");
  if (result.json !== null) return res.json(result.json);
  return res.send(result.raw || "");
}

function unavailable(res) {
  return res.status(503).json({ detail: "Face service is temporarily unavailable. Please try again later." });
}

module.exports = {
  UPSTREAM,
  forwardJson,
  forwardMultipart,
  forwardSearchFace,
  forwardBinary,
  sendJson,
  unavailable,
};
