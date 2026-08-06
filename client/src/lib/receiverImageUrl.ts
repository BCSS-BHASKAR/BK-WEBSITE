const S3_BASE = String(
  import.meta.env.VITE_INFERENCE_S3_BASE_URL ||
    "https://philippines-inferences.s3.us-east-1.amazonaws.com"
)
  .trim()
  .replace(/\/$/, "");

const RECEIVER_BASE = String(import.meta.env.VITE_IMAGE_BASE_URL || "/receiver-results")
  .trim()
  .replace(/\/$/, "");

function normalizeKey(raw: string): string {
  return raw.replace(/^\/receiver-results\/?/, "").replace(/^\//, "");
}

function isS3InferenceKey(key: string): boolean {
  return /^(walkins|crowds)\//i.test(key) || /^AEYE_/i.test(key);
}

function s3ObjectUrl(key: string): string {
  return `${S3_BASE}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function receiverImageUrl(path: string | null | undefined): string {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const key = normalizeKey(raw);
  if (isS3InferenceKey(key)) {
    return s3ObjectUrl(key);
  }

  const rel = key.startsWith("/") ? key : `/${key}`;
  if (RECEIVER_BASE.startsWith("http")) {
    return `${RECEIVER_BASE}${rel}`;
  }
  return `${RECEIVER_BASE}${rel}`;
}
