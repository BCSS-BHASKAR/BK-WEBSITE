const express = require("express");
const { pool } = require("../db");
const { loadMergedCameraMap, resolveCameraName, normalizeCameraId, listCameraRegistry } = require("../cameras");
const { evManilaDate, evManilaDateTimeFmt } = require("../eventTimeSql");
const {
  buildRuleConditions,
  mapRuleRow,
  parseConditions,
  parseJson,
  plateMatches,
  loadSites,
  siteNameMap,
  loadWatchPlateMatchers,
  summarizeConditions,
  tableExists,
} = require("../lib/watchlistDb");

const router = express.Router();

const evDve = evManilaDate("ve.created_at", null);
const evDisplayFmtVe = evManilaDateTimeFmt("ve.created_at", null);

function parseRange(req) {
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  return { from, to: from > to ? from : to };
}

function paginate(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize || 10)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

router.get("/sites", async (_req, res) => {
  try {
    res.json({ sites: await loadSites(pool) });
  } catch (e) {
    console.error("watchlist sites", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/rules", async (req, res) => {
  if (!(await tableExists(pool, "lpr_rules"))) {
    return res.json({ total: 0, rows: [], page: 1, pageSize: 10 });
  }
  const { page, pageSize, offset } = paginate(req);
  const where = [];
  const params = [];

  const name = String(req.query.name || req.query.rule_name || "").trim();
  if (name) {
    where.push("r.name LIKE ?");
    params.push(`%${name}%`);
  }
  if (req.query.site_id) {
    where.push("r.site_id = ?");
    params.push(Number(req.query.site_id));
  }
  const cameraId = String(req.query.camera_id || "").trim();
  if (cameraId) {
    where.push("r.conditions LIKE ?");
    params.push(`%"${cameraId.replace(/"/g, '\\"')}"%`);
  }
  if (req.query.filter_type) {
    where.push("r.filterType = ?");
    params.push(req.query.filter_type);
  }
  if (req.query.access_type) {
    where.push("r.access_type = ?");
    params.push(req.query.access_type);
  }
  if (req.query.security_type) {
    where.push("r.security_type = ?");
    params.push(req.query.security_type);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  try {
    const sites = await siteNameMap(pool);
    const cameraMap = await loadMergedCameraMap(pool);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM lpr_rules r ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT r.* FROM lpr_rules r ${whereSql} ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({
      total: Number(total || 0),
      page,
      pageSize,
      rows: rows.map((r) => mapRuleRow(r, sites.get(r.site_id), cameraMap)),
    });
  } catch (e) {
    console.error("watchlist rules list", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/rules/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM lpr_rules WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    const sites = await siteNameMap(pool);
    const cameraMap = await loadMergedCameraMap(pool);
    res.json({ rule: mapRuleRow(rows[0], sites.get(rows[0].site_id), cameraMap) });
  } catch (e) {
    console.error("watchlist rule get", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/cameras", async (_req, res) => {
  try {
    const cameraMap = await loadMergedCameraMap(pool);
    const cameras = listCameraRegistry().map((c) => ({
      id: c.id,
      name: resolveCameraName(c.id, cameraMap),
    }));
    res.json({ cameras, cameraMap });
  } catch (e) {
    console.error("watchlist cameras", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/rules", async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.access_type || !body.security_type) {
    return res.status(400).json({ error: "bad_request", message: "Missing required fields" });
  }
  const cameraIds = Array.isArray(body.camera_ids) ? body.camera_ids : [];
  if (!cameraIds.length) {
    return res.status(400).json({ error: "bad_request", message: "Select at least one camera" });
  }
  try {
    const conditions = JSON.stringify(buildRuleConditions(body.condition_rows, cameraIds));
    const vehicleListIds = '""';
    const siteId = body.site_id ?? 1;
    const [result] = await pool.query(
      `INSERT INTO lpr_rules
        (enabled, barrierOpen, filterType, vehicleListIds, name, access_type, security_type, priority, site_id, conditions, notes, valid_from, valid_to, created_at, updated_at)
       VALUES (1, 0, 'plate', ?, ?, ?, ?, 10, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        vehicleListIds,
        body.name,
        body.access_type,
        body.security_type,
        siteId,
        conditions,
        body.notes ?? "",
        body.valid_from ?? null,
        body.valid_to ?? null,
      ]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error("watchlist rule create", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.put("/rules/:id", async (req, res) => {
  const body = req.body || {};
  const cameraIds = Array.isArray(body.camera_ids) ? body.camera_ids : [];
  if (!cameraIds.length) {
    return res.status(400).json({ error: "bad_request", message: "Select at least one camera" });
  }
  try {
    const conditions = JSON.stringify(buildRuleConditions(body.condition_rows, cameraIds));
    await pool.query(
      `UPDATE lpr_rules SET
        filterType = 'plate', vehicleListIds = ?, name = ?, access_type = ?, security_type = ?,
        site_id = ?, conditions = ?, notes = ?, valid_from = ?, valid_to = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        '""',
        body.name,
        body.access_type,
        body.security_type,
        body.site_id ?? 1,
        conditions,
        body.notes ?? "",
        body.valid_from ?? null,
        body.valid_to ?? null,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("watchlist rule update", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/rules/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM lpr_rules WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("watchlist rule delete", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/vehicle-lists", async (req, res) => {
  if (!(await tableExists(pool, "lpr_vehicle_lists"))) {
    return res.json({ total: 0, rows: [], page: 1, pageSize: 10 });
  }
  const { page, pageSize, offset } = paginate(req);
  const where = [];
  const params = [];
  const name = String(req.query.name || "").trim();
  if (name) {
    where.push("l.name LIKE ?");
    params.push(`%${name}%`);
  }
  if (req.query.site_id) {
    where.push("l.site_id = ?");
    params.push(Number(req.query.site_id));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  try {
    const sites = await siteNameMap(pool);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM lpr_vehicle_lists l ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT l.*, (SELECT COUNT(*) FROM lpr_vehicle_list_vehicles v WHERE v.vehicle_list_id = l.id) AS entry_count
       FROM lpr_vehicle_lists l ${whereSql}
       ORDER BY l.updated_at DESC, l.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({
      total: Number(total || 0),
      page,
      pageSize,
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        enabled: Boolean(r.enabled),
        siteId: r.site_id,
        siteName: sites.get(r.site_id) ?? null,
        notes: r.notes,
        entryCount: Number(r.entry_count || 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    console.error("vehicle-lists", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/vehicle-lists", async (req, res) => {
  const { name, site_id, enabled, notes } = req.body || {};
  if (!name || !site_id) return res.status(400).json({ error: "bad_request" });
  try {
    const now = Math.floor(Date.now() / 1000);
    const [result] = await pool.query(
      `INSERT INTO lpr_vehicle_lists (enabled, name, notes, site_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [enabled ? 1 : 0, name, notes ?? null, site_id, now, now]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error("vehicle-list create", e);
    res.status(500).json({ error: "server_error", message: e.message });
  }
});

router.put("/vehicle-lists/:id", async (req, res) => {
  const { name, site_id, enabled, notes } = req.body || {};
  try {
    const now = Math.floor(Date.now() / 1000);
    await pool.query(
      `UPDATE lpr_vehicle_lists SET name = ?, site_id = ?, enabled = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [name, site_id, enabled ? 1 : 0, notes ?? null, now, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("vehicle-list update", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/vehicle-lists/:id/toggle", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT enabled FROM lpr_vehicle_lists WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    const next = rows[0].enabled ? 0 : 1;
    const now = Math.floor(Date.now() / 1000);
    await pool.query("UPDATE lpr_vehicle_lists SET enabled = ?, updated_at = ? WHERE id = ?", [next, now, req.params.id]);
    res.json({ enabled: Boolean(next) });
  } catch (e) {
    console.error("vehicle-list toggle", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/vehicle-lists/:id/entries", async (req, res) => {
  const { page, pageSize, offset } = paginate(req);
  try {
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM lpr_vehicle_list_vehicles WHERE vehicle_list_id = ?",
      [req.params.id]
    );
    const [rows] = await pool.query(
      `SELECT * FROM lpr_vehicle_list_vehicles WHERE vehicle_list_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
      [req.params.id, pageSize, offset]
    );
    res.json({
      total: Number(total || 0),
      page,
      pageSize,
      rows: rows.map((r) => ({
        id: r.id,
        vehicleListId: r.vehicle_list_id,
        conditions: parseConditions(r.conditions),
        summary: summarizeConditions(r.conditions),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    console.error("vehicle-list entries", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/vehicle-lists/:id/entries", async (req, res) => {
  const built = buildConditions(req.body?.condition_rows);
  if (!built.length) return res.status(400).json({ error: "bad_request", message: "At least one condition required" });
  try {
    const [result] = await pool.query(
      `INSERT INTO lpr_vehicle_list_vehicles (vehicle_list_id, conditions, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
      [req.params.id, JSON.stringify(built)]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error("vehicle-list entry create", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.put("/entries/:id", async (req, res) => {
  const built = buildConditions(req.body?.condition_rows);
  try {
    await pool.query(`UPDATE lpr_vehicle_list_vehicles SET conditions = ?, updated_at = NOW() WHERE id = ?`, [
      JSON.stringify(built),
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error("entry update", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/entries/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM lpr_vehicle_list_vehicles WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/hits", async (req, res) => {
  const range = parseRange(req);
  if (!range) return res.status(400).json({ error: "bad_request", message: "from/to required (YYYY-MM-DD)" });
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const source = String(req.query.source || "all");
  const cameraMap = await loadMergedCameraMap(pool);
  const rows = [];

  try {
    if ((source === "all" || source === "triggers") && (await tableExists(pool, "rule_event_triggers"))) {
      const where = ["DATE(ret.trigger_date) BETWEEN ? AND ?"];
      const params = [range.from, range.to];
      if (req.query.plate) {
        where.push("e.lp LIKE ?");
        params.push(`%${req.query.plate}%`);
      }
      if (req.query.rule_name) {
        where.push("r.name = ?");
        params.push(req.query.rule_name);
      }
      if (req.query.site_id) {
        where.push("r.site_id = ?");
        params.push(Number(req.query.site_id));
      }
      if (req.query.access_type) {
        where.push("r.access_type = ?");
        params.push(req.query.access_type);
      }
      if (req.query.security_type) {
        where.push("LOWER(r.security_type) = LOWER(?)");
        params.push(req.query.security_type);
      }

      const hasEvents = await tableExists(pool, "events");
      if (hasEvents) {
        const [triggerRows] = await pool.query(
          `SELECT ret.id, ret.trigger_date, ret.rule_id, e.lp AS plate, r.name AS rule_name,
                  r.access_type, r.security_type, s.name AS site_name
           FROM rule_event_triggers ret
           LEFT JOIN events e ON e.event_id = ret.event_id
           LEFT JOIN lpr_rules r ON r.id = ret.rule_id
           LEFT JOIN sites s ON s.id = r.site_id
           WHERE ${where.join(" AND ")}
           ORDER BY ret.trigger_date DESC
           LIMIT ?`,
          [...params, limit]
        );
        for (const r of triggerRows) {
          rows.push({
            id: `t-${r.id}`,
            source: "trigger",
            plate: r.plate,
            ruleName: r.rule_name,
            listName: r.rule_name,
            accessType: r.access_type,
            securityType: r.security_type,
            siteName: r.site_name,
            camera: null,
            createdAt: r.trigger_date,
          });
        }
      }
    }

    if ((source === "all" || source === "anpr") && (await tableExists(pool, "vehicle_events"))) {
      const { matchers } = await loadWatchPlateMatchers(pool);
      if (matchers.length) {
        const [veRows] = await pool.query(
          `SELECT ve.id, ve.vehicle_num, ve.camera_id, ${evDisplayFmtVe} AS created_at
           FROM vehicle_events ve
           WHERE ${evDve} BETWEEN ? AND ?
           ORDER BY ve.created_at DESC
           LIMIT 500`,
          [range.from, range.to]
        );
        for (const ve of veRows) {
          const hit = matchers.find((m) => plateMatches(ve.vehicle_num, [m], ve.camera_id));
          if (!hit) continue;
          if (req.query.plate && !String(ve.vehicle_num).toUpperCase().includes(String(req.query.plate).toUpperCase())) {
            continue;
          }
          rows.push({
            id: `ve-${ve.id}`,
            source: "anpr",
            plate: ve.vehicle_num,
            ruleName: hit.ruleName ?? null,
            listName: hit.listName || "Watchlist",
            accessType: null,
            securityType: null,
            siteName: null,
            camera: resolveCameraName(normalizeCameraId(ve.camera_id), cameraMap),
            cameraId: ve.camera_id,
            createdAt: ve.created_at,
          });
          if (rows.length >= limit) break;
        }
      }
    }

    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    let activeWatchlists = 0;
    try {
      const [[cnt]] = await pool.query(`SELECT COUNT(*) AS c FROM lpr_vehicle_lists WHERE enabled = 1`);
      const [[rcnt]] = await pool.query(`SELECT COUNT(*) AS c FROM lpr_rules WHERE enabled = 1`);
      activeWatchlists = Number(cnt?.c || 0) + Number(rcnt?.c || 0);
    } catch {

    }

    res.json({
      from: range.from,
      to: range.to,
      limit,
      activeWatchlists,
      lastHit: rows[0]?.createdAt ?? null,
      rows: rows.slice(0, limit),
    });
  } catch (e) {
    console.error("watchlist hits", e);
    res.json({ from: range.from, to: range.to, limit, rows: [], activeWatchlists: 0, lastHit: null });
  }
});

router.get("/rule-names", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT DISTINCT name FROM lpr_rules ORDER BY name");
    res.json({ names: rows.map((r) => r.name) });
  } catch {
    res.json({ names: [] });
  }
});

module.exports = { watchlistRouter: router };
