const { pool } = require("../db");

const ADMIN_ROLES = new Set(["admin", "superadmin", "super_admin", "administrator"]);

function usernameFromEmail(email) {
  const s = String(email || "").trim();
  const at = s.indexOf("@");
  return at > 0 ? s.slice(0, at) : s || null;
}

function isAuditAdmin(role) {
  const r = String(role || "").trim().toLowerCase();
  return ADMIN_ROLES.has(r) || r.includes("admin");
}

function normalizeRoute(route) {
  const r = String(route || "").trim().toLowerCase();
  if (r === "assistant_enhance" || r === "/assistant_enhance" || r === "analytics") return "assistant_enhance";
  return "assistant";
}

function jsonOrNull(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function truncate(value, max = 65535) {
  const s = value == null ? "" : String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function recordChatAudit({
  user,
  route,
  sessionId,
  question,
  answer,
  latencyMs,
  auditMeta = {},
}) {
  if (!user?.id) return;
  const payload = {
    session_id: String(sessionId || "").slice(0, 64),
    user_id: Number(user.id),
    username: usernameFromEmail(user.email),
    email: truncate(user.email, 255),
    role: truncate(user.role || "USER", 64),
    route: normalizeRoute(route),
    question: truncate(question, 65000),
    answer: truncate(answer, 65000) || null,
    objective: truncate(auditMeta.objective, 128) || null,
    metric: truncate(auditMeta.metric, 128) || null,
    generated_sql: auditMeta.generated_sql ? truncate(auditMeta.generated_sql, 65000) : null,
    planner_context_json: jsonOrNull(auditMeta.planner_context_json),
    entities_json: jsonOrNull(auditMeta.entities_json),
    analytics_json: jsonOrNull(auditMeta.analytics_json),
    latency_ms: latencyMs == null ? null : Math.max(0, Math.round(Number(latencyMs))),
  };

  if (!payload.session_id || !payload.question) return;

  setImmediate(() => {
    insertAuditRecord(payload).catch((err) => {
      console.error("[chat-audit] insert failed:", err.message);
    });
  });
}

async function insertAuditRecord(record) {
  await pool.query(
    `
    INSERT INTO assistant_chat_audit (
      session_id, user_id, username, email, role, route,
      question, answer, objective, metric, generated_sql,
      planner_context_json, entities_json, analytics_json, latency_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      record.session_id,
      record.user_id,
      record.username,
      record.email,
      record.role,
      record.route,
      record.question,
      record.answer,
      record.objective,
      record.metric,
      record.generated_sql,
      record.planner_context_json,
      record.entities_json,
      record.analytics_json,
      record.latency_ms,
    ]
  );
}

function stripAuditPayload(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const copy = { ...body };
    delete copy._audit;
    return copy;
  }
  return body;
}

async function queryAuditRecords(filters = {}) {
  const where = [];
  const params = [];

  if (filters.user_id != null) {
    where.push("user_id = ?");
    params.push(Number(filters.user_id));
  }
  if (filters.email) {
    where.push("LOWER(email) = ?");
    params.push(String(filters.email).trim().toLowerCase());
  }
  if (filters.session_id) {
    where.push("session_id = ?");
    params.push(String(filters.session_id).trim());
  }
  if (filters.route) {
    where.push("route = ?");
    params.push(normalizeRoute(filters.route));
  }
  if (filters.from) {
    where.push("created_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("created_at <= ?");
    params.push(filters.to);
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const sql = `
    SELECT
      id, session_id, user_id, username, email, role, route,
      question, answer, objective, metric, generated_sql,
      planner_context_json, entities_json, analytics_json,
      latency_ms, created_at
    FROM assistant_chat_audit
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(sql, [...params, limit, offset]);
  return rows;
}

async function countAuditRecords(filters = {}) {
  const where = [];
  const params = [];
  if (filters.user_id != null) {
    where.push("user_id = ?");
    params.push(Number(filters.user_id));
  }
  if (filters.from) {
    where.push("created_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("created_at <= ?");
    params.push(filters.to);
  }
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM assistant_chat_audit ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    params
  );
  return Number(rows[0]?.total || 0);
}

module.exports = {
  recordChatAudit,
  stripAuditPayload,
  queryAuditRecords,
  countAuditRecords,
  isAuditAdmin,
  usernameFromEmail,
};
