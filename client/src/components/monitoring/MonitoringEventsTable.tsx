import {
  Box, Chip, IconButton, Pagination, Paper, Skeleton, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PlayCircleFilledRoundedIcon from "@mui/icons-material/PlayCircleFilledRounded";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import ThumbDownAltIcon from "@mui/icons-material/ThumbDownAlt";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import type { ReactNode } from "react";
import { contentCardSx } from "../../lib/uiSurfaces";
import { ellipsisSx, tableCellSx, tableHeadSx, thumbSx } from "./monitoringTokens";
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
  /**
   * Resolves the module for ONE row, for tables that mix modules.
   *
   * Active Alerts lists every service in one table but could only pass a single
   * `module`, so all 336 rows wore the same "Intrusion" chip regardless of what
   * actually fired. Single-module pages leave this unset and keep using
   * `module`.
   */
  moduleForRow?: (row: MonitoringRow) => InferenceModule;
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
 * One column of the events table: its header, its width, the breakpoint below
 * which it drops out, and how it renders a cell.
 *
 * Header and body cells are both generated from this single list, so a column
 * can never appear in one and not the other - which is what used to let the
 * headers drift out of step with the row content on modules whose capability
 * set added a column mid-table.
 */
type Column = {
  key: string;
  label: string;
  align?: "center";
  /** Fixed px width. The one column that omits it (Camera) absorbs the slack. */
  width?: number;
  /** Dropped below this breakpoint so the table never needs a sideways scroll. */
  hideBelow?: "sm" | "md";
  render: (r: MonitoringRow, i: number) => ReactNode;
};

/**
 * The Monitoring detection-events table.
 *
 * Columns are derived from the module's declared capabilities rather than a
 * single fixed schema: Duration appears only for loitering, Confidence only for
 * walk-ins, Identity only where a GID/session tag exists. Per the brief, a
 * module never shows a column its detector cannot populate. There is no Site
 * column because nothing in the inference data links a detection to a site.
 *
 * Layout is `table-layout: fixed` at a full 100% width. That is what keeps the
 * header rule and the row content on the same vertical lines, holds the column
 * widths steady from page to page regardless of how long the values happen to
 * be, and keeps the table inside its card instead of spilling into a horizontal
 * scrollbar. Values that can run long (camera keys, garment names) ellipsize
 * and keep their tooltip rather than widening the column.
 *
 * Visual style (header casing, cell weight, borders, thumbnail geometry) comes
 * from monitoringTokens.
 */
export function MonitoringEventsTable({
  module, rows, total, page, pageSize, loading, moduleForRow, cameraLabel, feedbackFor,
  onPageChange, onView,
}: Props) {
  const caps = module.capabilities;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns: Column[] = [
    {
      key: "capture", label: "Capture", width: 78,
      render: (r) => {
        const thumb = r.posterUrl || (!r.isVideo ? r.mediaUrl : undefined);
        return (
          <Box sx={{ position: "relative", width: 56, height: 40 }}>
            {thumb ? (
              <Box
                component="img" src={thumb} alt="" loading="lazy" sx={thumbSx}
                // Poster URLs are offered before the file exists, so a few will
                // 404 (a clip too large to render one). Hide the element rather
                // than show a broken-image icon.
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
              />
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
        );
      },
    },
    {
      key: "event", label: "Event", width: 128, hideBelow: "sm",
      render: (r) => {
        // Per-row when the table mixes modules, page-level otherwise.
        const rm = moduleForRow ? moduleForRow(r) : module;
        return (
          <Chip
            size="small" label={rm.eventNoun}
            sx={{
              maxWidth: "100%", height: 22, fontSize: 11, fontWeight: 700,
              bgcolor: `${rm.colour}1A`, color: rm.colour,
              border: `1px solid ${rm.colour}44`,
            }}
          />
        );
      },
    },
    {
      // No width: this is the flexible column that takes whatever is left.
      key: "camera", label: "Camera",
      render: (r) => (
        <Tooltip title={r.camera_key || ""}>
          <Box component="span" sx={ellipsisSx}>
            {cameraLabel ? cameraLabel(r.camera_key || "") : (r.camera_key || "—").trim()}
          </Box>
        </Tooltip>
      ),
    },
    ...(caps.duration
      ? [{
          key: "duration", label: "Duration", width: 100, hideBelow: "md" as const,
          render: (r: MonitoringRow) => fmtDuration(r.dwell_seconds),
        }]
      : []),
    ...(caps.confidence
      ? [{
          key: "confidence", label: "Confidence", width: 108, hideBelow: "md" as const,
          render: (r: MonitoringRow) =>
            r.confidence == null ? "—" : `${Math.round(Number(r.confidence) * 100)}%`,
        }]
      : []),
    ...(caps.identity
      ? [{
          key: "identity", label: "Identity", width: 108, hideBelow: "md" as const,
          render: (r: MonitoringRow) => (r.global_id ? `GID ${r.global_id}` : r.tag || "—"),
        }]
      : []),
    ...(caps.appearance
      ? [{
          key: "appearance", label: "Appearance", width: 150, hideBelow: "md" as const,
          render: (r: MonitoringRow) => (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
              {(r.colours || []).filter((c) => c.region === "upper").slice(0, 2).map((c, idx) => (
                <Box key={idx} title={`${c.name} ${c.percentage ?? ""}%`}
                     sx={{
                       width: 14, height: 14, borderRadius: "3px", flexShrink: 0,
                       border: "1px solid rgba(0,0,0,.22)",
                       bgcolor: c.rgb && c.rgb.length === 3 ? `rgb(${c.rgb.join(",")})` : "#999",
                     }} />
              ))}
              <Box component="span" sx={{ ...ellipsisSx, fontSize: 12, fontWeight: 600 }}>
                {r.upper_garment || "—"}
              </Box>
            </Stack>
          ),
        }]
      : []),
    {
      key: "detected", label: "Detected at", width: 132,
      // Wraps to two lines rather than forcing the table wider on a phone.
      render: (r) => <Box component="span" sx={{ whiteSpace: "normal" }}>{fmtWhen(r)}</Box>,
    },
    {
      key: "status", label: "Status", width: 126, hideBelow: "sm",
      render: (r) => {
        const verdict = feedbackFor ? feedbackFor(r) : null;
        return verdict === "verified" ? (
          <Chip size="small" color="success" variant="outlined"
                icon={<ThumbUpAltIcon sx={{ fontSize: 13 }} />} label="Verified"
                sx={{ maxWidth: "100%", height: 22, fontSize: 11 }} />
        ) : verdict === "false_positive" ? (
          <Chip size="small" color="error" variant="outlined"
                icon={<ThumbDownAltIcon sx={{ fontSize: 13 }} />} label="False positive"
                sx={{ maxWidth: "100%", height: 22, fontSize: 11 }} />
        ) : (
          <Chip size="small" variant="outlined" label="Active"
                sx={{ maxWidth: "100%", height: 22, fontSize: 11 }} />
        );
      },
    },
    {
      key: "view", label: "View", align: "center", width: 68,
      render: (_r, i) => (
        <IconButton size="small" aria-label="View detection"
                    onClick={(e) => { e.stopPropagation(); onView(i); }}>
          <VisibilityOutlinedIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  /** Width + responsive visibility, applied identically to header and body. */
  const colSx = (c: Column) => ({
    width: c.width, minWidth: c.width, maxWidth: c.width,
    ...(c.hideBelow
      ? { display: { xs: "none", [c.hideBelow]: "table-cell" } }
      : {}),
  });

  return (
    <Paper sx={{ ...contentCardSx, p: 0, overflow: "hidden" }}>
      <TableContainer sx={{ maxHeight: 720, overflowX: "auto" }}>
        <Table size="small" stickyHeader sx={{ width: "100%", tableLayout: "fixed" }}>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} sx={{ ...tableHeadSx, ...colSx(c) }} align={c.align}>
                  {c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key} sx={{ ...tableCellSx, ...colSx(c) }}>
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

            {!loading && rows.map((r, i) => (
              <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => onView(i)}>
                {columns.map((c) => (
                  <TableCell key={c.key} sx={{ ...tableCellSx, ...colSx(c) }} align={c.align}>
                    {c.render(r, i)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
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
