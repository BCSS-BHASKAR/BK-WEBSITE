import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Slider,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FaceRetouchingNaturalOutlinedIcon from "@mui/icons-material/FaceRetouchingNaturalOutlined";
import ManageSearchOutlinedIcon from "@mui/icons-material/ManageSearchOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { pnp } from "../../lib/pnpTheme";
import { SITE_TIMEZONE } from "../../lib/siteTimeZone";
import {
  KnownFacesCountBadge,
  KnownFacesEmptyState,
  KnownFacesPhotoUpload,
  KnownFacesSectionHeader,
  knownFacesDateToggleSx,
  knownFacesPanelSx,
} from "./knownFacesUi";
import {
  emptySearchMessage,
  faceSearchScore,
  filterSearchHitsByDate,
  formatEnrollDate,
  formatQuality,
  mapWalkingError,
  searchByFace,
  walkingImageUrl,
  type FaceSearchHit,
  type FaceSearchResponse,
} from "../../lib/walkingEnrollApi";

dayjs.extend(utc);
dayjs.extend(timezone);

type DatePreset = "all" | "today" | "week" | "month" | "custom";

function resolveDateRange(
  preset: DatePreset,
  customFrom: Dayjs | null,
  customTo: Dayjs | null
): { from: Date | null; to: Date | null } {
  const now = dayjs().tz(SITE_TIMEZONE);
  if (preset === "today") {
    return { from: now.startOf("day").toDate(), to: now.endOf("day").toDate() };
  }
  if (preset === "week") {
    return {
      from: now.subtract(6, "day").startOf("day").toDate(),
      to: now.endOf("day").toDate(),
    };
  }
  if (preset === "month") {
    return {
      from: now.subtract(29, "day").startOf("day").toDate(),
      to: now.endOf("day").toDate(),
    };
  }
  if (preset === "custom") {
    return {
      from: customFrom ? customFrom.startOf("day").toDate() : null,
      to: customTo ? customTo.endOf("day").toDate() : null,
    };
  }
  return { from: null, to: null };
}

function SearchResultCard({ hit, onExpand }: { hit: FaceSearchHit; onExpand: () => void }) {
  const det = hit.detection;
  const personUrl = walkingImageUrl(det.crop_path || det.frame_path || "");
  const faceUrl = det.face_crop_path ? walkingImageUrl(det.face_crop_path) : "";
  const score = faceSearchScore(hit);

  return (
    <Paper
      sx={{
        ...knownFacesPanelSx,
        p: 1.25,
        cursor: det.frame_path ? "pointer" : "default",
        transition: "box-shadow 0.15s ease",
        "&:hover": det.frame_path ? { boxShadow: "0 4px 14px rgba(15,23,42,0.12)" } : undefined,
      }}
      onClick={det.frame_path ? onExpand : undefined}
    >
      <Box sx={{ position: "relative", borderRadius: "8px", overflow: "hidden", mb: 1.25 }}>
        <Box
          sx={{
            aspectRatio: "3 / 4",
            bgcolor: "rgba(15,23,42,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {personUrl ? (
            <Box
              component="img"
              src={personUrl}
              alt="Person capture"
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <FaceRetouchingNaturalOutlinedIcon sx={{ fontSize: 40, color: "text.disabled" }} />
          )}
        </Box>
        {faceUrl && (
          <Box
            component="img"
            src={faceUrl}
            alt="Face"
            sx={{
              position: "absolute",
              right: 8,
              bottom: 8,
              width: 52,
              height: 52,
              borderRadius: "6px",
              objectFit: "cover",
              border: "2px solid #fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          />
        )}
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 0.75 }}>
        <Chip size="small" color="primary" label={`${formatQuality(score)} match`} />
        {det.identity_name ? <Chip size="small" variant="outlined" label={det.identity_name} /> : null}
      </Box>

      <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.3 }}>
        {det.camera_id || "Camera"}
      </Typography>
      {det.timestamp && (
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.35 }}>
          {formatEnrollDate(det.timestamp)}
        </Typography>
      )}
    </Paper>
  );
}

