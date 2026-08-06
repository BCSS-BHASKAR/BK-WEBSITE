const nodemailer = require("nodemailer");
const { CAMERA_REGISTRY } = require("../cameras");

const ALERT_EMAIL = "shivang.agarwal@bluecloudsoftech.com";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;     // run check every 5 minutes
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;  // alert after 5 min offline
const DAILY_ALERT_HOUR_PH = 10;              // 10:00 AM Philippines time

// Track which Manila date the daily summary was last sent
let lastDailyAlertDate = null;

// ─── SMTP ────────────────────────────────────────────────────────────────────

function smtpReady() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT &&
    process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

function buildTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const opts = {
    host: String(process.env.SMTP_HOST), port, secure,
    auth: { user: String(process.env.SMTP_USER), pass: String(process.env.SMTP_PASS) },
  };
  if (!secure && port === 587) opts.requireTLS = true;
  return nodemailer.createTransport(opts);
}

async function sendMail(subject, html, text) {
  if (!smtpReady()) {
    console.warn("[CameraAlert] SMTP not configured — skipping:", subject);
    return;
  }
  try {
    const from = String(process.env.SMTP_FROM || "PNP Operations <no-reply@pnp.local>");
    await buildTransport().sendMail({ from, to: ALERT_EMAIL, subject, html, text });
    console.log("[CameraAlert] Sent:", subject);
  } catch (e) {
    console.error("[CameraAlert] Email failed:", e.message || e);
  }
}

// ─── DATE HELPERS (Philippines time) ─────────────────────────────────────────

function toManilaDate(d = new Date()) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD
}

function manilaHour(d = new Date()) {
  return Number(new Date(d).toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }));
}

function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// ─── EMAIL BUILDERS ───────────────────────────────────────────────────────────

function headerHtml(title) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#1a237e;padding:24px 32px;">
  <p style="margin:0;font-size:11px;color:#9fa8da;letter-spacing:1px;text-transform:uppercase;">PNP Traffic Enforcement System</p>
  <h1 style="margin:6px 0 0;font-size:22px;color:#fff;font-weight:700;">${title}</h1>
</td></tr>`;
}

const footerHtml = `
<tr><td style="padding:16px 32px 24px;border-top:1px solid #eee;">
  <p style="margin:0;font-size:12px;color:#9e9e9e;line-height:1.6;">
    This is an automated alert from the <strong>PNP Operations Console</strong>.<br>
    Do not reply to this email.
  </p>
</td></tr>
</table></td></tr></table></body></html>`;

function offlineCameraRows(cameras) {
  return cameras.map((c, i) => `
    <tr ${i % 2 === 0 ? "" : 'style="background:#fafafa;"'}>
      <td style="font-size:14px;color:#212121;font-weight:700;padding:10px 16px;">${c.camera_name}</td>
      <td style="padding:10px 16px;"><span style="background:#ffebee;color:#c62828;font-size:12px;font-weight:700;padding:3px 10px;border-radius:12px;">OFFLINE</span></td>
      <td style="font-size:13px;color:#757575;padding:10px 16px;">${fmtDateTime(c.offline_since)}</td>
    </tr>`).join("");
}

function offlineSummaryTable(cameras) {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">
  <tr style="background:#f5f5f5;">
    <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#616161;letter-spacing:0.5px;text-transform:uppercase;border-bottom:1px solid #e0e0e0;">Camera</td>
    <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#616161;letter-spacing:0.5px;text-transform:uppercase;border-bottom:1px solid #e0e0e0;">Status</td>
    <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#616161;letter-spacing:0.5px;text-transform:uppercase;border-bottom:1px solid #e0e0e0;">Offline Since</td>
  </tr>
  ${offlineCameraRows(cameras)}
</table>`;
}

function actionBox() {
  return `
<tr><td style="padding:0 32px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;">
    <tr><td style="padding:16px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f57f17;">ACTION REQUIRED</p>
      <ul style="margin:4px 0 0;padding-left:18px;font-size:13px;color:#5d4037;line-height:1.9;">
        <li>Camera power supply and physical connections</li>
        <li>Network / IP connectivity at the camera site</li>
        <li>NVR / DVR recording and streaming status</li>
        <li>Camera lens and hardware condition</li>
      </ul>
    </td></tr>
  </table>
</td></tr>`;
}

