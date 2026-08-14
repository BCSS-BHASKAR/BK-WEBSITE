const fs = require("fs");
const path = require("path");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET =
  process.env.INFERENCE_S3_BUCKET ||
  process.env.WALKIN_S3_BUCKET ||
  "philippines-inferences";
const REGION = process.env.AWS_REGION || "us-east-1";
const LOCAL_ROOT = process.env.RECEIVER_RESULTS_DIR || "/home/aiserver/receiver-results";

let s3Client = null;

function getS3Client() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({ region: REGION });
  }
  return s3Client;
}

function normalizeInferenceKey(raw) {
  let key = String(raw || "").trim();
  if (!key) return "";
  if (key.startsWith("/receiver-results/")) {
    key = key.slice("/receiver-results/".length);
  } else if (key.startsWith("/receiver-results")) {
    key = key.slice("/receiver-results".length);
  }
  return key.replace(/^\/+/, "");
}

function contentTypeForKey(key) {
  const ext = path.extname(key).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function readLocal(key) {
  const localPath = path.join(LOCAL_ROOT, key);
  const resolved = path.resolve(localPath);
  const rootResolved = path.resolve(LOCAL_ROOT);
  if (!resolved.startsWith(`${rootResolved}${path.sep}`) && resolved !== rootResolved) {
    return null;
  }
  try {
    const body = await fs.promises.readFile(resolved);
    return { body, contentType: contentTypeForKey(key) };
  } catch {
    return null;
  }
}

async function readS3(key) {
  const client = getS3Client();
  if (!client) return null;
  const resp = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of resp.Body) {
    chunks.push(Buffer.from(chunk));
  }
  return {
    body: Buffer.concat(chunks),
    contentType: resp.ContentType || contentTypeForKey(key),
  };
}

async function fetchInferenceMedia(rawKey) {
  const key = normalizeInferenceKey(rawKey);
  if (!key) return null;

  const local = await readLocal(key);
  if (local) return local;

  try {
    return await readS3(key);
  } catch (err) {
    console.error("inferenceMediaStore s3 get", key, err.message || err);
    return null;
  }
}

async function uploadToS3(key, buffer, contentType = "application/octet-stream") {
  const client = getS3Client();
  if (!client) throw new Error("S3 not configured (missing AWS credentials)");
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

async function getPresignedPdfUrl(key, expiresInSeconds = 900) {
  const client = getS3Client();
  if (!client) throw new Error("S3 not configured (missing AWS credentials)");
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentType: "application/pdf",
    ResponseContentDisposition: `inline; filename="${path.basename(key)}"`,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

module.exports = {
  normalizeInferenceKey,
  fetchInferenceMedia,
  contentTypeForKey,
  uploadToS3,
  getPresignedPdfUrl,
};
