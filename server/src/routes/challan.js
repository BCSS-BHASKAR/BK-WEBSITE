const express = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { loadMergedCameraMap, resolveCameraName, normalizeCameraId } = require("../cameras");
const { evManilaDate, evManilaDateTimeFmt } = require("../eventTimeSql");
const { replaceOwners, normalizePlate, isResolvablePlate } = require("../lib/demoOwners");
const { createChallan, loadChallans, updateChallan } = require("../lib/demoChallans");
const { sendChallanEmail, smtpConfigured } = require("../lib/demoMailer");
const { buildChallanEmail } = require("../lib/challanEmailTemplate");
const { generateChallanPdf } = require("../lib/challanPdf");
const { uploadToS3, getPresignedPdfUrl } = require("../lib/inferenceMediaStore");
const { sanitizeOffenseCodes, labelsFor } = require("../lib/tctOffenses");
const { ymdSite } = require("../siteTimeZone");
const { clampDateRange } = require("../lib/chatSecurity");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
});

function money(n) {
  const v = Number(n || 0);
  return `₱ ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function violationLabel(type) {
  const t = String(type || "").toUpperCase();
  if (t === "NO_HELMET") return "No Helmet";
  if (t === "WRONG_PARKING") return "Wrong Parking";
  if (t === "TRIPLE_RIDING") return "Triple Riding";
  if (t === "WRONG_ROUTE") return "Wrong Route";
  return String(type || "Violation").replace(/_/g, " ");
}

async function updateViolationPlateInDb(violationId, plate) {
  const normalized = normalizePlate(plate);
  if (!normalized) {
    return { ok: false, error: "bad_request", message: "plate required" };
  }
  if (!isResolvablePlate(normalized)) {
    return { ok: false, error: "bad_request", message: "Enter a valid vehicle number." };
  }
  const id = Number(violationId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "bad_request", message: "violationId required" };
  }

  const [[row]] = await pool.query(
    `SELECT tv.event_id AS event_id FROM traffic_violations tv WHERE tv.id = ? LIMIT 1`,
    [id]
  );
  if (!row?.event_id) {
    return { ok: false, error: "not_found", message: "Violation not found." };
  }

  const [result] = await pool.query(
    `
    UPDATE vehicle_events
    SET vehicle_num = ?, was_corrected = 1
    WHERE event_id = ?
  `,
    [normalized, String(row.event_id)]
  );

  if (!result?.affectedRows) {
    return { ok: false, error: "not_found", message: "Vehicle event not found for this violation." };
  }

  return { ok: true, plate: normalized, violationId: id, eventId: String(row.event_id) };
}

router.get("/smtp-status", limiter, (_req, res) => {
  const from = String(process.env.SMTP_FROM || "");
  const user = String(process.env.SMTP_USER || "");
  return res.json({
    configured: smtpConfigured(),
    from: from || (user ? `PNP Violation Desk <${user}>` : null),
    host: process.env.SMTP_HOST ? String(process.env.SMTP_HOST) : null,
    mode: smtpConfigured() ? "smtp" : "demo",
  });
});

router.get("/owners", limiter, (_req, res) => {
  return res.json({ owners: require("../lib/demoOwners").loadOwners() });
});

router.get("/resolve-owner", limiter, (req, res) => {
  const plate = normalizePlate(req.query.plate);
  if (!plate) return res.status(400).json({ error: "bad_request", message: "plate required" });
  if (!isResolvablePlate(plate)) {
    return res.status(400).json({ error: "bad_request", message: "Enter a valid vehicle number." });
  }
  return res.status(503).json({ error: "no_db", message: "No DB connected." });
});

router.post("/owners", limiter, (req, res) => {
  const owners = replaceOwners(req.body || {});
  return res.json({ ok: true, owners });
});

router.post("/confirm-plate", limiter, async (req, res) => {
  const violationId = Number(req.body?.violationId);
  const plate = String(req.body?.plate || "").trim();
  if (!plate) return res.status(400).json({ error: "bad_request", message: "plate required" });
  try {
    const result = await updateViolationPlateInDb(violationId, plate);
    if (!result.ok) {
      const status = result.error === "bad_request" ? 400 : 404;
      return res.status(status).json({ error: result.error, message: result.message });
    }
    return res.json(result);
  } catch (e) {
    console.error("confirm-plate", e);
    return res.status(500).json({ error: "server_error", message: "Failed to save vehicle number." });
  }
});

router.get("/violations-feed", limiter, async (req, res) => {

  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const range = dateRe.test(from) && dateRe.test(to) && to >= from ? { from, to } : { from: "2000-01-01", to: ymdSite() };

  const pageRaw = Number(req.query.page || 1);
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const pageSizeRaw = Number(req.query.pageSize || 30);
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(5, Math.floor(pageSizeRaw)), 200) : 30;
  const offset = (page - 1) * pageSize;

  const order = String(req.query.order || "asc").toLowerCase() === "desc" ? "desc" : "asc";

  const cameraId = String(req.query.cameraId || "").trim();
  const type = String(req.query.type || "").trim().toUpperCase();

  const filterParams = [range.from, range.to];
  let extraFilters = "";
  if (cameraId) {
    extraFilters += " AND ve.camera_id = ?";
    filterParams.push(cameraId);
  }
  if (type) {
    extraFilters += " AND tv.violation_type = ?";
    filterParams.push(type);
  }

  const cameraMap = await loadMergedCameraMap(pool);
  const veD = evManilaDate("ve.created_at", null);
  const veDetected = evManilaDateTimeFmt("ve.created_at", null);

  const sql = `
    SELECT
      tv.id AS violation_id,
      tv.violation_type,
      tv.score,
      COALESCE(NULLIF(TRIM(ve.vehicle_num), ''), NULLIF(TRIM(ve.vehicle_num_raw), ''), '') AS vehicle_num,
      ve.camera_id,
      ${veDetected} AS detected_at,
      ve.full_image_url AS scene_url,
      ve.plate_url AS plate_url
    FROM traffic_violations tv
    JOIN vehicle_events ve ON ve.event_id = tv.event_id
    LEFT JOIN violation_ticket_flags vf ON vf.violation_id = tv.id
    WHERE ${veD} BETWEEN ? AND ?
      AND vf.violation_id IS NULL
      ${extraFilters}
    ORDER BY ve.created_at ${order}, tv.id ${order}
    LIMIT ?
    OFFSET ?
  `;
  try {
    const [[countRow]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      LEFT JOIN violation_ticket_flags vf ON vf.violation_id = tv.id
      WHERE ${veD} BETWEEN ? AND ?
        AND vf.violation_id IS NULL
        ${extraFilters}
    `,
      filterParams
    );

    const [rows] = await pool.query(sql, [...filterParams, pageSize, offset]);
    return res.json({
      from: range.from,
      to: range.to,
      order,
      page,
      pageSize,
      total: Number(countRow?.total || 0),
      rows: (rows || []).map((r) => ({
        id: Number(r.violation_id),
        plate: r.vehicle_num ? String(r.vehicle_num).trim() : "",
        violationType: String(r.violation_type),
        score: Number(r.score || 0),
        cameraId: normalizeCameraId(r.camera_id || ""),
        siteName: resolveCameraName(normalizeCameraId(r.camera_id || ""), cameraMap),
        detectedAt: String(r.detected_at || ""),
        createdAt: r.detected_at ? String(r.detected_at) : "",
        sceneUrl: r.scene_url ? String(r.scene_url) : null,
        plateUrl: r.plate_url ? String(r.plate_url) : null,
      })),
    });
  } catch (e) {
    console.error("violations-feed", e);
    return res.status(500).json({ error: "server_error", message: "Failed to load violations feed." });
  }
});

