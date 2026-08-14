const crypto = require("crypto");

const WRITE_SQL_RE =
  /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|CALL|EXEC|EXECUTE|MERGE|LOAD\s+DATA|REPLACE\s+INTO|INTO\s+OUTFILE)\b/i;

const MAX_MESSAGE_LEN = 2000;
const MAX_SESSION_ID_LEN = 64;
const MAX_DATE_SPAN_DAYS = 366;

function assertReadOnlySql(sql) {
  const s = String(sql || "").trim();
  if (!s) throw new Error("empty_sql");
  if (WRITE_SQL_RE.test(s)) throw new Error("forbidden_sql");
  if (!/^\s*SELECT\b/i.test(s)) throw new Error("select_only");
  return s;
}

function validateUserMessage(message) {
  const text = String(message ?? "").trim();
  if (!text) return { ok: false, error: "empty_message" };
  if (text.length > MAX_MESSAGE_LEN) return { ok: false, error: "message_too_long" };
  if (WRITE_SQL_RE.test(text)) return { ok: false, error: "forbidden_input" };
  return { ok: true, text };
}

function validateSessionId(sessionId) {
  const id = String(sessionId ?? "").trim();
  if (!id) return crypto.randomUUID();
  if (id.length > MAX_SESSION_ID_LEN || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return crypto.randomUUID();
  }
  return id;
}

function clampDateRange(from, to) {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) return null;
  if (to < from) return null;
  const a = new Date(`${from}T12:00:00Z`);
  const b = new Date(`${to}T12:00:00Z`);
  const span = Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
  if (span < 1 || span > MAX_DATE_SPAN_DAYS) return null;
  return { from, to, spanDays: span };
}

module.exports = {
  assertReadOnlySql,
  validateUserMessage,
  validateSessionId,
  clampDateRange,
  MAX_MESSAGE_LEN,
};
