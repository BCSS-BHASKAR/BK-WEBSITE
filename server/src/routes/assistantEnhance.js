const express = require("express");
const {
  isConfigured,
  forward,
  sendResponse,
  handleError,
  HEALTH_TIMEOUT_MS,
  UNAVAILABLE_MSG,
} = require("../lib/assistantEnhanceProxy");
const { logEvent } = require("../lib/assistantEnhanceLogger");
const { recordChatAudit, stripAuditPayload } = require("../lib/chatAudit");

const router = express.Router();

function auditUserContext(req) {
  return {
    id: req.user?.id,
    email: req.user?.email,
    role: req.user?.role,
    route: "assistant_enhance",
  };
}

function persistEnhanceAudit(req, sessionId, question, result) {
  if (result.statusCode >= 400 || !result.json) return;
  recordChatAudit({
    user: req.user,
    route: "assistant_enhance",
    sessionId: sessionId || result.json.session_id,
    question,
    answer: result.json.message || result.json.answer,
    latencyMs: result.durationMs,
    auditMeta: result.json._audit || {},
  });
}

function respondWithoutAudit(res, result) {
  res.status(result.statusCode);
  res.set("Content-Type", "application/json");
  if (result.json !== null) return res.json(stripAuditPayload(result.json));
  return res.send(result.raw || "");
}

router.get("/health", async (req, res) => {
  const started = Date.now();
  if (!isConfigured()) {
    logEvent({
      endpoint: "health",
      status: "unavailable",
      response_time_ms: Date.now() - started,
      http_status: 503,
      error: "not_configured",
    });
    return res.status(503).json({ status: "unavailable", message: UNAVAILABLE_MSG });
  }

  try {
    const result = await forward("GET", "/assistant_enhance/health", null, HEALTH_TIMEOUT_MS);
    logEvent({
      endpoint: "health",
      status: result.statusCode < 400 ? "ok" : "error",
      response_time_ms: result.durationMs,
      http_status: result.statusCode,
      error: result.statusCode >= 400 ? String(result.raw || "").slice(0, 300) : null,
    });
    return sendResponse(res, result);
  } catch (err) {
    logEvent({
      endpoint: "health",
      status: "unavailable",
      response_time_ms: err.durationMs ?? Date.now() - started,
      http_status: err.code === "TIMEOUT" ? 504 : 503,
      error: err.message,
    });
    return handleError(res, err);
  }
});

router.post("/chat", async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ message: UNAVAILABLE_MSG });
  }

  const sessionId = String(req.body?.session_id ?? "").trim();
  const message = String(req.body?.message ?? "").trim();

  if (!sessionId) {
    return res.status(400).json({ message: "session_id is required" });
  }
  if (!message) {
    return res.status(400).json({ message: "message is required" });
  }

  const payload = { session_id: sessionId, message };

  try {
    const result = await forward("POST", "/assistant_enhance/chat", payload, undefined, auditUserContext(req));
    logEvent({
      endpoint: "chat",
      session_id: sessionId || null,
      question: message,
      status: result.statusCode < 400 ? "ok" : "error",
      response_time_ms: result.durationMs,
      http_status: result.statusCode,
      error: result.statusCode >= 400 ? String(result.raw || "").slice(0, 300) : null,
      user_id: req.user?.id ?? null,
    });
    persistEnhanceAudit(req, sessionId, message, result);
    return respondWithoutAudit(res, result);
  } catch (err) {
    logEvent({
      endpoint: "chat",
      session_id: sessionId || null,
      question: message,
      status: "error",
      response_time_ms: err.durationMs ?? null,
      http_status: err.code === "TIMEOUT" ? 504 : 503,
      error: err.message,
      user_id: req.user?.id ?? null,
    });
    return handleError(res, err);
  }
});

router.post("/feedback", async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ message: UNAVAILABLE_MSG });
  }

  const { session_id, question, answer, feedback } = req.body || {};
  if (!session_id || !question || !answer || !feedback) {
    return res.status(400).json({ message: "Missing required feedback parameters" });
  }

  const payload = { session_id, question, answer, feedback };

  try {
    const result = await forward("POST", "/assistant_enhance/feedback", payload, undefined, auditUserContext(req));
    return sendResponse(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/debug", async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ message: UNAVAILABLE_MSG });
  }

  const sessionId = String(req.body?.session_id ?? "").trim();
  if (!sessionId) {
    return res.status(400).json({ message: "session_id is required" });
  }

  const payload = { session_id: sessionId };

  try {
    const result = await forward("POST", "/assistant_enhance/debug", payload);
    logEvent({
      endpoint: "debug",
      session_id: sessionId,
      status: result.statusCode < 400 ? "ok" : "error",
      response_time_ms: result.durationMs,
      http_status: result.statusCode,
      error: result.statusCode >= 400 ? String(result.raw || "").slice(0, 300) : null,
      user_id: req.user?.id ?? null,
    });
    return sendResponse(res, result);
  } catch (err) {
    logEvent({
      endpoint: "debug",
      session_id: sessionId,
      status: "error",
      response_time_ms: err.durationMs ?? null,
      http_status: err.code === "TIMEOUT" ? 504 : 503,
      error: err.message,
      user_id: req.user?.id ?? null,
    });
    return handleError(res, err);
  }
});

module.exports = { assistantEnhanceRouter: router };
