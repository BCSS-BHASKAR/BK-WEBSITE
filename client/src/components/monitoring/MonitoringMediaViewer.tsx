import { useEffect, useState } from "react";
import { Box, Button, Chip, Dialog, DialogContent, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined";
import ThumbDownAltOutlinedIcon from "@mui/icons-material/ThumbDownAltOutlined";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import ThumbDownAltIcon from "@mui/icons-material/ThumbDownAlt";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import VideocamOffRoundedIcon from "@mui/icons-material/VideocamOffRounded";
import type { InferenceModule } from "../../lib/inferenceModules";
import type { FeedbackVerdict, MonitoringRow } from "./MonitoringEventsTable";

// Why this exists alongside ImageZoomDialog
// ----------------------------------------
// ImageZoomDialog is the app's existing lightbox and already has Previous/Next
// plus arrow-key navigation - that part needed no work. What it cannot do is
// play video: it renders a bare <img> and its payload type has no video field.
// Loitering evidence is 30-40 MB WebM, so those events could not be reviewed in
// it at all.
//
// Rather than change the signature of a component four other pages depend on,
// Monitoring uses this viewer, which handles both media kinds and adds the
// reinforcement-feedback controls. The image path behaves identically, so the
// experience is consistent.

type Props = {
  open: boolean;
  module: InferenceModule;
  rows: MonitoringRow[];
  index: number;
  /** True when a further page of results exists beyond this one. */
  hasMorePages?: boolean;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  verdictFor: (row: MonitoringRow) => FeedbackVerdict;
  onFeedback: (row: MonitoringRow, verdict: "verified" | "false_positive") => void;
  feedbackPending?: boolean;
};

const SITE_TZ = "Asia/Kolkata";

function whenOf(r?: MonitoringRow) {
  if (!r) return "";
  const ts = r.detected_at || r.started_at || r.occurred_at || r.captured_at;
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-GB", {
    timeZone: SITE_TZ, day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

export function MonitoringMediaViewer({
  open, module, rows, index, hasMorePages, onIndexChange, onClose,
  verdictFor, onFeedback, feedbackPending,
}: Props) {
  const row = rows[index];
  const hasPrev = index > 0;
  const hasNext = index < rows.length - 1;

  /**
   * Set when the browser refuses the clip.
   *
   * MP4 evidence is transcoded server-side before it reaches here, because the
   * recorder writes MPEG-4 Part 2, which no browser decodes. This is the safety
   * net for when that fails anyway - a transcode slot timing out, ffmpeg
   * refusing a corrupt source - and it matters because the failure mode without
   * it is a silent black rectangle with no indication of why. The original is
   * always offered, and plays in VLC or QuickTime.
   *
   * Holding the failing row's id rather than a boolean is what lets the message
   * clear itself when the viewer steps to another detection - deriving it makes
   * the reset a render-time comparison instead of a setState inside an effect.
   */
  const [erroredId, setErroredId] = useState<MonitoringRow["id"] | null>(null);

  // Keyboard navigation, matching ImageZoomDialog's existing behaviour.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, hasPrev, hasNext, onIndexChange, onClose]);

  // Preload the adjacent still so stepping through a filtered set feels instant.
  // Videos are deliberately not preloaded - they are 30-40 MB each.
  useEffect(() => {
    if (!open) return;
    for (const nb of [rows[index + 1], rows[index - 1]]) {
      if (!nb) continue;
      const src = nb.posterUrl || (!nb.isVideo ? nb.mediaUrl : undefined);
      if (src) { const img = new Image(); img.src = src; }
    }
  }, [open, index, rows]);

  if (!row) return null;
  const verdict = verdictFor(row);
  const playbackError = erroredId != null && erroredId === row.id;
  // Prefer the untouched original: if playback failed, the transcode is the
  // thing that is suspect, and this is evidence.
  const downloadUrl = row.sourceUrl || row.mediaUrl;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogContent sx={{ p: 0, bgcolor: "#000", position: "relative" }}>
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", top: 8, right: 8, zIndex: 3, color: "#fff", bgcolor: "rgba(0,0,0,.5)" }}
        >
          <CloseIcon />
        </IconButton>

        {/* Previous / Next across the current filtered, sorted result set. */}
        <IconButton
          disabled={!hasPrev} onClick={() => onIndexChange(index - 1)} aria-label="Previous detection"
          sx={{
            position: "absolute", left: 8, top: "45%", zIndex: 3, color: "#fff",
            bgcolor: "rgba(0,0,0,.45)", "&.Mui-disabled": { color: "rgba(255,255,255,.25)" },
          }}
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          disabled={!hasNext} onClick={() => onIndexChange(index + 1)} aria-label="Next detection"
          sx={{
            position: "absolute", right: 8, top: "45%", zIndex: 3, color: "#fff",
            bgcolor: "rgba(0,0,0,.45)", "&.Mui-disabled": { color: "rgba(255,255,255,.25)" },
          }}
        >
          <ChevronRightIcon />
        </IconButton>

        {row.isVideo && playbackError ? (
          <Stack
            spacing={1.5}
            sx={{
              width: "100%",
              minHeight: 280,
              alignItems: "center",
              justifyContent: "center",
              px: 3,
              py: 6,
              textAlign: "center",
              // The poster still decodes even when the video does not, so it is
              // used as a backdrop rather than leaving a black void.
              ...(row.posterUrl
                ? {
                    backgroundImage: `linear-gradient(rgba(0,0,0,.72), rgba(0,0,0,.82)), url(${row.posterUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : {}),
            }}
          >
            <VideocamOffRoundedIcon sx={{ fontSize: 40, color: "rgba(255,255,255,.6)" }} />
            <Typography sx={{ color: "#fff", fontWeight: 700 }}>
              This clip cannot be played in the browser
            </Typography>
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,.72)", maxWidth: 460 }}>
              The recording itself is intact — the browser could not decode it. Download
              it to view in VLC or QuickTime.
            </Typography>
            {downloadUrl ? (
              <Button
                variant="contained"
                startIcon={<DownloadRoundedIcon />}
                href={downloadUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                sx={{ mt: 0.5 }}
              >
                Download clip
              </Button>
            ) : null}
          </Stack>
        ) : row.isVideo ? (
          // Presigned S3 URLs honour HTTP range requests, so seeking works.
          <Box
            key={row.id}
            component="video"
            src={row.mediaUrl}
            poster={row.posterUrl}
            controls
            autoPlay
            preload="metadata"
            onError={() => setErroredId(row.id)}
            sx={{ width: "100%", maxHeight: "72vh", display: "block" }}
          />
        ) : (
          <Box
            component="img"
            src={row.mediaUrl}
            alt={`${module.eventNoun} ${row.id}`}
            sx={{ width: "100%", maxHeight: "72vh", objectFit: "contain", display: "block" }}
          />
        )}

        <Stack
          direction="row"
          sx={{ p: 1.5, gap: 1.5, alignItems: "center", flexWrap: "wrap", bgcolor: "rgba(0,0,0,.85)" }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: "#fff", fontWeight: 700 }} noWrap>
              {module.eventNoun} · {(row.camera_key || "").trim() || "unknown camera"}
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,.7)" }}>
              {whenOf(row)} · {index + 1} of {rows.length}
              {hasMorePages ? " on this page" : ""}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* Reinforcement feedback. A thumbs-down never deletes anything: it
              records a verdict that hides the detection from KPIs, analytics and
              tables while the row and its S3 media are retained for retraining. */}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {verdict && (
              <Chip
                size="small"
                color={verdict === "verified" ? "success" : "error"}
                label={verdict === "verified" ? "Verified" : "Marked false positive"}
                sx={{ height: 24 }}
              />
            )}
            <Button
              size="small" variant={verdict === "verified" ? "contained" : "outlined"} color="success"
              disabled={feedbackPending}
              startIcon={verdict === "verified" ? <ThumbUpAltIcon /> : <ThumbUpAltOutlinedIcon />}
              onClick={() => onFeedback(row, "verified")}
            >
              Correct
            </Button>
            <Button
              size="small" variant={verdict === "false_positive" ? "contained" : "outlined"} color="error"
              disabled={feedbackPending}
              startIcon={verdict === "false_positive" ? <ThumbDownAltIcon /> : <ThumbDownAltOutlinedIcon />}
              onClick={() => onFeedback(row, "false_positive")}
            >
              False positive
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
