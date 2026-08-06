const path = require("path");
require("dotenv").config();

const smtpEnv = path.join(__dirname, "..", "smtp.env");
require("dotenv").config({ path: smtpEnv });
if (!String(process.env.SMTP_PASS || "").trim()) {
  require("dotenv").config({ path: path.join(__dirname, "..", "smtp.env.example") });
}
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { authRouter } = require("./routes/auth");
const { dashboardRouter } = require("./routes/dashboard");
const { streamsRouter } = require("./routes/streams");
const { watchlistRouter } = require("./routes/watchlist");
const { chatRouter } = require("./routes/chat");
const { assistantEnhanceRouter } = require("./routes/assistantEnhance");
const { walkingEnrollRouter, walkingEnrollMediaRouter } = require("./routes/walkingEnroll");
const { chatAuditRouter } = require("./routes/chatAudit");
const { challanRouter } = require("./routes/challan");
const { startCameraAlertMonitor } = require("./lib/cameraAlertMonitor");
const { inferenceRouter, inferencePosterRouter } = require("./routes/inference");
const { settingsRouter } = require("./routes/settings");
const { startIngestScheduler } = require("./lib/inferenceIngest");
const { runMigrations } = require("./lib/dbMigrations");
const { pool } = require("./db");
const { inferenceMediaRouter } = require("./routes/inferenceMedia");
const { requireAuth } = require("./middleware/requireAuth");
const { requireAuthOrInternal } = require("./middleware/requireAuthOrInternal");
const { requireAuditAdmin } = require("./middleware/requireAuditAdmin");

const app = express();

app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/inference-media", inferenceMediaRouter);
app.use("/api/walking-enroll/media", walkingEnrollMediaRouter);

app.use("/api/auth", authRouter);
app.use("/api/dashboard", requireAuthOrInternal, dashboardRouter);
app.use("/api/streams", requireAuth, streamsRouter);
app.use("/api/watchlist", requireAuth, watchlistRouter);
app.use("/api/chat", requireAuth, chatRouter);
app.use("/api/assistant-enhance", requireAuth, assistantEnhanceRouter);
app.use("/api/walking-enroll", requireAuth, walkingEnrollRouter);
app.use("/api/chat-audit", requireAuth, requireAuditAdmin, chatAuditRouter);
app.use("/api/challan", requireAuth, challanRouter);
// Poster frames carry their own short-lived HMAC in the query string because an
// <img> tag cannot send an Authorization header. Mounted BEFORE the
// authenticated inference router so requireAuth does not reject it.
app.use("/api/inference/poster", inferencePosterRouter);
// Inference viewer (S3 -> Postgres). Authenticated: the media it exposes
// includes face crops and is treated as biometric data.
app.use("/api/inference", requireAuth, inferenceRouter);
// Administrator settings. Detector scopes are persisted here and delivered to
// the on-prem inference host by publishing a versioned config.json to S3.
app.use("/api/settings", requireAuth, settingsRouter);

app.use("/api/challan-public", challanRouter);

const port = Number(process.env.PORT || 4000);
app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on :${port}`);
  runMigrations(pool).then(() => {
    startCameraAlertMonitor(pool);
    startIngestScheduler(pool);
  });
});
