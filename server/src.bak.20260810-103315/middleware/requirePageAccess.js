"use strict";

// Enforces access control on the API.
//
// This is the half that matters. The client hides nav entries and blocks routes
// for usability, but anyone can type a URL or call the API directly - so the
// grant is checked here too, per user, on every request whose path maps to a
// protected page.
//
// Model: role 'admin' has every page implicitly; role 'user' has exactly the
// pages ticked on their account. Absence of a grant is denial.

const { pool } = require("../db");
const { pageForApiPath, PAGE_KEYS } = require("../lib/pages");

const CACHE_TTL_MS = 15_000;
const cache = new Map(); // userId -> { pages:Set, expires:number }

async function pagesForUser(userId, role) {
  // Administrators are not stored page-by-page; they hold everything.
  if (role === "admin") return new Set(PAGE_KEYS);

  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.pages;

  const [rows] = await pool.query(
    `SELECT page_key FROM user_page_permission WHERE user_id = ?`,
    [userId]
  );
  const pages = new Set(rows.map((r) => r.page_key));
  cache.set(userId, { pages, expires: Date.now() + CACHE_TTL_MS });
  return pages;
}

/** Drop cached grants so a permission change takes effect immediately. */
function invalidatePermissionCache(userId = null) {
  if (userId) cache.delete(Number(userId));
  else cache.clear();
}

function identity(req) {
  // requireAuth sets { id, email, role, ... } - and uses the uppercase "ADMIN"
  // for the internal service key, so the role is normalised here.
  const role = String((req.user && req.user.role) || "").trim().toLowerCase();
  const userId = Number(req.user && req.user.id);
  return { role, userId };
}

/**
 * Express middleware, mounted after requireAuth. A path that maps to no page is
 * left alone - this guards pages, not every endpoint in the app.
 */
function requirePageAccess(req, res, next) {
  // req.baseUrl is the mount point (e.g. /api/inference); req.path is the rest.
  const full = `${req.baseUrl || ""}${req.path || ""}`.replace(/^\/api/, "");
  const page = pageForApiPath(full);
  if (!page) return next();

  const { role, userId } = identity(req);
  if (!role || !Number.isFinite(userId)) {
    return res.status(403).json({ error: "forbidden", message: "No account context." });
  }
  // The internal service key (id 0) is a trusted server-to-server caller.
  if (userId === 0 && role === "admin") return next();

  pagesForUser(userId, role)
    .then((pages) => {
      if (pages.has(page.key)) return next();
      res.status(403).json({
        error: "forbidden",
        message: `Your account does not have access to ${page.label}.`,
        page: page.key,
      });
    })
    .catch((e) => {
      console.error("[rbac] permission check failed:", e.message);
      // Fail CLOSED: a database problem must not silently grant access.
      res.status(503).json({ error: "permission_check_failed" });
    });
}

/** Guard a whole router on one explicit page, e.g. the user-administration API. */
function requirePage(pageKey) {
  return (req, res, next) => {
    const { role, userId } = identity(req);
    if (!role || !Number.isFinite(userId)) return res.status(403).json({ error: "forbidden" });
    pagesForUser(userId, role)
      .then((pages) =>
        pages.has(pageKey)
          ? next()
          : res.status(403).json({ error: "forbidden", message: "Administrator access required.", page: pageKey })
      )
      .catch(() => res.status(503).json({ error: "permission_check_failed" }));
  };
}

module.exports = { requirePageAccess, requirePage, invalidatePermissionCache };
