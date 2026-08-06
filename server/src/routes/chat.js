const express = require("express");
const {
  isConfigured,
  forward,
  handleError,
  UNAVAILABLE_MSG,
} = require("../lib/assistantEnhanceProxy");
const { recordChatAudit } = require("../lib/chatAudit");

const router = express.Router();

const HELP_MESSAGE =
  "Ask about plate reads, violations, and camera sites — answers come from your database only.";

function auditUserContext(req) {
  return {
    id: req.user?.id,
    email: req.user?.email,
    role: req.user?.role,
    route: "assistant",
  };
}

function toLegacyResponse(stableJson, sessionId) {
  if (!stableJson || typeof stableJson !== "object") return null;
  const message = stableJson.message || stableJson.answer || "";
  return {
    sessionId: stableJson.sessionId || stableJson.session_id || sessionId,
    message: typeof message === "string" ? message : "",
    cards: stableJson.cards || [],
    context: stableJson.context || {},
  };
}

router.post("/", async (req, res) => {
  const question = String(req.body?.message ?? "").trim();
  const sessionId = String(req.body?.sessionId ?? "").trim();

  if (!isConfigured()) {
    return res.status(503).json({ error: "unavailable", message: UNAVAILABLE_MSG });
  }
  if (!question) {
    return res.status(400).json({ error: "invalid", message: "Please enter a valid question." });
  }
  if (!sessionId) {
    return res.status(400).json({ error: "invalid", message: "sessionId is required" });
  }

  const payload = { session_id: sessionId, message: question };

  try {
    const result = await forward("POST", "/assistant_enhance/chat", payload, undefined, auditUserContext(req));
    if (result.statusCode < 400 && result.json) {
      const legacy = toLegacyResponse(result.json, sessionId);
      if (legacy) {
        recordChatAudit({
          user: req.user,
          route: "assistant",
          sessionId: legacy.sessionId,
          question,
          answer: legacy.message,
          latencyMs: result.durationMs,
          auditMeta: result.json._audit || {},
        });
        res.status(result.statusCode);
        return res.json(legacy);
      }
    }
    res.status(result.statusCode);
    if (result.json !== null) return res.json(result.json);
    return res.send(result.raw || "");
  } catch (err) {
    console.error("chat proxy", err);
    if (err.code === "TIMEOUT") {
      return res.status(504).json({ error: "timeout", message: "The request timed out. Please try again." });
    }
    return handleError(res, err);
  }
});

router.get("/help", (_req, res) => {
  res.json({ message: HELP_MESSAGE });
});

module.exports = { chatRouter: router };
