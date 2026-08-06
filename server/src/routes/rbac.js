"use strict";

// Role-based access control API.
//
// A user has one role; a role is granted a set of pages. Absence of a grant
// means denied, so a newly added page is closed by default rather than
// silently visible to everyone.
//
// LOCKOUT GUARD: the admin role always keeps 'settings' and 'access_control'.
// Without it an administrator can untick their own box and permanently lock
// every account out of the screen that grants access - unrecoverable without
// direct database surgery.

const express = require("express");
const { pool } = require("../db");
const { PAGES, PAGE_KEYS } = require("../lib/pages");
const { requirePage, invalidatePermissionCache } = require("../middleware/requirePageAccess");

const router = express.Router();

const PROTECTED_ADMIN_PAGES = new Set(["settings", "access_control"]);

// /me and /pages are readable by ANY authenticated user - a client cannot
// render its own nav without them. Everything else administers access and is
// gated on the access_control page.
const adminOnly = requirePage("access_control");

async function audit(role, pageKey, action, actor, target = null) {
  await pool
    .query(
      `INSERT INTO rbac_audit (role, page_key, action, target, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [role, pageKey, action, target, actor]
    )
    .catch(() => {});
}

function actorOf(req) {
  return (req.user && (req.user.email || req.user.sub)) || null;
}

/**
 * Grant any page the catalogue knows about but the database has never seen to
 * the admin role. Keeps admin whole as pages are added, without opening them
 * to anyone else.
 */
async function ensureRbacSeed() {
  try {
    const [rows] = await pool.query(`SELECT page_key FROM role_page_permission WHERE role = 'admin'`);
    const have = new Set(rows.map((r) => r.page_key));
    const missing = PAGE_KEYS.filter((k) => !have.has(k));
    for (const k of missing) {
      await pool.query(
        `INSERT INTO role_page_permission (role, page_key, granted_by)
         VALUES ('admin', ?, 'system') ON CONFLICT DO NOTHING`,
        [k]
      );
    }
    if (missing.length) console.log(`[rbac] granted ${missing.length} new page(s) to admin`);
  } catch (e) {
    console.error("[rbac] seed failed:", e.message);
  }
}

/** Effective permissions for the caller. Every client fetches this on load. */
router.get("/me", async (req, res) => {
  try {
    const role = String((req.user && req.user.role) || "").trim();
    const [rows] = await pool.query(
      `SELECT page_key FROM role_page_permission WHERE role = ?`,
      [role]
    );
    const pages = rows.map((r) => r.page_key);
    res.json({
      role,
      // An unknown role gets nothing rather than everything.
      pages,
      isAdmin: role === "admin",
    });
  } catch (e) {
    console.error("rbac me", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** The page catalogue, for rendering the permission matrix. */
router.get("/pages", (_req, res) => {
  res.json({ pages: PAGES.map(({ key, label, group, route }) => ({ key, label, group, route })) });
});

/** Roles with their granted pages and how many users hold each. */
router.get("/roles", adminOnly, async (_req, res) => {
  try {
    const [roles] = await pool.query(
      `SELECT r.role, r.label, r.description, r.is_builtin,
              (SELECT COUNT(*) FROM anpr_app_users u WHERE u.role = r.role) AS user_count
         FROM app_role r ORDER BY r.is_builtin DESC, r.role`
    );
    const [perms] = await pool.query(`SELECT role, page_key FROM role_page_permission`);
    const byRole = new Map();
    for (const p of perms) {
      if (!byRole.has(p.role)) byRole.set(p.role, []);
      byRole.get(p.role).push(p.page_key);
    }
    res.json({
      roles: roles.map((r) => ({
        role: r.role,
        label: r.label,
        description: r.description,
        isBuiltin: r.is_builtin,
        userCount: Number(r.user_count || 0),
        pages: byRole.get(r.role) || [],
      })),
    });
  } catch (e) {
    console.error("rbac roles", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Replace a role's page set - this is what the checkbox matrix saves. */
router.put("/roles/:role/pages", adminOnly, async (req, res) => {
  const role = String(req.params.role);
  const requested = Array.isArray(req.body && req.body.pages) ? req.body.pages.map(String) : null;
  if (!requested) return res.status(400).json({ error: "bad_request", message: "pages array required" });

  const unknown = requested.filter((k) => !PAGE_KEYS.includes(k));
  if (unknown.length) {
    return res.status(400).json({ error: "bad_request", message: `unknown pages: ${unknown.join(", ")}` });
  }

  let pages = Array.from(new Set(requested));
  let forced = [];
  if (role === "admin") {
    // Refuse to let the administrator revoke their own way back in.
    forced = [...PROTECTED_ADMIN_PAGES].filter((k) => !pages.includes(k));
    pages = Array.from(new Set([...pages, ...PROTECTED_ADMIN_PAGES]));
  }

  const actor = actorOf(req);
  try {
    const [[exists]] = await pool.query(`SELECT 1 AS ok FROM app_role WHERE role = ?`, [role]);
    if (!exists) return res.status(404).json({ error: "unknown_role" });

    const [before] = await pool.query(`SELECT page_key FROM role_page_permission WHERE role = ?`, [role]);
    const had = new Set(before.map((r) => r.page_key));

    await pool.query(`DELETE FROM role_page_permission WHERE role = ?`, [role]);
    for (const k of pages) {
      await pool.query(
        `INSERT INTO role_page_permission (role, page_key, granted_by) VALUES (?, ?, ?)`,
        [role, k, actor]
      );
    }
    for (const k of pages) if (!had.has(k)) await audit(role, k, "grant", actor);
    for (const k of had) if (!pages.includes(k)) await audit(role, k, "revoke", actor);
    // Take effect now rather than after the cache TTL.
    invalidatePermissionCache(role);

    res.json({
      ok: true, role, pages,
      forcedPages: forced,
      note: forced.length
        ? "Settings and Roles & Access are always kept for the admin role to prevent lockout."
        : undefined,
    });
  } catch (e) {
    console.error("rbac put pages", e);
    res.status(500).json({ error: "server_error", message: e.message });
  }
});

/** Create a custom role. */
router.post("/roles", adminOnly, async (req, res) => {
  const role = String((req.body && req.body.role) || "").trim().toLowerCase();
  const label = String((req.body && req.body.label) || "").trim() || role;
  if (!/^[a-z0-9_-]{2,64}$/.test(role)) {
    return res.status(400).json({ error: "bad_request", message: "role must be 2-64 chars, a-z 0-9 _ -" });
  }
  try {
    await pool.query(
      `INSERT INTO app_role (role, label, description) VALUES (?, ?, ?)
       ON CONFLICT (role) DO NOTHING`,
      [role, label, (req.body && req.body.description) || null]
    );
    await audit(role, null, "role_created", actorOf(req));
    res.status(201).json({ ok: true, role });
  } catch (e) {
    console.error("rbac create role", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/roles/:role", adminOnly, async (req, res) => {
  const role = String(req.params.role);
  try {
    const [[r]] = await pool.query(`SELECT is_builtin FROM app_role WHERE role = ?`, [role]);
    if (!r) return res.status(404).json({ error: "unknown_role" });
    if (r.is_builtin) return res.status(400).json({ error: "bad_request", message: "built-in roles cannot be deleted" });
    const [[u]] = await pool.query(`SELECT COUNT(*) AS n FROM anpr_app_users WHERE role = ?`, [role]);
    if (Number(u.n) > 0) {
      return res.status(400).json({ error: "bad_request", message: `${u.n} user(s) still hold this role` });
    }
    await pool.query(`DELETE FROM app_role WHERE role = ?`, [role]);
    await audit(role, null, "role_deleted", actorOf(req));
    res.json({ ok: true });
  } catch (e) {
    console.error("rbac delete role", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Users and their roles, for the assignment table. */
router.get("/users", adminOnly, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, role, must_change_password, disabled_at, created_at
         FROM anpr_app_users ORDER BY id`
    );
    res.json({ users: rows });
  } catch (e) {
    console.error("rbac users", e);
    res.status(500).json({ error: "server_error" });
  }
});

/** Assign a role to a user. */
router.put("/users/:id/role", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const role = String((req.body && req.body.role) || "").trim();
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_request" });
  try {
    const [[exists]] = await pool.query(`SELECT 1 AS ok FROM app_role WHERE role = ?`, [role]);
    if (!exists) return res.status(400).json({ error: "bad_request", message: "unknown role" });

    // Never allow the last administrator to demote themselves.
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

    // token_version bumps so existing sessions re-authenticate with the new role.
    await pool.query(
      `UPDATE anpr_app_users SET role = ?, token_version = token_version + 1 WHERE id = ?`,
      [role, id]
    );
    invalidatePermissionCache();
    await audit(role, null, "user_role_changed", actorOf(req), target.email);
    res.json({ ok: true, id, role, note: "The user's existing sessions were invalidated." });
  } catch (e) {
    console.error("rbac set user role", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/audit", adminOnly, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM rbac_audit ORDER BY changed_at DESC LIMIT 200`
    );
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

module.exports = { rbacRouter: router, ensureRbacSeed };
