"use strict";

// Access control: two roles, per-user page access.
//
//   admin -> every page, implicitly. Nothing to tick, cannot be reduced.
//   user  -> exactly the pages selected on that person's account.
//
// Access is chosen per person when the account is created, rather than by
// maintaining role tiers. Absence of a grant means denied, so a page added
// later is closed for existing users until someone ticks it.
//
// The client hides what a user cannot reach; this API independently refuses the
// underlying data (middleware/requirePageAccess.js). Hiding a menu item is not
// security.

const express = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");
const { PAGES, PAGE_KEYS } = require("../lib/pages");
const { requirePage, invalidatePermissionCache } = require("../middleware/requirePageAccess");

const router = express.Router();

const ROLES = [
  { role: "admin", label: "Administrator", description: "Full access to every page, including user administration." },
  { role: "user", label: "User", description: "Access limited to the pages selected on their account." },
];

// Only administrators may administer accounts.
const adminOnly = requirePage("access_control");

function actorOf(req) {
  return (req.user && (req.user.email || req.user.sub)) || null;
}

async function audit(action, target, actor, pageKey = null) {
  await pool
    .query(
      `INSERT INTO rbac_audit (role, page_key, action, target, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      ["user", pageKey, action, target, actor]
    )
    .catch(() => {});
}

/** Pages a user can reach. Admin is implicitly everything. */
async function pagesForUser(userId, role) {
  if (role === "admin") return PAGE_KEYS.slice();
  const [rows] = await pool.query(
    `SELECT page_key FROM user_page_permission WHERE user_id = ?`,
    [userId]
  );
  return rows.map((r) => r.page_key);
}

async function ensureRbacSeed() {
  try {
    for (const r of ROLES) {
      await pool.query(
        `INSERT INTO app_role (role, label, description, is_builtin)
         VALUES (?, ?, ?, true)
         ON CONFLICT (role) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description`,
        [r.role, r.label, r.description]
      );
    }
  } catch (e) {
    console.error("[rbac] seed failed:", e.message);
  }
}

/** Effective permissions for the caller. Every client fetches this on load. */
router.get("/me", async (req, res) => {
  try {
    const role = String((req.user && req.user.role) || "").trim().toLowerCase();
    const userId = Number(req.user && req.user.id);
    const pages = await pagesForUser(userId, role);
    res.json({ role, pages, isAdmin: role === "admin" });
  } catch (e) {
    console.error("rbac me", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** The page catalogue, for rendering the selection checkboxes. */
router.get("/pages", (_req, res) => {
  res.json({ pages: PAGES.map(({ key, label, group, route }) => ({ key, label, group, route })) });
});

/** The two roles. Kept as an endpoint so the UI never hardcodes them. */
router.get("/roles", adminOnly, (_req, res) => res.json({ roles: ROLES }));

/** Users with their individual page grants. */
router.get("/users", adminOnly, async (_req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, email, role, must_change_password, disabled_at, created_at
         FROM anpr_app_users ORDER BY id`
    );
    const [perms] = await pool.query(`SELECT user_id, page_key FROM user_page_permission`);
    const byUser = new Map();
    for (const p of perms) {
      if (!byUser.has(p.user_id)) byUser.set(p.user_id, []);
      byUser.get(p.user_id).push(p.page_key);
    }
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        disabledAt: u.disabled_at,
        mustChangePassword: Boolean(u.must_change_password),
        // Admins are shown as holding everything, matching what they can do.
        pages: u.role === "admin" ? PAGE_KEYS.slice() : byUser.get(u.id) || [],
      })),
    });
  } catch (e) {
    console.error("rbac users", e);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * Create a user and choose their pages in the same step - this is where access
 * is decided, rather than by assigning a pre-built role tier.
 */
router.post("/users", adminOnly, async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = body.role === "admin" ? "admin" : "user";
  const pages = Array.isArray(body.pages) ? body.pages.map(String) : [];

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "bad_request", message: "A valid email is required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "bad_request", message: "Password must be at least 8 characters." });
  }
  const unknown = pages.filter((k) => !PAGE_KEYS.includes(k));
  if (unknown.length) {
    return res.status(400).json({ error: "bad_request", message: `Unknown pages: ${unknown.join(", ")}` });
  }
  if (role === "user" && pages.length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Select at least one page, otherwise this account can sign in but see nothing.",
    });
  }

  try {
    const [[dupe]] = await pool.query(`SELECT 1 AS ok FROM anpr_app_users WHERE lower(email) = ?`, [email]);
    if (dupe) return res.status(409).json({ error: "conflict", message: "That email already has an account." });

    const hash = await bcrypt.hash(password, 12);
    const [ins] = await pool.query(
      `INSERT INTO anpr_app_users (email, password_hash, role, must_change_password)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [email, hash, role, body.mustChangePassword === false ? 0 : 1]
    );
    const userId = ins.insertId;

    if (role !== "admin") {
      for (const k of pages) {
        await pool.query(
          `INSERT INTO user_page_permission (user_id, page_key, granted_by) VALUES (?, ?, ?)`,
          [userId, k, actorOf(req)]
        );
      }
    }
    await audit("user_created", email, actorOf(req));
    invalidatePermissionCache();
    res.status(201).json({
      ok: true, id: userId, email, role,
      pages: role === "admin" ? PAGE_KEYS.slice() : pages,
    });
  } catch (e) {
    console.error("rbac create user", e);
    res.status(500).json({ error: "server_error", message: e.message });
  }
});

/** Change which pages an existing user can reach. */
router.put("/users/:id/pages", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const pages = Array.isArray(req.body && req.body.pages) ? req.body.pages.map(String) : null;
  if (!Number.isFinite(id) || !pages) return res.status(400).json({ error: "bad_request" });

  const unknown = pages.filter((k) => !PAGE_KEYS.includes(k));
  if (unknown.length) return res.status(400).json({ error: "bad_request", message: `Unknown pages: ${unknown.join(", ")}` });

  try {
    const [[u]] = await pool.query(`SELECT email, role FROM anpr_app_users WHERE id = ?`, [id]);
    if (!u) return res.status(404).json({ error: "not_found" });
    if (u.role === "admin") {
      return res.status(400).json({
        error: "bad_request",
        message: "Administrators always have every page. Change their role to User first.",
      });
    }
    await pool.query(`DELETE FROM user_page_permission WHERE user_id = ?`, [id]);
    for (const k of pages) {
      await pool.query(
        `INSERT INTO user_page_permission (user_id, page_key, granted_by) VALUES (?, ?, ?)`,
        [id, k, actorOf(req)]
      );
    }
    await audit("pages_changed", u.email, actorOf(req));
    invalidatePermissionCache();
    res.json({ ok: true, id, pages });
  } catch (e) {
    console.error("rbac set user pages", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Switch a user between administrator and user. */
router.put("/users/:id/role", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const role = (req.body && req.body.role) === "admin" ? "admin" : "user";
  try {
    const [[target]] = await pool.query(`SELECT email, role FROM anpr_app_users WHERE id = ?`, [id]);
    if (!target) return res.status(404).json({ error: "not_found" });

    if (target.role === "admin" && role !== "admin") {
      const [[admins]] = await pool.query(
        `SELECT COUNT(*) AS n FROM anpr_app_users WHERE role = 'admin' AND disabled_at IS NULL`
      );
      if (Number(admins.n) <= 1) {
        return res.status(400).json({
          error: "bad_request",
          message: "This is the only administrator; promote another account first.",
        });
      }
    }
    // token_version bumps so live sessions re-authenticate with the new role.
    await pool.query(
      `UPDATE anpr_app_users SET role = ?, token_version = token_version + 1 WHERE id = ?`,
      [role, id]
    );
    // Demoting to user leaves no page grants, so the account sees nothing until
    // pages are ticked - safer than inheriting a stale set.
    if (role === "admin") await pool.query(`DELETE FROM user_page_permission WHERE user_id = ?`, [id]);
    await audit("role_changed", target.email, actorOf(req));
    invalidatePermissionCache();
    res.json({
      ok: true, id, role,
      note:
        role === "user"
          ? "Existing sessions were invalidated. Select the pages this account should reach."
          : "Existing sessions were invalidated.",
    });
  } catch (e) {
    console.error("rbac set user role", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Enable or disable an account without deleting it. */
router.put("/users/:id/status", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const disabled = Boolean(req.body && req.body.disabled);
  try {
    const [[target]] = await pool.query(`SELECT email, role FROM anpr_app_users WHERE id = ?`, [id]);
    if (!target) return res.status(404).json({ error: "not_found" });
    if (disabled && target.role === "admin") {
      const [[admins]] = await pool.query(
        `SELECT COUNT(*) AS n FROM anpr_app_users WHERE role = 'admin' AND disabled_at IS NULL`
      );
      if (Number(admins.n) <= 1) {
        return res.status(400).json({ error: "bad_request", message: "Cannot disable the only administrator." });
      }
    }
    await pool.query(
      `UPDATE anpr_app_users
          SET disabled_at = ${disabled ? "now()" : "NULL"}, token_version = token_version + 1
        WHERE id = ?`,
      [id]
    );
    await audit(disabled ? "user_disabled" : "user_enabled", target.email, actorOf(req));
    invalidatePermissionCache();
    res.json({ ok: true, id, disabled });
  } catch (e) {
    console.error("rbac set user status", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Reset a password. */
router.put("/users/:id/password", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const password = String((req.body && req.body.password) || "");
  if (password.length < 8) {
    return res.status(400).json({ error: "bad_request", message: "Password must be at least 8 characters." });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const [r] = await pool.query(
      `UPDATE anpr_app_users
          SET password_hash = ?, must_change_password = 1, token_version = token_version + 1
        WHERE id = ?`,
      [hash, id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
    await audit("password_reset", String(id), actorOf(req));
    res.json({ ok: true, note: "Existing sessions were invalidated." });
  } catch (e) {
    console.error("rbac reset password", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/audit", adminOnly, async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM rbac_audit ORDER BY changed_at DESC LIMIT 200`);
    res.json({ rows });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

module.exports = { rbacRouter: router, ensureRbacSeed };
