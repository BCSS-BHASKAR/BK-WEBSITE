import {
  Box, Chip, IconButton, Pagination, Paper, Skeleton, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PlayCircleFilledRoundedIcon from "@mui/icons-material/PlayCircleFilledRounded";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import ThumbDownAltIcon from "@mui/icons-material/ThumbDownAlt";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import { contentCardSx } from "../../lib/uiSurfaces";
import { tableCellSx, tableHeadSx, thumbSx } from "./monitoringTokens";
import type { InferenceModule } from "../../lib/inferenceModules";

export type MonitoringRow = {
  id: number;
  camera_key: string | null;
  mediaUrl?: string;
  posterUrl?: string;
  isVideo?: boolean;
  content_type?: string | null;
  // module-specific, all optional
  detected_at?: string;
  started_at?: string;
  occurred_at?: string;
  captured_at?: string;
  dwell_seconds?: number | null;
  confidence?: string | number | null;
  track_id?: number;
  tag?: string | null;
  global_id?: number | null;
  upper_garment?: string | null;
  colours?: { region: string; name: string; percentage: number | null; rgb: number[] | null }[];
};

export type FeedbackVerdict = "verified" | "false_positive" | null;

type Props = {
  module: InferenceModule;
  rows: MonitoringRow[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  cameraLabel?: (key: string) => string;
  feedbackFor?: (row: MonitoringRow) => FeedbackVerdict;
  onPageChange: (page: number) => void;
  onView: (index: number) => void;
};

const SITE_TZ = "Asia/Kolkata";

function fmtWhen(row: MonitoringRow): string {
  const ts = row.detected_at || row.started_at || row.occurred_at || row.captured_at;
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: SITE_TZ, day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function fmtDuration(s?: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/**
 * The Monitoring detection-events table.
 *
 * Columns are derived from the module's declared capabilities rather than a
 * single fixed schema: Duration appears only for loitering, Confidence only for
 * walk-ins, Identity only where a GID/session tag exists. Per the brief, a
 * module never shows a column its detector cannot populate. There is no Site
 * column because nothing in the inference data links a detection to a site.
 *
 * Visual style (header casing, cell weight, borders, thumbnail geometry) comes
 * from monitoringTokens, which holds the values previously duplicated inside
 * each of the four legacy *EventsListView components.
 */
export function MonitoringEventsTable({
  module, rows, total, page, pageSize, loading, cameraLabel, feedbackFor, onPageChange, onView,
}: Props) {
  const caps = module.capabilities;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns: { key: string; label: string; align?: "right" | "center" }[] = [
    { key: "capture", label: "Capture" },
    { key: "event", label: "Event" },
    { key: "camera", label: "Camera" },
    ...(caps.duration ? [{ key: "duration", label: "Duration" }] : []),
    ...(caps.confidence ? [{ key: "confidence", label: "Confidence" }] : []),
    ...(caps.identity ? [{ key: "identity", label: "Identity" }] : []),
    ...(caps.appearance ? [{ key: "appearance", label: "Appearance" }] : []),
    { key: "detected", label: "Detected at" },
    { key: "status", label: "Status" },
    { key: "view", label: "View", align: "center" as const },
  ];

  return (
    <Paper sx={{ ...contentCardSx, p: 0, overflow: "hidden" }}>
      <TableContainer sx={{ maxHeight: 720 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} sx={tableHeadSx} align={c.align}>{c.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key} sx={tableCellSx}>
                      <Skeleton variant={c.key === "capture" ? "rectangular" : "text"}
                                width={c.key === "capture" ? 56 : "80%"}
                                height={c.key === "capture" ? 40 : 18} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} sx={{ ...tableCellSx, py: 6, textAlign: "center" }}>
                  <InboxOutlinedIcon sx={{ fontSize: 34, opacity: 0.3, display: "block", mx: "auto", mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    No {module.eventNoun.toLowerCase()}s match these filters.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!loading && rows.map((r, i) => {
              const verdict = feedbackFor ? feedbackFor(r) : null;
              const thumb = r.posterUrl || (!r.isVideo ? r.mediaUrl : undefined);
              return (
                <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => onView(i)}>
                  <TableCell sx={tableCellSx}>
                    <Box sx={{ position: "relative", width: 56, height: 40 }}>
                      {thumb ? (
                        <Box component="img" src={thumb} alt="" loading="lazy" sx={thumbSx} />
                      ) : (
                        <Box sx={{ ...thumbSx, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        </Box>
                      )}
                      {r.isVideo && (
                        <PlayCircleFilledRoundedIcon
                          sx={{
                            position: "absolute", inset: 0, m: "auto", fontSize: 20,
                            color: "rgba(255,255,255,.95)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,.7))",
                          }}
                        />
                      )}
                    </Box>
                  </TableCell>

                  <TableCell sx={tableCellSx}>
                    <Chip
                      size="small" label={module.eventNoun}
                      sx={{
                        height: 22, fontSize: 11, fontWeight: 700,
                        bgcolor: `${module.colour}1A`, color: module.colour,
                        border: `1px solid ${module.colour}44`,
                      }}
                    />
                  </TableCell>

                  <TableCell sx={tableCellSx}>
                    <Tooltip title={r.camera_key || ""}>
                      <span>{cameraLabel ? cameraLabel(r.camera_key || "") : (r.camera_key || "—").trim()}</span>
                    </Tooltip>
                  </TableCell>

                  {caps.duration && <TableCell sx={tableCellSx}>{fmtDuration(r.dwell_seconds)}</TableCell>}

                  {caps.confidence && (
                    <TableCell sx={tableCellSx}>
                      {r.confidence == null ? "—" : `${Math.round(Number(r.confidence) * 100)}%`}
                    </TableCell>
                  )}

                  {caps.identity && (
                    <TableCell sx={tableCellSx}>
                      {r.global_id ? `GID ${r.global_id}` : r.tag || "—"}
                    </TableCell>
                  )}

                  {caps.appearance && (
                    <TableCell sx={tableCellSx}>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {(r.colours || []).filter((c) => c.region === "upper").slice(0, 2).map((c, idx) => (
                          <Box key={idx} title={`${c.name} ${c.percentage ?? ""}%`}
                               sx={{
                                 width: 14, height: 14, borderRadius: "3px",
                                 border: "1px solid rgba(0,0,0,.22)",
                                 bgcolor: c.rgb && c.rgb.length === 3 ? `rgb(${c.rgb.join(",")})` : "#999",
                               }} />
                        ))}
                        <Box component="span" sx={{ fontSize: 12, fontWeight: 600 }}>
                          {r.upper_garment || "—"}
                        </Box>
                      </Stack>
                    </TableCell>
                  )}

                  <TableCell sx={tableCellSx}>{fmtWhen(r)}</TableCell>

                  <TableCell sx={tableCellSx}>
                    {verdict === "verified" ? (
                      <Chip size="small" color="success" variant="outlined"
                            icon={<ThumbUpAltIcon sx={{ fontSize: 13 }} />} label="Verified"
                            sx={{ height: 22, fontSize: 11 }} />
                    ) : verdict === "false_positive" ? (
                      <Chip size="small" color="error" variant="outlined"
                            icon={<ThumbDownAltIcon sx={{ fontSize: 13 }} />} label="False positive"
                            sx={{ height: 22, fontSize: 11 }} />
                    ) : (
                      <Chip size="small" variant="outlined" label="Active" sx={{ height: 22, fontSize: 11 }} />
                    )}
                  </TableCell>

                  <TableCell sx={tableCellSx} align="center">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); onView(i); }}>
                      <VisibilityOutlinedIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {pageCount > 1 && (
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", p: 1.5, flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </Typography>
          <Pagination
            count={pageCount} page={page} onChange={(_e, v) => onPageChange(v)}
            shape="rounded" showFirstButton showLastButton size="small" color="primary"
          />
        </Stack>
      )}
    </Paper>
  );
}
