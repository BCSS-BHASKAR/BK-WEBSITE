"use strict";

// Administrator settings.
//
// Two kinds of setting live here and they behave differently:
//
//  1. APP settings (general scope) - site name, timezone, formats, auto-refresh.
//     This app owns them outright; saving takes effect immediately.
//
//  2. DETECTOR settings (per-module scopes) - loitering threshold, after-hours
//     schedule, ROI, confidence. The detectors run on the on-prem OMEN host,
//     NOT here, and this app has no inbound channel to it. So saving persists
//     the value AND publishes a versioned config.json to the S3 bucket both
//     sides already share. The on-prem services must poll that object and apply
//     it; until they do, a saved detector value is recorded and advertised but
//     not yet in force. `pendingDelivery` in the response says exactly that, so
//     the UI can be honest rather than implying control it does not have.
//
// The contract the on-prem side implements is documented in
// server/INFERENCE_CONFIG_CONTRACT.md.

const express = require("express");
const { pool } = require("../db");
const { publishConfig, readPublishedConfig, CONFIG_KEY } = require("../lib/inferenceConfigPublisher");

const router = express.Router();

// Scopes this app owns end-to-end; everything else is detector-side.
const APP_SCOPES = new Set(["general"]);
const MODULE_SCOPES = new Set([
  "walkins", "loitering", "intrusion", "after_hours", "kitchen_unattended",
]);
const ALL_SCOPES = new Set([...APP_SCOPES, ...MODULE_SCOPES]);

/** Reject anything that would produce a detector config the OMEN box can't use. */
function validate(scope, value) {
  const errors = [];
  const num = (k, min, max) => {
    if (value[k] === undefined) return;
    const n = Number(value[k]);
    if (!Number.isFinite(n) || n < min || n > max) errors.push(`${k} must be between ${min} and ${max}`);
  };
  if (scope === "general") {
    num("defaultReportDays", 1, 365);
    num("autoRefreshSeconds", 10, 3600);
    if (value.timezone && !/^[A-Za-z]+\/[A-Za-z_+-]+$/.test(String(value.timezone))) {
      errors.push("timezone must be an IANA zone, e.g. Asia/Kolkata");
    }
  }
  if (scope === "loitering") num("thresholdSeconds", 10, 7200);
  if (scope === "kitchen_unattended") { num("maxUnattendedSeconds", 10, 7200); num("alertCooldownSeconds", 0, 7200); }
  if (scope === "walkins") { num("minPersonSize", 1, 5000); num("cooldownSeconds", 0, 3600); }
  if (scope === "intrusion") num("alertDelaySeconds", 0, 3600);
  if (scope === "after_hours") {
    num("startHour", 0, 23);
    num("endHour", 0, 23);
    if (Number(value.startHour) === Number(value.endHour)) {
      errors.push("startHour and endHour cannot be the same");
    }
  }
  if (value.confidence !== undefined) num("confidence", 0, 1);
  return errors;
}

router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT scope, value, version, updated_by, updated_at FROM app_setting ORDER BY scope`
    );
    const settings = {};
    for (const r of rows) {
      settings[r.scope] = {
        value: r.value,
        version: r.version,
        updatedBy: r.updated_by,
        updatedAt: r.updated_at,
        // Detector scopes only take effect once the on-prem services read the
        // published config; app scopes are live the moment they are saved.
        appliedBy: MODULE_SCOPES.has(r.scope) ? "inference-host" : "web-app",
      };
    }
    let published = null;
    try {
      published = await readPublishedConfig();
    } catch {
      published = null;
    }
    res.json({
      settings,
      publishedConfig: published
        ? { version: published.version, publishedAt: published.publishedAt, key: CONFIG_KEY }
        : null,
    });
  } catch (e) {
    console.error("settings get", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.put("/:scope", async (req, res) => {
  const scope = String(req.params.scope);
  if (!ALL_SCOPES.has(scope)) return res.status(404).json({ error: "unknown_scope" });

  const value = req.body && typeof req.body === "object" ? req.body.value ?? req.body : null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return res.status(400).json({ error: "bad_request", message: "value object required" });
  }
  const errors = validate(scope, value);
  if (errors.length) return res.status(400).json({ error: "validation_failed", errors });

  const actor = (req.user && (req.user.email || req.user.sub)) || null;
  try {
    const [[prev]] = await pool.query(`SELECT value, version FROM app_setting WHERE scope = ?`, [scope]);
    const [saved] = await pool.query(
      `INSERT INTO app_setting (scope, value, version, updated_by, updated_at)
       VALUES (?, ?::jsonb, 1, ?, now())
       ON CONFLICT (scope) DO UPDATE SET
         value = EXCLUDED.value,
         version = app_setting.version + 1,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING version`,
      [scope, JSON.stringify(value), actor]
    );
    const version = saved.rows && saved.rows[0] ? saved.rows[0].version : (prev ? prev.version + 1 : 1);

    await pool.query(
      `INSERT INTO app_setting_audit (scope, old_value, new_value, version, changed_by)
       VALUES (?, ?::jsonb, ?::jsonb, ?, ?)`,
      [scope, prev ? JSON.stringify(prev.value) : null, JSON.stringify(value), version, actor]
    );

    // Detector settings additionally need delivering to the on-prem host.
    let publish = { attempted: false };
    if (MODULE_SCOPES.has(scope)) {
      publish = await publishConfig(pool, actor);
    }
    res.json({
      ok: true,
      scope,
      version,
      appliedImmediately: APP_SCOPES.has(scope),
      pendingDelivery: MODULE_SCOPES.has(scope),
      publish,
    });
  } catch (e) {
    console.error("settings put", e);
    res.status(500).json({ error: "server_error", message: e.message });
  }
});

/** Re-publish the current detector config without changing any value. */
router.post("/publish", async (req, res) => {
  try {
    const actor = (req.user && (req.user.email || req.user.sub)) || null;
    res.json(await publishConfig(pool, actor));
  } catch (e) {
    console.error("settings publish", e);
    res.status(500).json({ error: "server_error", message: e.message });
  }
});

/** Recent configuration changes - who changed what, and whether it published. */
router.get("/audit", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, scope, new_value, version, changed_by, changed_at, published, publish_error
         FROM app_setting_audit ORDER BY changed_at DESC LIMIT 100`
    );
    res.json({ rows });
  } catch (e) {
    console.error("settings audit", e);
    res.status(500).json({ error: "server_error" });
  }
});

module.exports = { settingsRouter: router };
