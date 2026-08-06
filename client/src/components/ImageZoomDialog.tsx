import { useEffect, useState } from "react";
import { Box, Chip, Dialog, IconButton, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import FlipIcon from "@mui/icons-material/Flip";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import ThumbUpOffAltIcon from "@mui/icons-material/ThumbUpOffAlt";
import ThumbDownAltIcon from "@mui/icons-material/ThumbDownAlt";
import ThumbDownOffAltIcon from "@mui/icons-material/ThumbDownOffAlt";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { violationTypeLabel, violationTypeMeta } from "../lib/violationTypes";

export type ImageZoomPayload = {
  src: string;
  sceneSrc?: string;
  plateSrc?: string;
  sceneLabel?: string;
  plateLabel?: string;
  violationId?: number;
  violationType?: string;
  feedback?: number | null;
};

type ImageZoomDialogProps = {
  open: boolean;
  payload: ImageZoomPayload | null;
  onClose: () => void;
  title?: string;
  onFeedback?: (violationId: number, feedback: 0 | 1) => void;
  feedbackPending?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  onPrevious?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
};

export function ImageZoomDialog({
  open,
  payload,
  onClose,
  title = "Capture",
  onFeedback,
  feedbackPending = false,
  onNext,
  onPrev,
  onPrevious,
  hasPrevious = false,
  hasNext = false,
}: ImageZoomDialogProps) {
  const goPrevious = onPrevious ?? onPrev;
  const goNext = onNext;
  const canPrevious = onPrevious ? hasPrevious : Boolean(goPrevious);
  const canNext = onPrevious ? hasNext : Boolean(goNext);
  const [view, setView] = useState<"scene" | "plate">("scene");
  const [feedback, setFeedback] = useState<number | null>(null);

  const sceneSrc = payload?.sceneSrc;
  const plateSrc = payload?.plateSrc;
  const hasScene = Boolean(sceneSrc);
  const hasPlate = Boolean(plateSrc);
  const showToggle = hasScene && hasPlate;

  const violationId = payload?.violationId;
  const violationType = payload?.violationType;
  const showFeedback = Boolean(onFeedback && violationId);
  const typeMeta = violationType ? violationTypeMeta(violationType) : null;

  useEffect(() => {
    if (!open || !payload) return;
    if (plateSrc && payload.src === plateSrc) setView("plate");
    else setView("scene");
    setFeedback(payload.feedback ?? null);
  }, [open, payload, plateSrc]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && goNext && canNext) {
        goNext();
      } else if (e.key === "ArrowLeft" && goPrevious && canPrevious) {
        goPrevious();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, goNext, goPrevious, canNext, canPrevious]);

  const activeSrc =
    showToggle && view === "plate" && plateSrc
      ? plateSrc
      : showToggle && view === "scene" && sceneSrc
        ? sceneSrc
        : payload?.src;

  const sceneLabel = payload?.sceneLabel || "Scene";
  const plateLabel = payload?.plateLabel || "Plate crop";

  const modalIconShell = {
    zIndex: 2,
    bgcolor: "rgba(15,23,42,0.72)",
    color: "#fff",
    "&:hover": { bgcolor: "rgba(15,23,42,0.88)" },
  };

  const handleFeedback = (value: 0 | 1) => {
    if (!onFeedback || !violationId || feedbackPending) return;
    setFeedback(value);
    onFeedback(violationId, value);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth slotProps={{ paper: { sx: { borderRadius: 2 } } }}>
      <Box sx={{ position: "relative", p: { xs: 2, sm: 2.5 }, pt: { xs: 5.5, sm: 3 } }}>
        {showToggle ? (
          <IconButton
            onClick={() => setView((v) => (v === "scene" ? "plate" : "scene"))}
            aria-label={view === "plate" ? `Show ${sceneLabel.toLowerCase()}` : `Show ${plateLabel.toLowerCase()}`}
            title={view === "plate" ? `Show ${sceneLabel.toLowerCase()}` : `Show ${plateLabel.toLowerCase()}`}
            size="small"
            sx={{ position: "absolute", top: 8, right: 48, ...modalIconShell }}
          >
            <FlipIcon fontSize="small" />
          </IconButton>
        ) : null}

        <IconButton
          onClick={onClose}
          aria-label="Close"
          size="small"
          sx={{ position: "absolute", top: 8, right: 8, ...modalIconShell }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", pr: showToggle ? 12 : 5, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
            {title}
          </Typography>
          {showToggle ? (
            <Chip
              size="small"
              label={view === "plate" ? plateLabel : sceneLabel}
              sx={{ fontWeight: 800, bgcolor: "rgba(29,78,216,0.1)", color: "primary.dark" }}
            />
          ) : null}
          {violationType ? (
            <Chip
              size="small"
              label={violationTypeLabel(violationType)}
              sx={{
                fontWeight: 800,
                bgcolor: typeMeta ? `${typeMeta.color}18` : "rgba(15,23,42,0.06)",
                color: typeMeta?.color ?? "text.primary",
                border: typeMeta ? `1px solid ${typeMeta.color}55` : "1px solid rgba(15,23,42,0.12)",
              }}
            />
          ) : null}
        </Box>

        {activeSrc ? (
          <Box
            sx={{
              position: "relative",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              bgcolor: "#0b1220",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <img
              src={activeSrc}
              alt={view === "plate" ? "Plate crop" : "Scene capture"}
              style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", display: "block" }}
            />

            {goPrevious ? (
              <IconButton
                onClick={goPrevious}
                disabled={onPrevious ? !hasPrevious : false}
                size="large"
                aria-label="Previous"
                sx={{
                  position: "absolute",
                  left: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  bgcolor: "rgba(15,23,42,0.72)",
                  color: "#fff",
                  "&:hover": { bgcolor: "rgba(15,23,42,0.88)" },
                }}
              >
                <ChevronLeftIcon fontSize="large" />
              </IconButton>
            ) : null}

            {goNext ? (
              <IconButton
                onClick={goNext}
                disabled={onPrevious ? !hasNext : false}
                size="large"
                aria-label="Next"
                sx={{
                  position: "absolute",
                  right: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  bgcolor: "rgba(15,23,42,0.72)",
                  color: "#fff",
                  "&:hover": { bgcolor: "rgba(15,23,42,0.88)" },
                }}
              >
                <ChevronRightIcon fontSize="large" />
              </IconButton>
            ) : null}

            {showFeedback ? (
              <Box
                sx={{
                  position: "absolute",
                  bottom: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 999,
                  bgcolor: "rgba(15,23,42,0.72)",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 8px 24px rgba(2,6,23,0.4)",
                }}
              >
                <Typography sx={{ color: "#e2e8f0", fontWeight: 800, fontSize: "0.72rem", pl: 0.5 }}>
                  Correct detection?
                </Typography>
                <Tooltip title="Confirm — true violation (keeps it)">
                  <span>
                    <IconButton
                      size="small"
                      disabled={feedbackPending}
                      onClick={() => handleFeedback(1)}
                      aria-label="Thumbs up — confirm violation"
                      sx={{
                        color: feedback === 1 ? "#22c55e" : "#cbd5e1",
                        bgcolor: feedback === 1 ? "rgba(34,197,94,0.16)" : "transparent",
                        "&:hover": { bgcolor: "rgba(34,197,94,0.22)", color: "#22c55e" },
                      }}
                    >
                      {feedback === 1 ? <ThumbUpAltIcon fontSize="small" /> : <ThumbUpOffAltIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="False positive — hides it and sends for model retraining">
                  <span>
                    <IconButton
                      size="small"
                      disabled={feedbackPending}
                      onClick={() => handleFeedback(0)}
                      aria-label="Thumbs down — false positive"
                      sx={{
                        color: feedback === 0 ? "#ef4444" : "#cbd5e1",
                        bgcolor: feedback === 0 ? "rgba(239,68,68,0.16)" : "transparent",
                        "&:hover": { bgcolor: "rgba(239,68,68,0.22)", color: "#ef4444" },
                      }}
                    >
                      {feedback === 0 ? <ThumbDownAltIcon fontSize="small" /> : <ThumbDownOffAltIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Dialog>
  );
}
