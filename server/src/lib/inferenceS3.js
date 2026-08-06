"use strict";

// S3 access for the inference viewer (bucket: bk-inference-storage, ap-south-1).
//
// Deliberately separate from lib/inferenceMediaStore.js, which targets the
// older philippines-inferences bucket in us-east-1.
//
// Credentials come from the AWS SDK's DEFAULT PROVIDER CHAIN, so the same code
// works with env vars now and with an EC2 instance role later - no code change
// and no long-lived keys required. (The older store hard-gated on
// AWS_ACCESS_KEY_ID being present, which meant an instance role could never
// be used.)
//
// The bucket has "Block all public access" ON and must stay that way: this is
// surveillance footage of identifiable people. Nothing here ever returns a raw
// S3 URL - only short-TTL presigned links.

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET = process.env.INFERENCE_VIEWER_BUCKET || "bk-inference-storage";
const REGION = process.env.INFERENCE_VIEWER_REGION || "ap-south-1";
const PREFIX = process.env.INFERENCE_VIEWER_PREFIX || "uploads/";

// Presigned URLs are short-lived by policy. Cap it so a misconfigured env var
// cannot mint long-lived links to biometric material.
const DEFAULT_TTL = Number(process.env.INFERENCE_VIEWER_URL_TTL || 900); // 15 min
const MAX_TTL = 900;

let client = null;
function s3() {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

/**
 * Async-iterate every object under a prefix, following continuation tokens.
 * `startAfter` lets an incremental pass skip keys already ingested (S3 returns
 * keys in lexicographic order, and our keys embed the date).
 */
async function* listObjects({ prefix = PREFIX, startAfter = null, pageSize = 1000 } = {}) {
  let token = undefined;
  do {
    const res = await s3().send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        MaxKeys: pageSize,
        ContinuationToken: token,
        StartAfter: token ? undefined : startAfter || undefined,
      })
    );
    for (const o of res.Contents || []) yield o;
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

/** Read a whole object as UTF-8. Only used for the small JSONL sidecars. */
async function getObjectText(key) {
  const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Fetch only the first `bytes` of an object.
 *
 * Used for video poster extraction: a loitering clip is 30-40 MB, but the
 * opening few MB of a WebM contain enough to decode frame 0. Pulling the whole
 * clip cross-region just to make a thumbnail would move gigabytes for nothing.
 */
async function getObjectHead(key, bytes = 3 * 1024 * 1024) {
  const res = await s3().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: `bytes=0-${bytes - 1}` })
  );
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Mint a short-TTL presigned GET URL. The browser fetches straight from S3,
 * which keeps 30-40 MB loitering clips off the EC2 box entirely and gives
 * native HTTP range requests for video seeking.
 */
async function presignGet(key, { ttlSeconds = DEFAULT_TTL, downloadName = null } = {}) {
  const expiresIn = Math.min(Math.max(Number(ttlSeconds) || DEFAULT_TTL, 30), MAX_TTL);
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ...(downloadName
      ? { ResponseContentDisposition: `inline; filename="${downloadName.replace(/"/g, "")}"` }
      : {}),
  });
  return getSignedUrl(s3(), cmd, { expiresIn });
}

/** Cheap connectivity/permission probe used by the health endpoint. */
async function probe() {
  const res = await s3().send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, MaxKeys: 1 })
  );
  return { bucket: BUCKET, region: REGION, prefix: PREFIX, reachable: true, keyCount: res.KeyCount || 0 };
}

module.exports = { BUCKET, REGION, PREFIX, listObjects, getObjectText, getObjectHead, presignGet, probe };