// Alert email: triggered when a new camera crosses the 15-min threshold
function buildOfflineAlertHtml(newCamera, allOfflineCameras) {
  const isMultiple = allOfflineCameras.length > 1;
  const others = allOfflineCameras.filter((c) => c.camera_id !== newCamera.camera_id);

  let html = headerHtml("Camera Offline Alert");
  html += `<tr><td style="background:#b71c1c;padding:12px 32px;">
    <p style="margin:0;color:#fff;font-size:14px;font-weight:600;">
      ⚠&nbsp;&nbsp;<strong>${newCamera.camera_name}</strong> has been offline for more than 5 minutes.
    </p>
  </td></tr>
  <tr><td style="padding:24px 32px 16px;">${offlineSummaryTable([newCamera, ...others])}</td></tr>`;

  if (isMultiple) {
    html += `<tr><td style="padding:0 32px 16px;">
      <p style="margin:0;font-size:13px;color:#c62828;font-weight:600;">
        ⚠ ${allOfflineCameras.length} cameras are currently offline.
      </p>
    </td></tr>`;
  }

  html += actionBox();
  html += footerHtml;
  return html;
}

// Daily 10 AM summary email
function buildDailySummaryHtml(offlineCameras, dateStr) {
  let html = headerHtml(`Daily Camera Status — ${dateStr}`);
  html += `<tr><td style="background:#b71c1c;padding:12px 32px;">
    <p style="margin:0;color:#fff;font-size:14px;font-weight:600;">
      ⚠&nbsp;&nbsp;${offlineCameras.length} camera${offlineCameras.length > 1 ? "s remain" : " remains"} offline as of 10:00 AM today.
    </p>
  </td></tr>
  <tr><td style="padding:24px 32px 16px;">${offlineSummaryTable(offlineCameras)}</td></tr>`;
  html += actionBox();
  html += footerHtml;
  return html;
}

// ─── CAMERA ONLINE CHECK ──────────────────────────────────────────────────────

async function fetchOnlineStatus(pool) {
  const cutoffMs = Date.now() - 15 * 60 * 1000;
  const lastSeen = new Map();

  const [evRows, wRows, cRows] = await Promise.all([
    pool.query(`SELECT camera_id, MAX(CASE WHEN timestamp > 0 THEN timestamp ELSE UNIX_TIMESTAMP(created_at)*1000 END) AS ms FROM vehicle_events GROUP BY camera_id`),
    pool.query(`SELECT camera_id, MAX(UNIX_TIMESTAMP(trigger_date)*1000) AS ms FROM walkins GROUP BY camera_id`),
    pool.query(`SELECT camera_id, MAX(UNIX_TIMESTAMP(trigger_date)*1000) AS ms FROM crowds GROUP BY camera_id`),
  ]);

  for (const [rows] of [evRows, wRows, cRows]) {
    for (const r of rows || []) {
      const id = String(r.camera_id || "").trim();
      const ms = Number(r.ms) || 0;
      if (ms > (lastSeen.get(id) || 0)) lastSeen.set(id, ms);
    }
  }

  return CAMERA_REGISTRY.map((cam) => {
    const ms = lastSeen.get(cam.id) || 0;
    return { camera_id: cam.id, camera_name: cam.name, online: ms > 0 && ms >= cutoffMs };
  });
}

// ─── DB HELPERS ───────────────────────────────────────────────────────────────

async function loadDbStatus(pool) {
  const [rows] = await pool.query(
    `SELECT camera_id, camera_name, status, offline_since, alert_sent_at FROM camera_alert_status`
  );
  const map = new Map();
  for (const r of rows || []) map.set(r.camera_id, r);
  return map;
}

async function getAllOfflineFromDb(pool) {
  const [rows] = await pool.query(
    `SELECT camera_id, camera_name, offline_since FROM camera_alert_status WHERE status = 'offline' ORDER BY offline_since ASC`
  );
  return rows || [];
}

// ─── MAIN CHECK ───────────────────────────────────────────────────────────────

