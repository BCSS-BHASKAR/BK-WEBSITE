"use strict";

// Human-in-the-loop feedback export for model retraining.
//
// When a violation is marked as a false positive (thumbs down), we copy its
// capture images + metadata into a separate retraining dataset folder so the
// detection model can be re-trained on confirmed false positives later.
//
// Nothing here touches the live inference path — it is a side-channel export.

const fs = require("fs");
const path = require("path");

const RECEIVER_ROOT = process.env.RECEIVER_RESULTS_DIR || "/home/aiserver/receiver-results";

// Default to a dedicated folder under server/ (colocated with the writer). Override with RETRAIN_FP_DIR.
const RETRAIN_FP_DIR =
  process.env.RETRAIN_FP_DIR || path.resolve(__dirname, "../../ml_retraining/false_positives");

function safeResolveReceiver(rel) {
  const raw = String(rel || "").trim();
  if (!raw) return null;
  let p = raw;
  if (p.startsWith("/receiver-results/")) p = p.slice("/receiver-results".length);
  if (!p.startsWith("/")) p = `/${p}`;
  const root = path.resolve(RECEIVER_ROOT);
  const full = path.resolve(root + p);
  if (!full.startsWith(root)) return null; // path traversal guard
  return fs.existsSync(full) ? full : null;
}

function copyIfPresent(receiverRel, destPath) {
  try {
    const src = safeResolveReceiver(receiverRel);
    if (!src) return false;
    fs.copyFileSync(src, destPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Export a false-positive violation to the retraining dataset folder.
 * Writes <RETRAIN_FP_DIR>/<violationId>/{scene.jpg,plate.jpg,metadata.json}.
 * Best-effort: never throws (feedback must still succeed if export fails).
 */
function exportFalsePositive(violation) {
  try {
    const id = Number(violation.id);
    if (!Number.isFinite(id) || id <= 0) return { ok: false, reason: "bad_id" };

    const dir = path.join(RETRAIN_FP_DIR, String(id));
    fs.mkdirSync(dir, { recursive: true });

    const sceneCopied = copyIfPresent(violation.full_image_url, path.join(dir, "scene.jpg"));
    const plateCopied = copyIfPresent(violation.plate_url, path.join(dir, "plate.jpg"));

    const metadata = {
      violation_id: id,
      event_id: violation.event_id || null,
      violation_type: violation.violation_type || null,
      score: violation.score != null ? Number(violation.score) : null,
      plate: violation.plate || null,
      camera_id: violation.camera_id || null,
      detected_at: violation.detected_at || null,
      label: "false_positive",
      feedback: 0,
      feedback_by: violation.feedback_by || null,
      exported_at: new Date().toISOString(),
      images: {
        scene: sceneCopied ? "scene.jpg" : null,
        plate: plateCopied ? "plate.jpg" : null,
        scene_url: violation.full_image_url || null,
        plate_url: violation.plate_url || null,
      },
    };
    fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(metadata, null, 2));
    return { ok: true, dir, sceneCopied, plateCopied };
  } catch (e) {
    console.error("exportFalsePositive failed", e);
    return { ok: false, reason: "exception" };
  }
}

/**
 * A previously false-positive violation was corrected to a confirmed true positive
 * (thumbs-down -> thumbs-up). We do NOT delete the retraining sample — the labeled
 * data is kept. We only flag it as corrected so the training pipeline can relabel or
 * exclude it. Fully non-destructive: images stay on disk.
 */
function markCorrected(violationId, feedbackBy) {
  try {
    const id = Number(violationId);
    if (!Number.isFinite(id) || id <= 0) return;
    const metaPath = path.join(RETRAIN_FP_DIR, String(id), "metadata.json");
    if (!fs.existsSync(metaPath)) return; // nothing was exported; nothing to flag
    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {
      meta = {};
    }
    meta.label = "corrected_true_positive"; // was "false_positive"
    meta.corrected = true;
    meta.corrected_at = new Date().toISOString();
    meta.corrected_by = feedbackBy || null;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  } catch (e) {
    console.error("markCorrected failed", e);
  }
}

module.exports = { exportFalsePositive, markCorrected, RETRAIN_FP_DIR };
