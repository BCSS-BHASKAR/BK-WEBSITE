"use strict";

// Publishes detector settings to S3 so the on-prem inference services can pick
// them up.
//
// WHY THIS EXISTS
// The four (soon five) detectors run on the OMEN Windows host. This web app is
// a read-only consumer of what they upload: it can List/Get/presign objects in
// bk-inference-storage and nothing more. There is no inbound path from here to
// that machine - no API, no queue, no agent.
//
// So "change the loitering threshold" cannot be a direct call. Instead the
// bucket both sides already share becomes the channel: this writes a small,
// versioned config.json, and the on-prem side polls it. That reuses the
// existing credentials and network path, and adds no new inbound surface on
// the Windows box.
//
// UNTIL THE ON-PREM READER EXISTS, A SAVED DETECTOR VALUE IS RECORDED AND
// PUBLISHED BUT NOT YET IN FORCE. The API says so via `pendingDelivery`, and
// the Settings UI surfaces it, so nobody is misled into thinking a slider
// changed detector behaviour when it has not.
//
// The contract is documented in server/INFERENCE_CONFIG_CONTRACT.md.

const { PutObjectCommand, GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const BUCKET = process.env.INFERENCE_VIEWER_BUCKET || "bk-inference-storage";
const REGION = process.env.INFERENCE_VIEWER_REGION || "ap-south-1";
const CONFIG_KEY = process.env.INFERENCE_CONFIG_KEY || "config/inference-config.json";

let client = null;
function s3() {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

const MODULE_SCOPES = ["walkins", "loitering", "intrusion", "after_hours", "kitchen_unattended"];

/**
 * Build the config document from the settings table.
 *
 * Shape is deliberately flat and boring - the consumer is a Python service, and
 * a schemaVersion lets it refuse a document it does not understand rather than
 * silently misreading one.
 */
async function buildConfig(pool) {
  const [rows] = await pool.query(
    `SELECT scope, value, version, updated_at FROM app_setting WHERE scope = ANY(?::text[])`,
    [`{${MODULE_SCOPES.join(",")}}`]
  );
  const modules = {};
  let maxVersion = 0;
  for (const r of rows) {
    modules[r.scope] = r.value;
    maxVersion = Math.max(maxVersion, Number(r.version) || 0);
  }
  return {
    schemaVersion: 1,
    version: maxVersion,
    publishedAt: new Date().toISOString(),
    site: process.env.INFERENCE_SITE_ID || "biryani-katha",
    modules,
  };
}

/** Write the config document to S3. Never throws - returns a result object. */
async function publishConfig(pool, actor = null) {
  let doc;
  try {
    doc = await buildConfig(pool);
  } catch (e) {
    return { attempted: true, ok: false, error: `build failed: ${e.message}` };
  }
  const body = JSON.stringify(doc, null, 2);
  try {
    await s3().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: CONFIG_KEY,
        Body: body,
        ContentType: "application/json",
        CacheControl: "no-cache",
        Metadata: { "published-by": String(actor || "system"), version: String(doc.version) },
      })
    );
    await pool
      .query(
        `UPDATE app_setting_audit SET published = true
          WHERE id = (SELECT id FROM app_setting_audit ORDER BY changed_at DESC LIMIT 1)`
      )
      .catch(() => {});
    return { attempted: true, ok: true, key: CONFIG_KEY, bucket: BUCKET, version: doc.version };
  } catch (e) {
    // A publish failure must not lose the saved setting - it is already in the
    // database. Record why delivery failed and let the caller retry.
    await pool
      .query(
        `UPDATE app_setting_audit SET published = false, publish_error = ?
          WHERE id = (SELECT id FROM app_setting_audit ORDER BY changed_at DESC LIMIT 1)`,
        [String(e.message).slice(0, 500)]
      )
      .catch(() => {});
    return { attempted: true, ok: false, error: e.message, key: CONFIG_KEY };
  }
}

/** Read back whatever is currently published, so the UI can show delivery state. */
async function readPublishedConfig() {
  const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: CONFIG_KEY }));
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

module.exports = { publishConfig, readPublishedConfig, buildConfig, CONFIG_KEY, BUCKET, REGION };
