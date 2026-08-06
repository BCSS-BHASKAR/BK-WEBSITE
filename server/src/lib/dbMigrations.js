async function runMigrations(pool) {
  try {
    await ensureTriggers(pool);
    await ensureCameraAlertTable(pool);
  } catch (e) {
    console.error("[Migrations] Failed:", e.message || e);
  }
}

async function ensureTriggers(pool) {
  const [rows] = await pool.query(
    `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE()
     AND TRIGGER_NAME IN ('walkins_set_trigger_date', 'crowds_set_trigger_date')`
  );
  const existing = new Set((rows || []).map((r) => r.TRIGGER_NAME));

  if (!existing.has("walkins_set_trigger_date")) {
    await pool.query(
      `CREATE TRIGGER walkins_set_trigger_date
       BEFORE INSERT ON walkins FOR EACH ROW
       SET NEW.trigger_date = CONVERT_TZ(NOW(), '+05:30', '+08:00')`
    );
    console.log("[Migrations] Created trigger: walkins_set_trigger_date");
  }

  if (!existing.has("crowds_set_trigger_date")) {
    await pool.query(
      `CREATE TRIGGER crowds_set_trigger_date
       BEFORE INSERT ON crowds FOR EACH ROW
       SET NEW.trigger_date = CONVERT_TZ(NOW(), '+05:30', '+08:00')`
    );
    console.log("[Migrations] Created trigger: crowds_set_trigger_date");
  }
}

async function ensureCameraAlertTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS camera_alert_status (
      id INT AUTO_INCREMENT PRIMARY KEY,
      camera_id VARCHAR(100) NOT NULL,
      camera_name VARCHAR(255) NOT NULL,
      status ENUM('online','offline') NOT NULL DEFAULT 'offline',
      last_seen_online DATETIME NULL,
      offline_since DATETIME NULL,
      alert_sent_at DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_camera_id (camera_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = { runMigrations };
