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
import { formatVehicleEventDisplayTime } from "../lib/siteTimeZone";
import { zoomPayloadFromVehicleRow } from "../lib/eventImageZoom";
import { SHOW_PLATE_READ_CONFIDENCE_UI, type PlateReadFields } from "../lib/plateReadSummary";
import { PlateReadConfidenceInline } from "./PlateReadConfidence";

export type VehicleListRow = PlateReadFields & {
  id: number;
  camera_id: string;
  vehicle_num: string;
  vehicle_category: number;
  vehicle_type: string;
  full_image_url: string;
  plate_url: string;
  timestamp: number;
  created_at: string;
};

function categoryLabel(cat: number): string {
  const map: Record<number, string> = {
    1: "Car",
    2: "Car",
    3: "Truck",
    4: "Truck",
    5: "Motorcycle",
    6: "Motorcycle",
    7: "Mini-truck",
    8: "Mini-truck",
    9: "Bus",
    10: "Bus",
    11: "Tuktuk",
    12: "Tuktuk",
  };
  return map[Number(cat)] ?? String(cat ?? "—");
}

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
  rows: VehicleListRow[];
  cameraMap: Record<string, string>;
  onZoomAt: (index: number) => void;
};

export function VehicleEventsListView({ rows, cameraMap, onZoomAt }: Props) {
  return (
    <TableContainer sx={{ borderRadius: "8px", border: "1px solid rgba(15, 23, 42, 0.08)", overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Plate</TableCell>
            {SHOW_PLATE_READ_CONFIDENCE_UI ? (
              <TableCell sx={{ ...headSx, minWidth: 148 }}>Read confidence</TableCell>
            ) : null}
            <TableCell sx={headSx}>Class</TableCell>
            <TableCell sx={headSx}>Camera site</TableCell>
            <TableCell sx={headSx}>Read time</TableCell>
            <TableCell sx={{ ...headSx, width: 56, textAlign: "center" }} align="center">
              View
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => {
            const zoom = zoomPayloadFromVehicleRow(row);
            const attr = (row.vehicle_type || "").trim().toUpperCase();
            const attrLabel =
              attr === "ELECTRIC" ? "Private" : attr === "PUBLIC_UTILITY" ? "Public utility" : attr || "—";

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
                    {row.vehicle_num?.trim() || "—"}
                  </Typography>
                </TableCell>
                {SHOW_PLATE_READ_CONFIDENCE_UI ? (
                  <TableCell sx={cellSx}>
                    <PlateReadConfidenceInline row={row} />
                  </TableCell>
                ) : null}
                <TableCell sx={cellSx}>
                  <Box>
                    <Typography component="span" sx={{ fontWeight: 700 }}>
                      {categoryLabel(row.vehicle_category)}
                    </Typography>
                    {attrLabel !== "—" ? (
                      <Typography component="span" sx={{ color: "text.secondary", fontSize: "0.75rem", ml: 0.75 }}>
                        · {attrLabel}
                      </Typography>
                    ) : null}
                  </Box>
                </TableCell>
                <TableCell sx={cellSx}>{cameraMap[row.camera_id] ?? row.camera_id}</TableCell>
                <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                  {formatVehicleEventDisplayTime(row)}
                </TableCell>
                <TableCell align="center" sx={cellSx}>
                  <Tooltip title={zoom ? "View capture" : "No image on file"}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!zoom}
                        onClick={() => zoom && onZoomAt(index)}
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
