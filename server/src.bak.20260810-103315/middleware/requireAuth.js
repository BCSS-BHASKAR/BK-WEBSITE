const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const internalKey = req.headers["x-internal-key"];
  if (internalKey && process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) {
    req.user = { id: 0, email: "internal@service", role: "ADMIN", mustChangePassword: false };
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

module.exports = { requireAuth };
