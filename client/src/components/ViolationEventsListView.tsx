import {
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import type { ImageZoomPayload } from "./ImageZoomDialog";
import type { ViolationEventRow } from "./ViolationEventCard";
import { formatVehicleEventDisplayTime } from "../lib/siteTimeZone";
import { SITE_LABELS } from "../i18n/lang";
import { violationTypeLabel, violationTypeMeta } from "../lib/violationTypes";
import { zoomPayloadFromViolationRow } from "../lib/eventImageZoom";

const headSx = {
  fontWeight: 800,
  fontSize: "0.6875rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "text.secondary",
  bgcolor: "rgba(15, 23, 42, 0.03)",
  borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
  py: 1.1,
};

const cellSx = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
  py: 1.15,
};

type Props = {
  rows: ViolationEventRow[];
  onZoom: (payload: ImageZoomPayload) => void;
};

export function ViolationEventsListView({ rows, onZoom }: Props) {
  return (
    <TableContainer sx={{ borderRadius: "8px", border: "1px solid rgba(15, 23, 42, 0.08)", overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Plate</TableCell>
            <TableCell sx={headSx}>Violation</TableCell>
            <TableCell sx={headSx}>Camera site</TableCell>
            <TableCell sx={headSx}>Detected</TableCell>
            <TableCell sx={{ ...headSx, width: 56, textAlign: "center" }} align="center">
              View
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const zoom = zoomPayloadFromViolationRow(row);
            const meta = violationTypeMeta(row.violationType);

            return (
              <TableRow
                key={row.id}
                hover
                sx={{
                  "&:last-child td": { borderBottom: 0 },
                  "&:hover": { bgcolor: "rgba(37, 99, 235, 0.04)" },
                }}
              >
                <TableCell sx={cellSx}>
                  <Typography
                    sx={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontWeight: 800,
                      fontSize: "0.875rem",
                    }}
                  >
                    {row.plate?.trim() || SITE_LABELS.plateNumberPending}
                  </Typography>
                </TableCell>
                <TableCell sx={cellSx}>
                  <Chip
                    size="small"
                    label={violationTypeLabel(row.violationType)}
                    sx={{
                      height: 22,
                      fontWeight: 800,
                      fontSize: "0.6875rem",
                      bgcolor: meta ? `${meta.color}18` : "rgba(15,23,42,0.06)",
                      color: meta?.color ?? "text.primary",
                      border: meta ? `1px solid ${meta.color}44` : "1px solid rgba(15,23,42,0.1)",
                    }}
                  />
                </TableCell>
                <TableCell sx={cellSx}>{row.cameraName || row.cameraId}</TableCell>
                <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                  {row.detectedAt
                    ? formatVehicleEventDisplayTime({ created_at: row.detectedAt })
                    : "—"}
                </TableCell>
                <TableCell align="center" sx={cellSx}>
                  <Tooltip title={zoom ? "View capture" : "No image on file"}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!zoom}
                        onClick={() => zoom && onZoom(zoom)}
                        aria-label="View capture"
                        sx={{
                          border: "1px solid rgba(15, 23, 42, 0.1)",
                          borderRadius: "8px",
                          color: "primary.main",
                        }}
                      >
                        <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
