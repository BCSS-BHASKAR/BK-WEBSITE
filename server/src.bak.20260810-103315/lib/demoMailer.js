const nodemailer = require("nodemailer");
const { appendSentLog } = require("./demoChallans");

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function buildTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const opts = {
    host: String(process.env.SMTP_HOST),
    port,
    secure,
    auth: {
      user: String(process.env.SMTP_USER),
      pass: String(process.env.SMTP_PASS),
    },
  };
  if (!secure && port === 587) opts.requireTLS = true;
  return nodemailer.createTransport(opts);
}

async function sendChallanEmail({
  to,
  subject,
  html,
  text,
  attachments = [],
  meta = {},
}) {
  const from = String(process.env.SMTP_FROM || "PNP Operations <no-reply@pnp.local>");

  if (!smtpConfigured()) {
    appendSentLog(
      JSON.stringify({
        ts: new Date().toISOString(),
        mode: "demo",
        to,
        subject,
        meta,
      })
    );
    return { ok: true, mode: "demo", messageId: `demo-${Date.now()}` };
  }

  try {
    const transport = buildTransport();
    const info = await transport.sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments,
    });
    return { ok: true, mode: "smtp", messageId: info.messageId || null };
  } catch (e) {
    console.error("SMTP send failed", e);
    return { ok: false, mode: "smtp", error: String(e?.message || e) };
  }
}

module.exports = { sendChallanEmail, smtpConfigured };