export function FaceSearchTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<FaceSearchResponse | null>(null);
  const [expandIndex, setExpandIndex] = useState<number | null>(null);

  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Dayjs | null>(null);
  const [customTo, setCustomTo] = useState<Dayjs | null>(null);
  const [threshold, setThreshold] = useState(0.35);
  const [topK, setTopK] = useState(50);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const searchMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Please upload a reference photo.");
      return searchByFace(file, { top_k: topK, threshold });
    },
    onSuccess: (data) => {
      setSearchError(null);
      setLastResponse(data);
    },
    onError: (err) => {
      setLastResponse(null);
      setSearchError(mapWalkingError(err));
    },
  });

  const handleFileSelect = useCallback((selected: File | null) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setSearchError("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    setSearchError(null);
    setLastResponse(null);
    setFile(selected);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped) handleFileSelect(dropped);
    },
    [handleFileSelect]
  );

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo]
  );

  const filteredResults = useMemo(() => {
    if (!lastResponse?.results?.length) return [];
    return filterSearchHitsByDate(lastResponse.results, dateRange);
  }, [lastResponse, dateRange]);

  const expandHit = expandIndex != null ? filteredResults[expandIndex] ?? null : null;
  const hasPrevious = expandIndex != null && expandIndex > 0;
  const hasNext = expandIndex != null && expandIndex < filteredResults.length - 1;

  const goPrevious = useCallback(() => {
    setExpandIndex((idx) => (idx != null && idx > 0 ? idx - 1 : idx));
  }, []);

  const goNext = useCallback(() => {
    setExpandIndex((idx) =>
      idx != null && idx < filteredResults.length - 1 ? idx + 1 : idx
    );
  }, [filteredResults.length]);

  useEffect(() => {
    if (expandIndex == null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrevious) goPrevious();
      else if (event.key === "ArrowRight" && hasNext) goNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandIndex, hasPrevious, hasNext, goPrevious, goNext]);

  const onSearch = () => {
    if (!file) {
      setSearchError("Please upload a reference photo.");
      return;
    }
    setSearchError(null);
    searchMutation.mutate();
  };

  const hasSearched = searchMutation.isSuccess || (searchMutation.isError && !searchMutation.isPending);
  const apiResultCount = lastResponse?.results?.length ?? 0;
  const showEmptyResults = hasSearched && !searchMutation.isPending && filteredResults.length === 0;
  const emptyMessage =
    showEmptyResults && apiResultCount > 0
      ? "No matches in the selected date range. Try a wider range."
      : emptySearchMessage(lastResponse);

  return (
    <>
      <Grid container spacing={2.5} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={knownFacesPanelSx}>
            <KnownFacesSectionHeader
              icon={<SearchOutlinedIcon />}
              title="Search by face"
              subtitle="Upload a reference photo to find matching Right Entrance walk-in captures."
            />

            <Box sx={{ mt: 2.5 }}>
              <KnownFacesPhotoUpload
                previewUrl={previewUrl}
                dragOver={dragOver}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                fileInputRef={fileInputRef}
                cameraInputRef={cameraInputRef}
                onFileSelect={handleFileSelect}
              />

              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, mb: 1 }}>Date range</Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={datePreset}
                onChange={(_, v) => v && setDatePreset(v as DatePreset)}
                sx={knownFacesDateToggleSx}
              >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="today">Today</ToggleButton>
                <ToggleButton value="week">Week</ToggleButton>
                <ToggleButton value="month">Month</ToggleButton>
                <ToggleButton value="custom">Custom</ToggleButton>
              </ToggleButtonGroup>

              {datePreset === "custom" && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
                  <DatePicker
                    label="From"
                    value={customFrom}
                    onChange={(v) => setCustomFrom(v)}
                    slotProps={{ textField: { size: "small", fullWidth: true } }}
                  />
                  <DatePicker
                    label="To"
                    value={customTo}
                    onChange={(v) => setCustomTo(v)}
                    slotProps={{ textField: { size: "small", fullWidth: true } }}
                  />
                </Box>
              )}

              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, mb: 0.5 }}>
                Match threshold ({formatQuality(threshold)})
              </Typography>
              <Slider
                value={threshold}
                min={0.25}
                max={0.7}
                step={0.01}
                onChange={(_, v) => setThreshold(v as number)}
                sx={{ mb: 2, color: pnp.primary }}
              />

              <TextField
                fullWidth
                size="small"
                type="number"
                label="Max results"
                value={topK}
                slotProps={{ htmlInput: { min: 1, max: 200 } }}
                onChange={(e) => setTopK(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
                sx={{ mb: 2 }}
              />

              {searchError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {searchError}
                </Alert>
              )}

              <Button
                variant="contained"
                size="large"
                fullWidth
                disabled={!file || searchMutation.isPending}
                startIcon={
                  searchMutation.isPending ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <SearchOutlinedIcon />
                  )
                }
                onClick={onSearch}
                sx={{ py: 1.35, fontWeight: 700, textTransform: "none" }}
              >
                {searchMutation.isPending ? "Searching…" : "Search"}
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={knownFacesPanelSx}>
            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, mb: 0.5 }}>
              <KnownFacesSectionHeader icon={<ManageSearchOutlinedIcon />} title="Results" />
              {filteredResults.length > 0 && (
                <KnownFacesCountBadge
                  label={`${filteredResults.length} match${filteredResults.length === 1 ? "" : "es"}`}
                />
              )}
            </Box>

            <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {searchMutation.isPending && (
                <Box sx={{ display: "flex", justifyContent: "center", py: 6, flex: 1 }}>
                  <CircularProgress />
                </Box>
              )}

              {!searchMutation.isPending && !hasSearched && (
                <KnownFacesEmptyState
                  icon={<SearchOutlinedIcon sx={{ fontSize: 36 }} />}
                  title="Search past captures"
                  subtitle="Upload a reference face photo and tap Search."
                />
              )}

              {showEmptyResults && (
                <KnownFacesEmptyState
                  icon={<FaceRetouchingNaturalOutlinedIcon sx={{ fontSize: 36 }} />}
                  title="No matches found"
                  subtitle={emptyMessage}
                />
              )}

              {filteredResults.length > 0 && !searchMutation.isPending && (
                <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
                  {filteredResults.map((hit: FaceSearchHit, idx: number) => (
                    <Grid key={`${hit.detection?.id ?? hit.matched_face_id ?? idx}`} size={{ xs: 12, sm: 6 }}>
                      <SearchResultCard hit={hit} onExpand={() => setExpandIndex(idx)} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={expandHit != null} onClose={() => setExpandIndex(null)} maxWidth="md" fullWidth>
        {expandHit && expandIndex != null && (
          <>
            <DialogTitle sx={{ pr: 6 }}>
              {expandHit.detection.camera_id || "Capture"}
              {expandHit.detection.identity_name ? ` — ${expandHit.detection.identity_name}` : ""}
              {filteredResults.length > 1 ? (
                <Typography component="span" sx={{ ml: 1, fontSize: "0.875rem", color: "text.secondary", fontWeight: 600 }}>
                  ({expandIndex + 1} of {filteredResults.length})
                </Typography>
              ) : null}
            </DialogTitle>
            <DialogContent>
              <Box sx={{ position: "relative" }}>
                {expandHit.detection.frame_path ? (
                  <Box
                    component="img"
                    src={walkingImageUrl(expandHit.detection.frame_path)}
                    alt="Full frame"
                    sx={{ width: "100%", borderRadius: "8px", border: "1px solid rgba(15,23,42,0.08)", display: "block" }}
                  />
                ) : (
                  <Typography sx={{ color: "text.secondary" }}>Full-frame image not available.</Typography>
                )}

                {filteredResults.length > 1 ? (
                  <>
                    <IconButton
                      onClick={goPrevious}
                      disabled={!hasPrevious}
                      aria-label="Previous match"
                      sx={{
                        position: "absolute",
                        left: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        bgcolor: "rgba(15,23,42,0.72)",
                        color: "#fff",
                        "&:hover": { bgcolor: "rgba(15,23,42,0.88)" },
                        "&.Mui-disabled": { bgcolor: "rgba(15,23,42,0.35)", color: "rgba(255,255,255,0.5)" },
                      }}
                    >
                      <ChevronLeftIcon fontSize="large" />
                    </IconButton>
                    <IconButton
                      onClick={goNext}
                      disabled={!hasNext}
                      aria-label="Next match"
                      sx={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        bgcolor: "rgba(15,23,42,0.72)",
                        color: "#fff",
                        "&:hover": { bgcolor: "rgba(15,23,42,0.88)" },
                        "&.Mui-disabled": { bgcolor: "rgba(15,23,42,0.35)", color: "rgba(255,255,255,0.5)" },
                      }}
                    >
                      <ChevronRightIcon fontSize="large" />
                    </IconButton>
                  </>
                ) : null}
              </Box>
              <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 1 }}>
                <Chip size="small" label={`Match ${formatQuality(faceSearchScore(expandHit))}`} color="primary" />
                {expandHit.detection.timestamp && (
                  <Chip size="small" variant="outlined" label={formatEnrollDate(expandHit.detection.timestamp)} />
                )}
              </Box>
            </DialogContent>
            <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
              {filteredResults.length > 1 ? (
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button onClick={goPrevious} disabled={!hasPrevious} startIcon={<ChevronLeftIcon />}>
                    Previous
                  </Button>
                  <Button onClick={goNext} disabled={!hasNext} endIcon={<ChevronRightIcon />}>
                    Next
                  </Button>
                </Box>
              ) : (
                <span />
              )}
              <Button onClick={() => setExpandIndex(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}
