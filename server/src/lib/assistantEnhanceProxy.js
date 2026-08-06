const http = require("http");
const https = require("https");
const { URL } = require("url");

const AI_URL = String(
  process.env.AI_ASSISTANT_ENHANCE_URL || process.env.AI_ASSISTANT_URL || "http://127.0.0.1:9003"
).trim().replace(/\/$/, "");
const AI_KEY = String(process.env.AI_ASSISTANT_API_KEY || "").trim();
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT || 60) * 1000;
const HEALTH_TIMEOUT_MS = Number(process.env.AI_HEALTH_TIMEOUT || 5) * 1000;
const UNAVAILABLE_MSG = "Analytics assistant is currently unavailable.";

function isConfigured() {
  return Boolean(AI_URL && AI_KEY);
}

function upstreamHeaders(payload, userContext) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${AI_KEY}`,
    "X-API-Key": AI_KEY,
    ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
  };
  if (userContext?.id) {
    headers["X-Audit-User-Id"] = String(userContext.id);
    headers["X-Audit-User-Email"] = String(userContext.email || "");
    headers["X-Audit-User-Role"] = String(userContext.role || "USER");
    headers["X-Audit-Route"] = String(userContext.route || "assistant_enhance");
  }
  return headers;
}

function forward(method, targetPath, body, timeoutMs = TIMEOUT_MS, userContext = null) {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      const err = new Error("AI assistant proxy not configured");
      err.code = "NOT_CONFIGURED";
      reject(err);
      return;
    }

    const url = new URL(targetPath, `${AI_URL}/`);
    const lib = url.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const started = Date.now();

    const req = lib.request(
      url,
      { method, headers: upstreamHeaders(payload, userContext), timeout: timeoutMs },
      (upstream) => {
        let data = "";
        upstream.on("data", (chunk) => {
          data += chunk;
        });
        upstream.on("end", () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({
            statusCode: upstream.statusCode || 502,
            durationMs: Date.now() - started,
            raw: data,
            json,
          });
        });
      }
    );

    req.on("error", (err) => {
      err.durationMs = Date.now() - started;
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      const err = new Error("AI assistant request timed out");
      err.code = "TIMEOUT";
      err.durationMs = Date.now() - started;
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function sendResponse(res, result) {
  res.status(result.statusCode);
  res.set("Content-Type", "application/json");
  if (result.json !== null) return res.json(result.json);
  return res.send(result.raw || "");
}

function handleError(res, err) {
  if (err.code === "NOT_CONFIGURED") {
    return res.status(503).json({ message: UNAVAILABLE_MSG });
  }
  if (err.code === "TIMEOUT") {
    return res.status(504).json({ message: "The request timed out. Please try again." });
  }
  return res.status(503).json({ message: UNAVAILABLE_MSG });
}

module.exports = {
  isConfigured,
  forward,
  sendResponse,
  handleError,
  TIMEOUT_MS,
  HEALTH_TIMEOUT_MS,
  UNAVAILABLE_MSG,
};