async function runCheck(pool) {
  try {
    const now = new Date();
    const [cameras, dbStatus] = await Promise.all([fetchOnlineStatus(pool), loadDbStatus(pool)]);

    for (const cam of cameras) {
      const { camera_id, camera_name, online } = cam;
      const prev = dbStatus.get(camera_id);

      if (online) {
        const wasAlerted = prev?.alert_sent_at;

        await pool.query(
          `INSERT INTO camera_alert_status (camera_id, camera_name, status, last_seen_online, offline_since, alert_sent_at)
           VALUES (?, ?, 'online', ?, NULL, NULL)
           ON DUPLICATE KEY UPDATE camera_name=VALUES(camera_name), status='online', last_seen_online=VALUES(last_seen_online), offline_since=NULL, alert_sent_at=NULL`,
          [camera_id, camera_name, now]
        );

        if (wasAlerted) {
          console.log(`[CameraAlert] ${camera_name} recovered — no email sent (daily 10 AM handles status)`);
        }

      } else {
        if (!prev || prev.status === "online") {
          // Transition: just went offline — record offline_since, no alert yet
          await pool.query(
            `INSERT INTO camera_alert_status (camera_id, camera_name, status, offline_since, alert_sent_at)
             VALUES (?, ?, 'offline', ?, NULL)
             ON DUPLICATE KEY UPDATE camera_name=VALUES(camera_name), status='offline', offline_since=VALUES(offline_since), alert_sent_at=NULL`,
            [camera_id, camera_name, now]
          );
        } else {
          // Was already offline
          await pool.query(`UPDATE camera_alert_status SET camera_name=? WHERE camera_id=?`, [camera_name, camera_id]);

          const offlineSince = prev.offline_since ? new Date(prev.offline_since) : now;
          const offlineMs = now.getTime() - offlineSince.getTime();
          const alreadyAlerted = !!prev.alert_sent_at;

          if (offlineMs >= OFFLINE_THRESHOLD_MS && !alreadyAlerted) {
            // Get all currently offline cameras to include in the email
            const allOffline = await getAllOfflineFromDb(pool);
            // Make sure the current camera has an offline_since set
            const thisCamEntry = allOffline.find((c) => c.camera_id === camera_id)
              || { camera_id, camera_name, offline_since: offlineSince };

            await sendMail(
              `[ALERT] Camera Offline – ${camera_name}`,
              buildOfflineAlertHtml(thisCamEntry, allOffline.length ? allOffline : [thisCamEntry]),
              buildOfflineText(camera_name, thisCamEntry.offline_since, allOffline)
            );
            await pool.query(`UPDATE camera_alert_status SET alert_sent_at=NOW() WHERE camera_id=?`, [camera_id]);
            console.log(`[CameraAlert] Offline alert sent for ${camera_name} (${allOffline.length} total offline)`);
          }
        }
      }
    }

    // ── Daily 10 AM Philippines summary ──────────────────────────────────────
    const todayPH = toManilaDate(now);
    const hourPH = manilaHour(now);

    if (hourPH === DAILY_ALERT_HOUR_PH && lastDailyAlertDate !== todayPH) {
      const stillOffline = await getAllOfflineFromDb(pool);
      if (stillOffline.length > 0) {
        const dateLabel = now.toLocaleDateString("en-PH", {
          timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric",
        });
        await sendMail(
          `[DAILY STATUS] ${stillOffline.length} Camera${stillOffline.length > 1 ? "s" : ""} Offline – ${dateLabel}`,
          buildDailySummaryHtml(stillOffline, dateLabel),
          `Daily status: ${stillOffline.map((c) => c.camera_name).join(", ")} offline as of 10:00 AM ${dateLabel}.`
        );
        console.log(`[CameraAlert] Daily 10AM summary sent — ${stillOffline.length} camera(s) offline`);
      }
      lastDailyAlertDate = todayPH; // mark today done whether or not any were offline
    }

  } catch (e) {
    console.error("[CameraAlert] Check failed:", e.message || e);
  }
}

function buildOfflineText(triggeredName, offlineSince, allOffline) {
  const lines = allOffline.map((c) => `  - ${c.camera_name} (offline since ${fmtDateTime(c.offline_since)})`).join("\n");
  return `PNP TRAFFIC ENFORCEMENT SYSTEM — CAMERA OFFLINE ALERT
======================================================
${triggeredName} has been offline for more than 15 minutes.

Currently Offline Cameras:
${lines || `  - ${triggeredName} (offline since ${fmtDateTime(offlineSince)})`}

ACTION REQUIRED: Check power, network, and NVR/DVR status.
This is an automated alert. Do not reply.`;
}

// ─── START ────────────────────────────────────────────────────────────────────

function startCameraAlertMonitor(pool) {
  console.log("[CameraAlert] Monitor started — checks every 5 min, alerts after 15 min offline, daily summary at 10 AM PH");
  setTimeout(() => {
    void runCheck(pool);
    setInterval(() => void runCheck(pool), CHECK_INTERVAL_MS);
  }, CHECK_INTERVAL_MS);
}

module.exports = { startCameraAlertMonitor };
