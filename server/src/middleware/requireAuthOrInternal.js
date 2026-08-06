const jwt = require("jsonwebtoken");

function requireAuthOrInternal(req, res, next) {
  const internalKey = String(process.env.INTERNAL_API_KEY || "").trim();
  const provided = String(req.headers["x-internal-key"] || "").trim();
  if (internalKey && provided && provided === internalKey) {
    req.user = {
      id: 0,
      email: "internal@service",
      role: "SERVICE",
      mustChangePassword: false,
    };
    return next();
  }

  const h = String(req.headers.authorization || "");
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    return res.status(401).json({ error: "unauthorized", message: "Missing or invalid Authorization header." });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "server_error", message: "JWT not configured" });
  }
  try {
    const payload = jwt.verify(m[1], secret);
    if (payload.typ !== "access") throw new Error("wrong token type");
    req.user = {
      id: Number(payload.sub),
      email: String(payload.email || ""),
      role: String(payload.role || "USER"),
      mustChangePassword: Boolean(payload.mc),
    };
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized", message: "Missing or invalid Authorization header." });
  }
}

module.exports = { requireAuthOrInternal };
