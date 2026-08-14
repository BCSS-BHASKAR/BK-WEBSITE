const { isAuditAdmin } = require("../lib/chatAudit");

function requireAuditAdmin(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "unauthorized", message: "Authentication required." });
  }
  if (!isAuditAdmin(req.user.role)) {
    return res.status(403).json({ error: "forbidden", message: "Admin access required for audit queries." });
  }
  return next();
}

module.exports = { requireAuditAdmin };
