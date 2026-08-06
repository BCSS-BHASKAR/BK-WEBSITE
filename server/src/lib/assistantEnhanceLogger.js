const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "..", "logs", "assistant_enhance");

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {

  }
}

function logEvent(record) {
  ensureLogDir();
  const day = new Date().toISOString().slice(0, 10);
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...record });
  try {
    fs.appendFileSync(path.join(LOG_DIR, `${day}.jsonl`), `${line}\n`, "utf8");
  } catch (err) {

    console.error("[assistant-enhance] log failed:", err.message);
  }
}

module.exports = { logEvent, LOG_DIR };
