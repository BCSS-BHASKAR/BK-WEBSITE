const express = require("express");
const { queryAuditRecords, countAuditRecords } = require("../lib/chatAudit");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const filters = {
      user_id: req.query.user_id,
      email: req.query.email,
      session_id: req.query.session_id,
      route: req.query.route,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit,
      offset: req.query.offset,
    };
    const [rows, total] = await Promise.all([
      queryAuditRecords(filters),
      countAuditRecords(filters),
    ]);
    return res.json({
      total,
      count: rows.length,
      limit: Math.min(Math.max(Number(filters.limit) || 50, 1), 500),
      offset: Math.max(Number(filters.offset) || 0, 0),
      records: rows,
    });
  } catch (err) {
    console.error("chat-audit query", err);
    return res.status(500).json({ error: "server_error", message: "Could not query audit records." });
  }
});

module.exports = { chatAuditRouter: router };