router.get("/violations-feed-summary", limiter, async (req, res) => {
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const range = dateRe.test(from) && dateRe.test(to) && to >= from ? { from, to } : { from: "2000-01-01", to: ymdSite() };

  const cameraId = String(req.query.cameraId || "").trim();
  const veD = evManilaDate("ve.created_at", null);

  const where = [`${veD} BETWEEN ? AND ?`, "vf.violation_id IS NULL"];
  const params = [range.from, range.to];
  if (cameraId) {
    where.push("ve.camera_id = ?");
    params.push(cameraId);
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT tv.violation_type, COUNT(*) AS total
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      LEFT JOIN violation_ticket_flags vf ON vf.violation_id = tv.id
      WHERE ${where.join(" AND ")}
      GROUP BY tv.violation_type
    `,
      params
    );
    const byType = {};
    let total = 0;
    for (const r of rows || []) {
      const c = Number(r.total || 0);
      byType[r.violation_type] = c;
      total += c;
    }
    return res.json({ from: range.from, to: range.to, total, byType });
  } catch (e) {
    console.error("violations-feed-summary", e);
    return res.status(500).json({ error: "server_error", message: "Failed to load feed summary." });
  }
});

router.post("/flag", limiter, async (req, res) => {
  const violationId = Number(req.body?.violationId);
  const flag = Number(req.body?.flag);
  const challanId = req.body?.challanId != null ? Number(req.body.challanId) : null;
  if (!Number.isFinite(violationId) || violationId <= 0) {
    return res.status(400).json({ error: "bad_request", message: "violationId required" });
  }
  if (!(flag === 0 || flag === 1)) {
    return res.status(400).json({ error: "bad_request", message: "flag must be 0 or 1" });
  }
  try {
    await pool.query(
      `
      INSERT INTO violation_ticket_flags (violation_id, flag, challan_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        flag = VALUES(flag),
        challan_id = VALUES(challan_id),
        updated_at = CURRENT_TIMESTAMP
    `,
      [violationId, flag, Number.isFinite(challanId) ? challanId : null]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("flag violation", e);
    return res.status(500).json({ error: "server_error", message: "Failed to update violation flag." });
  }
});

router.post("/create", limiter, async (req, res) => {
  const violationId = req.body?.violationId != null ? Number(req.body.violationId) : null;
  const plate = normalizePlate(req.body?.plate);
  const violationType = String(req.body?.violationType || "").trim().toUpperCase();
  const amount = Number(req.body?.amount || 0);
  const siteName = req.body?.siteName ? String(req.body.siteName) : null;
  const cameraId = req.body?.cameraId ? String(req.body.cameraId) : null;
  const detectedAt = req.body?.detectedAt ? String(req.body.detectedAt) : null;
  const proofUrl = req.body?.proofUrl ? String(req.body.proofUrl) : null;
  const source = String(req.body?.source || "manual");
  const offenses = sanitizeOffenseCodes(req.body?.offenses);
  const offenseLabels = labelsFor(offenses);
  const othersText = req.body?.othersText ? String(req.body.othersText).trim().slice(0, 1000) : null;
  const accident = String(req.body?.accident || "").toLowerCase() === "yes" ? "yes" : "no";

  if (!plate) return res.status(400).json({ error: "bad_request", message: "plate required" });
  if (!violationType) return res.status(400).json({ error: "bad_request", message: "violationType required" });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "bad_request", message: "amount required" });
  if (!offenses.length) return res.status(400).json({ error: "bad_request", message: "Select at least one offense." });

  const ownerName = req.body?.ownerName ? String(req.body.ownerName).trim() : null;
  const ownerEmail = req.body?.ownerEmail ? String(req.body.ownerEmail).trim() : null;
  const ownerPhone = req.body?.ownerPhone ? String(req.body.ownerPhone).trim() : null;
  const ownerAddress = req.body?.ownerAddress ? String(req.body.ownerAddress).trim() : null;
  if (!ownerEmail) {
    return res.status(400).json({ error: "bad_request", message: "Owner email is required." });
  }

  if (Number.isFinite(violationId) && Number(violationId) > 0) {
    try {
      await updateViolationPlateInDb(Number(violationId), plate);
    } catch (e) {
      console.error("update plate on create", e);
    }
  }

  const challan = createChallan({
    plate,
    violationType,
    amount,
    siteName,
    cameraId,
    detectedAt,
    proofUrl,
    offenses,
    offenseLabels,
    othersText,
    accident,
    paymentStatus: "unpaid",
    penaltyType: "first_offense",
    ownerEmail,
    ownerName: ownerName || null,
    ownerPhone: ownerPhone || null,
    ownerAddress: ownerAddress || null,
    source,
    violationId: Number.isFinite(violationId) && Number(violationId) > 0 ? Number(violationId) : null,
  });

  if (Number.isFinite(violationId) && Number(violationId) > 0) {
    try {
      await pool.query(
        `
        INSERT INTO violation_ticket_flags (violation_id, flag, challan_id)
        VALUES (?, 1, ?)
        ON DUPLICATE KEY UPDATE
          flag = 1,
          challan_id = VALUES(challan_id),
          updated_at = CURRENT_TIMESTAMP
      `,
        [Number(violationId), challan.id]
      );
    } catch (e) {
      console.error("flag on create", e);

    }
  }

  return res.json({
    ok: true,
    challan,
    owner: {
      email: ownerEmail,
      name: ownerName,
      phone: ownerPhone,
      address: ownerAddress,
    },
  });
});

router.post("/send/:id", limiter, async (req, res) => {
  const id = Number(req.params.id);
  const rows = loadChallans();
  const challan = rows.find((r) => Number(r.id) === id);
  if (!challan) return res.status(404).json({ error: "not_found", message: "Ticket not found." });

  if (!smtpConfigured()) {
    return res.status(503).json({
      error: "smtp_not_configured",
      message:
        "SMTP is not configured. Set SMTP_PASS in /home/aiserver/mern-vsp/server/smtp.env (Google App Password), then restart the API.",
      challan,
    });
  }

  try {
    const { subject, text, html, attachments } = await buildChallanEmail(challan);
    const result = await sendChallanEmail({
      to: challan.ownerEmail,
      subject,
      text,
      html,
      attachments,
      meta: { challanId: challan.id, plate: challan.plate },
    });
    if (!result.ok || result.mode === "demo") {
      const updated = updateChallan(id, { status: "failed", sendResult: result });
      return res.status(500).json({
        error: "server_error",
        message: result.error || "Email was not sent (SMTP not active).",
        challan: updated,
        send: result,
      });
    }
    const updated = updateChallan(id, { status: "sent", sendResult: result });

    // Generate PDF and upload to S3 (non-blocking — email already confirmed)
    try {
      const pdfBuffer = await generateChallanPdf(challan);
      const safePlate = String(challan.plate || "").replace(/[^A-Z0-9]/gi, "");
      const pdfKey = `tickets/MTMDO-${String(id).padStart(5, "0")}-${safePlate}.pdf`;
      await uploadToS3(pdfKey, pdfBuffer, "application/pdf");
      updateChallan(id, { pdfS3Key: pdfKey });
      updated.pdfS3Key = pdfKey;
    } catch (pdfErr) {
      console.error("challan pdf gen/upload", pdfErr.message || pdfErr);
    }

    return res.json({ ok: true, challan: updated, send: result });
  } catch (e) {
    console.error("send challan", e);
    const updated = updateChallan(id, { status: "failed", sendResult: { ok: false, error: String(e?.message || e) } });
    return res.status(500).json({ error: "server_error", message: "Failed to send email.", challan: updated });
  }
});

router.get("/:id/pdf", limiter, async (req, res) => {
  const id = Number(req.params.id);
  const rows = loadChallans();
  const challan = rows.find((r) => Number(r.id) === id);
  if (!challan) return res.status(404).json({ error: "not_found" });
  try {
    const pdfBuffer = await generateChallanPdf(challan);
    const filename = `TCT-${String(id).padStart(6, "0")}-${String(challan.plate || "").replace(/[^A-Z0-9]/gi, "")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (e) {
    console.error("challan pdf stream", e.message || e);
    return res.status(500).json({ error: "server_error", message: "Could not generate PDF." });
  }
});

router.get("/:id/pdf-url", limiter, async (req, res) => {
  const id = Number(req.params.id);
  const rows = loadChallans();
  const challan = rows.find((r) => Number(r.id) === id);
  if (!challan) return res.status(404).json({ error: "not_found" });
  if (!challan.pdfS3Key) return res.status(404).json({ error: "pdf_not_found", message: "PDF not yet available for this ticket." });
  try {
    const url = await getPresignedPdfUrl(challan.pdfS3Key, 900);
    return res.json({ url, filename: `TCT-${String(id).padStart(6, "0")}-${challan.plate || ""}.pdf` });
  } catch (e) {
    console.error("pdf-url", e.message || e);
    return res.status(500).json({ error: "server_error", message: "Could not generate PDF link." });
  }
});

router.get("/history", limiter, (req, res) => {
  const q = String(req.query.q || "").trim().toUpperCase();
  const status = String(req.query.status || "").trim().toLowerCase();
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const plate = normalizePlate(req.query.plate);
  const violationType = String(req.query.violationType || "").trim().toUpperCase();
  const site = String(req.query.siteName || "").trim().toUpperCase();
  const rows = loadChallans();
  const filtered = rows.filter((r) => {
    if (status && String(r.status || "").toLowerCase() !== status) return false;
    if (from && String(r.createdAt || "").slice(0, 10) < from) return false;
    if (to && String(r.createdAt || "").slice(0, 10) > to) return false;
    if (plate && normalizePlate(r.plate) !== plate) return false;
    if (violationType && String(r.violationType || "").toUpperCase() !== violationType) return false;
    if (site && String(r.siteName || "").toUpperCase() !== site) return false;
    if (!q) return true;
    return (
      String(r.plate || "").toUpperCase().includes(q) ||
      String(r.ownerEmail || "").toUpperCase().includes(q) ||
      String(r.siteName || "").toUpperCase().includes(q)
    );
  });
  return res.json({ rows: filtered.slice(0, 500) });
});

router.get("/stats", limiter, async (req, res) => {
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const range = clampDateRange(from, to) || clampDateRange(ymdSite(), ymdSite());
  const veD = evManilaDate("ve.created_at", null);
  const veDetected = evManilaDateTimeFmt("ve.created_at", null);
  const vfD = evManilaDate("vf.updated_at", null);

  try {
    const flaggedJoin = `
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      INNER JOIN violation_ticket_flags vf ON vf.violation_id = tv.id
      WHERE ${vfD} BETWEEN ? AND ?
    `;

    const [[genRow]] = await pool.query(
      `SELECT COUNT(*) AS n ${flaggedJoin} AND vf.flag = 1`,
      [range.from, range.to]
    );
    const [[invalidRow]] = await pool.query(
      `SELECT COUNT(*) AS n ${flaggedJoin} AND vf.flag = 0`,
      [range.from, range.to]
    );
    const [[pendingRow]] = await pool.query(
      `
      SELECT COUNT(*) AS n
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      LEFT JOIN violation_ticket_flags vf ON vf.violation_id = tv.id
      WHERE vf.violation_id IS NULL
    `
    );

    const [recentRows] = await pool.query(
      `
      SELECT
        tv.id AS violation_id,
        vf.flag,
        vf.challan_id,
        COALESCE(NULLIF(TRIM(ve.vehicle_num), ''), NULLIF(TRIM(ve.vehicle_num_raw), ''), '') AS plate,
        tv.violation_type,
        ${veDetected} AS detected_at,
        ${vfD} AS flagged_at
      FROM traffic_violations tv
      JOIN vehicle_events ve ON ve.event_id = tv.event_id
      INNER JOIN violation_ticket_flags vf ON vf.violation_id = tv.id
      WHERE ${vfD} BETWEEN ? AND ?
      ORDER BY vf.updated_at DESC
      LIMIT 8
    `,
      [range.from, range.to]
    );

    const demoRows = loadChallans().filter((r) => {
      const d = String(r.createdAt || "").slice(0, 10);
      return d >= range.from && d <= range.to;
    });
    const failed = demoRows.filter((r) => r.status === "failed").length;
    const amount = demoRows
      .filter((r) => r.status === "sent" || r.status === "draft")
      .reduce((n, r) => n + Number(r.amount || 0), 0);

    const generated = Number(genRow?.n || 0);
    const invalid = Number(invalidRow?.n || 0);
    const pending = Number(pendingRow?.n || 0);

    return res.json({
      from: range.from,
      to: range.to,
      generated,
      invalid,
      pending,
      failed,
      total: generated,
      amount,
      recent: (recentRows || []).map((r) => ({
        violationId: Number(r.violation_id),
        flag: Number(r.flag),
        challanId: r.challan_id != null ? Number(r.challan_id) : null,
        plate: r.plate ? String(r.plate).trim() : "",
        violationType: String(r.violation_type || ""),
        detectedAt: String(r.detected_at || ""),
        flaggedAt: String(r.flagged_at || ""),
        status: Number(r.flag) === 1 ? "generated" : "invalid",
      })),
    });
  } catch (e) {
    console.error("ticket stats", e);
    return res.status(500).json({ error: "server_error", message: "Failed to load ticket stats." });
  }
});

module.exports = { challanRouter: router };

