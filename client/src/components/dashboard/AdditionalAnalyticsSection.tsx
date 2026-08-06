import { Box, Chip, Skeleton, Typography } from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { DashboardPanel } from "./DashboardPanel";
import { BusyHoursHeatmap } from "./BusyHoursHeatmap";
import { TopPlatesTable } from "./TopPlatesTable";
import { formatReportPeriodLabel } from "../../lib/reportPeriodLabel";
import { pnp } from "../../lib/pnpTheme";
import type { HeatmapData } from "./DashboardHeatmap";
import type { TopPlateRow } from "./TopPlatesTable";

export type AdditionalAnalyticsProps = {
  heatmap?: HeatmapData;
  heatmapPending?: boolean;
  reportFrom: string;
  reportTo: string;
  topPlates: TopPlateRow[];
  topPlatesPending?: boolean;
  onHeatmapCell?: (cameraId: string, hourIndex: number) => void;
  onOpenVehicleReport: (opts: { plate?: string; cameraId?: string }) => void;
};

export function AdditionalAnalyticsSection({
  heatmap,
  heatmapPending,
  reportFrom,
  reportTo,
  topPlates,
  topPlatesPending,
  onHeatmapCell,
  onOpenVehicleReport,
}: AdditionalAnalyticsProps) {
  const reportPeriodLabel = formatReportPeriodLabel(reportFrom, reportTo);
  return (
    <Box
      sx={{
        borderRadius: "12px",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        bgcolor: "#FFFFFF",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          flexWrap: "wrap",
          px: 2,
          py: 1.5,
          borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
          bgcolor: "#FFFFFF",
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", color: pnp.text, letterSpacing: "-0.01em" }}>
            Additional Analytics
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, mt: 0.35, lineHeight: 1.4 }}>
            Busy hours and top plates
          </Typography>
        </Box>
        <Chip
          size="small"
          icon={<FiberManualRecordIcon sx={{ fontSize: "8px !important", color: `${pnp.success} !important` }} />}
          label="Live"
          sx={{
            height: 24,
            fontWeight: 700,
            fontSize: "0.6875rem",
            bgcolor: pnp.successSoft,
            color: pnp.success,
            border: "none",
            "& .MuiChip-icon": { ml: 0.75 },
          }}
        />
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: { xs: 1.5, sm: 2 }, bgcolor: "#F8FAFC" }}>
        <DashboardPanel title="" subtitle="" minHeight={0} sx={{ p: { xs: 1.75, sm: 2.25 }, borderRadius: "10px" }}>
          {heatmapPending ? <Skeleton variant="rounded" height={220} /> : <BusyHoursHeatmap heatmap={heatmap} onCellClick={onHeatmapCell} />}
        </DashboardPanel>

        <TopPlatesTable
          rows={topPlates.slice(0, 5)}
          pending={topPlatesPending}
          reportPeriodLabel={reportPeriodLabel}
          onViewAll={() => onOpenVehicleReport({})}
          onRowClick={(plate) => onOpenVehicleReport({ plate })}
        />
      </Box>
    </Box>
  );
}
