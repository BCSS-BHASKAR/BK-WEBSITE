import {
  Box,
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
import { formatPeopleReportDisplayTime } from "../lib/siteTimeZone";
import { receiverImageUrl } from "../lib/receiverImageUrl";
import { zoomPayloadFromCrowdRow } from "../lib/eventImageZoom";
import { crowdAlertTypeColor, crowdAlertTypeDescription, crowdAlertTypeLabel } from "../lib/crowdAlertTypes";
import { resolveCrowdZoneName } from "../lib/reportFilterScopes";

export type CrowdListRow = {
  id: number;
  site_id: number | null;
  site_name: string;
  camera_id: string;
  alert_type?: string;
  people_count: number;
  occupancy_pct: number;
  image_path: string;
  trigger_date: string;
};

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
  rows: CrowdListRow[];
  cameraMap: Record<string, string>;
  onZoomAt: (index: number) => void;
};

// Single-venue deployment: every alert comes from the same camera area, so the
// Zone column carries no information. Flip to true to bring it back.
const SHOW_ZONE_COLUMN = false;

export function CrowdsEventsListView({ rows, cameraMap, onZoomAt }: Props) {
  return (
    <TableContainer sx={{ borderRadius: "8px", border: "1px solid rgba(15, 23, 42, 0.08)", overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Alert capture</TableCell>
            <TableCell sx={headSx}>Alert type</TableCell>
            <TableCell sx={headSx}>Detail</TableCell>
            {SHOW_ZONE_COLUMN ? <TableCell sx={headSx}>Zone</TableCell> : null}
            <TableCell sx={headSx}>Site</TableCell>
            <TableCell sx={headSx}>Alerted at</TableCell>
            <TableCell sx={headSx} align="right">
              View
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => {
            const imageUrl = receiverImageUrl(row.image_path);
            const zoom = zoomPayloadFromCrowdRow(row);
            return (
              <TableRow key={row.id} hover>
                <TableCell sx={cellSx}>
                  {imageUrl ? (
                    <Box
                      component="img"
                      src={imageUrl}
                      alt="Alert capture"
                      sx={{ width: 56, height: 40, objectFit: "cover", borderRadius: 1, display: "block" }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      No image
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={cellSx}>
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 20,
                      px: 1.1,
                      borderRadius: 999,
                      fontSize: "10px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: crowdAlertTypeColor(row.alert_type).color,
                      bgcolor: crowdAlertTypeColor(row.alert_type).softColor,
                      border: `1px solid ${crowdAlertTypeColor(row.alert_type).color}33`,
                    }}
                  >
                    {crowdAlertTypeLabel(row.alert_type)}
                  </Box>
                </TableCell>
                <TableCell sx={{ ...cellSx, fontWeight: 500, color: "text.secondary" }}>
                  {crowdAlertTypeDescription(row.alert_type)}
                </TableCell>
                {SHOW_ZONE_COLUMN ? (
                  <TableCell sx={cellSx}>{(cameraMap[row.camera_id] ?? resolveCrowdZoneName(row.camera_id)) || "—"}</TableCell>
                ) : null}
                <TableCell sx={cellSx}>{row.site_name || "—"}</TableCell>
                <TableCell sx={cellSx}>{formatPeopleReportDisplayTime(row.trigger_date)}</TableCell>
                <TableCell sx={cellSx} align="right">
                  {zoom ? (
                    <Tooltip title="View full image">
                      <IconButton size="small" onClick={() => onZoomAt(index)}>
                        <VisibilityOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
