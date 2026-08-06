const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

async function findLoginRow(email) {
  const [[anpr]] = await pool.query(
    `
    SELECT
      id,
      email,
      password_hash,
      role,
      must_change_password,
      token_version,
      locked_until
    FROM anpr_app_users
    WHERE LOWER(TRIM(email)) = ? AND disabled_at IS NULL
    LIMIT 1
  `,
    [email]
  );
  if (anpr) return { kind: "anpr", row: anpr };

  const [[laravel]] = await pool.query(
    `
    SELECT
      id,
      email,
      password AS password_hash,
      role_name AS role,
      0 AS must_change_password,
      0 AS token_version,
      NULL AS locked_until
    FROM users
    WHERE LOWER(TRIM(email)) = ? AND status = 'active'
    LIMIT 1
  `,
    [email]
  );
  if (laravel && laravel.password_hash) return { kind: "laravel", row: laravel };
  return null;
}

function signPair(row) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing");
  const sub = String(row.id);
  const email = String(row.email || "");
  const role = String(row.role || "viewer");
  const tv = Number(row.token_version || 0);
  const mc = Boolean(row.must_change_password);
  const accessToken = jwt.sign({ sub, email, role, typ: "access", tv, mc }, secret, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ sub, typ: "refresh", tv }, secret, { expiresIn: "30d" });
  return {
    accessToken,
    refreshToken,
    user: {
      id: Number(row.id),
      email,
      role,
      mustChangePassword: Boolean(row.must_change_password),
    },
  };
}

router.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "bad_request", message: "email and password required" });
  }
  try {
    const found = await findLoginRow(email);
    if (!found || !found.row.password_hash) {
      return res.status(401).json({ error: "unauthorized", message: "Invalid credentials." });
    }
    const { row } = found;
    if (row.locked_until) {
      const until = new Date(row.locked_until);
      if (!Number.isNaN(until.getTime()) && until > new Date()) {
        return res.status(403).json({ error: "locked", message: "This account is temporarily locked. Try again later." });
      }
    }
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "unauthorized", message: "Invalid credentials." });
    }
    return res.json(signPair(row));
  } catch (e) {
    console.error("login", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.post("/refresh", async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  if (!refreshToken) {
    return res.status(400).json({ error: "bad_request", message: "refreshToken required" });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "server_error" });
  }
  try {
    const payload = jwt.verify(refreshToken, secret);
    if (payload.typ !== "refresh") {
      return res.status(401).json({ error: "unauthorized" });
    }
    const tvClaim = Number(payload.tv || 0);
    const [[anpr]] = await pool.query(
      "SELECT id, email, password_hash, role, must_change_password, token_version, locked_until FROM anpr_app_users WHERE id = ? AND disabled_at IS NULL LIMIT 1",
      [payload.sub]
    );
    if (anpr) {
      if (Number(anpr.token_version || 0) !== tvClaim) {
        return res.status(401).json({ error: "unauthorized", message: "Session revoked. Sign in again." });
      }
      return res.json(signPair(anpr));
    }
    const [[laravel]] = await pool.query(
      "SELECT id, email, password AS password_hash, role_name AS role, 0 AS must_change_password, 0 AS token_version, NULL AS locked_until FROM users WHERE id = ? AND status = 'active' LIMIT 1",
      [payload.sub]
    );
    if (laravel) {
      if (tvClaim !== 0) {
        return res.status(401).json({ error: "unauthorized" });
      }
      return res.json(signPair(laravel));
    }
    return res.status(401).json({ error: "unauthorized" });
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      mustChangePassword: req.user.mustChangePassword,
    },
  });
});

module.exports = { authRouter: router };
