"use strict";

// Enforces RBAC on the API.
//
// This is the half that matters. The client hides nav entries and blocks routes
// for usability, but anyone can type a URL or call the API directly - so the
// grant is checked here too, against the caller's role, on every request whose
// path maps to a protected page.
//
// Permissions are cached briefly per role: a settings screen writes them rarely
// and every page load reads them many times.

const { pool } = require("../db");
const { pageForApiPath } = require("../lib/pages");

const CACHE_TTL_MS = 15_000;
const cache = new Map(); // role -> { pages:Set, expires:number }

async function pagesForRole(role) {
  const hit = cache.get(role);
  if (hit && hit.expires > Date.now()) return hit.pages;
  const [rows] = await pool.query(
    `SELECT page_key FROM role_page_permission WHERE role = ?`,
    [role]
  );
  const pages = new Set(rows.map((r) => r.page_key));
  cache.set(role, { pages, expires: Date.now() + CACHE_TTL_MS });
  return pages;
}

/** Drop cached grants so a permission change takes effect immediately. */
function invalidatePermissionCache(role = null) {
  if (role) cache.delete(role);
  else cache.clear();
}

/**
 * Express middleware. Mounted after requireAuth, so req.user is populated.
 * A path that maps to no page is left alone - this guards pages, not every
 * endpoint in the app.
 */
function requirePageAccess(req, res, next) {
  // req.baseUrl is the mount point (e.g. /api/inference); req.path is the rest.
  const full = `${req.baseUrl || ""}${req.path || ""}`.replace(/^\/api/, "");
  const page = pageForApiPath(full);
  if (!page) return next();

  const role = String((req.user && req.user.role) || "").trim();
  if (!role) return res.status(403).json({ error: "forbidden", message: "No role assigned." });

  pagesForRole(role)
    .then((pages) => {
      if (pages.has(page.key)) return next();
      res.status(403).json({
        error: "forbidden",
        message: `Your role does not have access to ${page.label}.`,
        page: page.key,
      });
    })
    .catch((e) => {
      console.error("[rbac] permission check failed:", e.message);
      // Fail CLOSED: a database problem must not silently grant access.
      res.status(503).json({ error: "permission_check_failed" });
    });
}

/** Guard a whole router with one explicit page, e.g. the RBAC admin API. */
function requirePage(pageKey) {
  return (req, res, next) => {
    const role = String((req.user && req.user.role) || "").trim();
    if (!role) return res.status(403).json({ error: "forbidden" });
    pagesForRole(role)
      .then((pages) =>
        pages.has(pageKey)
          ? next()
          : res.status(403).json({ error: "forbidden", message: "Administrator access required.", page: pageKey })
      )
      .catch(() => res.status(503).json({ error: "permission_check_failed" }));
  };
}

module.exports = { requirePageAccess, requirePage, invalidatePermissionCache };
