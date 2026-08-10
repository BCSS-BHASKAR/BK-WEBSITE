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
   * The chef_absence recorder writes MPEG-4 Part 2 (Simple Profile) inside an
   * MP4 container. No browser can decode that - Chrome reports
   * canPlayType('video/mp4; codecs="mp4v.20.8"') as unsupported and fails with
   * MEDIA_ERR_SRC_NOT_SUPPORTED - so the <video> rendered as a silent black
   * rectangle with no indication of why. The evidence itself is fine, so rather
   * than a dead player the viewer says what happened and offers the file, which
   * plays in VLC or QuickTime.
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
              It is recorded as MPEG-4 Part 2, a codec no browser supports. The recording
              itself is intact — download it to view in VLC or QuickTime.
            </Typography>
            {row.mediaUrl ? (
              <Button
                variant="contained"
                startIcon={<DownloadRoundedIcon />}
                href={row.mediaUrl}
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
