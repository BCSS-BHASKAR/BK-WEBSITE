const fs = require("fs");
const path = require("path");

const CHALLANS_PATH = path.join(__dirname, "../data/challans.json");
const SENT_LOG_PATH = path.join(__dirname, "../data/sent-emails.log");

function safeReadJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function safeWriteJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function loadChallans() {
  const data = safeReadJson(CHALLANS_PATH, { rows: [] });
  return Array.isArray(data.rows) ? data.rows : [];
}

function saveChallans(rows) {
  safeWriteJson(CHALLANS_PATH, { rows });
}

function nextId(rows) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.id || 0)), 0);
  return max + 1;
}

function createChallan(row) {
  const rows = loadChallans();
  const id = nextId(rows);
  const now = new Date().toISOString();
  const out = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    sendResult: null,
    ...row,
  };
  rows.unshift(out);
  saveChallans(rows);
  return out;
}

function updateChallan(id, patch) {
  const rows = loadChallans();
  const idx = rows.findIndex((r) => Number(r.id) === Number(id));
  if (idx < 0) return null;
  rows[idx] = { ...rows[idx], ...patch, updatedAt: new Date().toISOString() };
  saveChallans(rows);
  return rows[idx];
}

function appendSentLog(line) {
  fs.appendFileSync(SENT_LOG_PATH, `${line}\n`);
}

module.exports = {
  loadChallans,
  createChallan,
  updateChallan,
  appendSentLog,
};

