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
import { zoomPayloadFromWalkinRow } from "../lib/eventImageZoom";
import { receiverImageUrl } from "../lib/receiverImageUrl";

export type WalkinListRow = {
  id: number;
  site_id: number;
  site_name: string;
  camera_id: string;
  image_path: string;
  frame_path?: string;
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
  rows: WalkinListRow[];
  cameraMap: Record<string, string>;
  onZoomAt: (index: number) => void;
};

export function WalkinsEventsListView({ rows, cameraMap, onZoomAt }: Props) {
  return (
    <TableContainer sx={{ borderRadius: "8px", border: "1px solid rgba(15, 23, 42, 0.08)", overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Capture</TableCell>
            <TableCell sx={headSx}>Event</TableCell>
            <TableCell sx={headSx}>Entrance</TableCell>
            <TableCell sx={headSx}>Site</TableCell>
            <TableCell sx={headSx}>Detected at</TableCell>
            <TableCell sx={headSx} align="right">
              View
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => {
            const imageUrl = receiverImageUrl(row.image_path);
            const zoom = zoomPayloadFromWalkinRow(row);
            return (
              <TableRow key={row.id} hover>
                <TableCell sx={cellSx}>
                  {imageUrl ? (
                    <Box
                      component="img"
                      src={imageUrl}
                      alt="Walk-in capture"
                      sx={{
                        width: 56,
                        height: 40,
                        objectFit: "cover",
                        objectPosition: "top",
                        borderRadius: 1,
                        display: "block",
                      }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      No image
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={cellSx}>#{row.id}</TableCell>
                <TableCell sx={cellSx}>{(cameraMap[row.camera_id] ?? row.camera_id) || "—"}</TableCell>
                <TableCell sx={cellSx}>{row.site_name || `Site ${row.site_id}`}</TableCell>
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
