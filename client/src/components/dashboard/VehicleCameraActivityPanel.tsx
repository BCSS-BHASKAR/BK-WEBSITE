import type { ReactNode } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { MiniLineChart } from "../charts/MiniLineChart";
import { displayCameraName } from "../../lib/cameraDisplay";
import { pnp } from "../../lib/pnpTheme";
import { SITE_LABELS } from "../../i18n/lang";
import { CameraFleetStatusBar } from "./CameraFleetStatusBar";

type Props = {
  topPlate?: { plate: string; reads: number } | null;
  totalReads: number;
  uniquePlates: number;
  readsTrend?: string;
  distinctPlatesTrend?: string;
  busiestCamera?: { name: string; reads: number; id?: string | null };
  sparkTotals: number[];
  camerasOnline: number;
  camerasTotal: number;
  cameraUptimePercent?: number;
  pending?: boolean;
  onOpenVehicleReport: (opts: { plate?: string; cameraId?: string }) => void;
};

export function VehicleCameraActivityPanel({
  topPlate,
  totalReads,
  uniquePlates,
  readsTrend,
  distinctPlatesTrend,
  busiestCamera,
  sparkTotals,
  camerasOnline,
  camerasTotal,
  cameraUptimePercent,
  pending,
  onOpenVehicleReport,
}: Props) {
  const spark = sparkTotals.length ? sparkTotals : [1, 2, 3, 2, 4, 3, 5, 4];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, flex: 1, minWidth: 0 }}>
        <ActivityTile
          label={SITE_LABELS.mostReadPlate}
          value={topPlate?.plate ?? "—"}
          sub={topPlate ? `${topPlate.reads.toLocaleString()} reads` : undefined}
          chart={<MiniLineChart data={spark} height={30} width={88} />}
          onClick={topPlate ? () => onOpenVehicleReport({ plate: topPlate.plate }) : undefined}
        />
        <ActivityTile
          label="Plate reads (total)"
          value={pending ? "—" : totalReads.toLocaleString()}
          trend={readsTrend}
          chart={<MiniLineChart data={spark} height={30} width={88} />}
          onClick={() => onOpenVehicleReport({})}
        />
        <ActivityTile
          label={SITE_LABELS.distinctPlates}
          value={pending ? "—" : uniquePlates.toLocaleString()}
          trend={distinctPlatesTrend}
          chart={<MiniLineChart data={spark} height={30} width={88} />}
          onClick={() => onOpenVehicleReport({})}
        />
        <ActivityTile
          label={SITE_LABELS.highestVolumeSite}
          value={displayCameraName(busiestCamera?.name, busiestCamera?.id) || "—"}
          sub={busiestCamera?.reads ? `${busiestCamera.reads.toLocaleString()} reads` : undefined}
          chart={<MiniLineChart data={spark} height={30} width={88} />}
          onClick={busiestCamera?.id ? () => onOpenVehicleReport({ cameraId: busiestCamera.id! }) : undefined}
        />
      </Box>
      <CameraFleetStatusBar
        pending={pending}
        uptimePercent={cameraUptimePercent}
        camerasOnline={camerasOnline}
        camerasTotal={camerasTotal}
      />
    </Box>
  );
}

function ActivityTile({
  label,
  value,
  sub,
  trend,
  chart,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: string;
  chart?: ReactNode;
  onClick?: () => void;
}) {
  const trendUp = trend?.includes("↑");
  const trendDown = trend?.includes("↓");
  const trendColor = trendUp ? pnp.success : trendDown ? pnp.danger : pnp.textSecondary;
  const trendText = trend
    ? trend
        .replace(/^↓\s*/, "↘ ")
        .replace(/^↑\s*/, "↗ ")
        .replace(/\s*·\s*/g, " ")
    : null;

  const body = (
    <Box
      sx={{
        p: 1.35,
        height: "100%",
        minHeight: 92,
        borderRadius: "8px",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        bgcolor: "#FFFFFF",
        boxShadow: "0 1px 2px rgba(10, 25, 49, 0.03)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: pnp.textSecondary, lineHeight: 1.3 }}>{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 0.5, mt: 0.75, flex: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontSize: value.length > 8 ? "1rem" : "1.125rem",
              fontWeight: 800,
              color: pnp.text,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
            noWrap
          >
            {value}
          </Typography>
          {sub ? (
            <Typography sx={{ fontSize: "0.6875rem", color: pnp.textSecondary, mt: 0.3 }} noWrap>
              {sub}
            </Typography>
          ) : null}
          {trendText ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, mt: sub ? 0.35 : 0.5 }}>
              {trendUp ? <TrendingUpIcon sx={{ fontSize: 13, color: pnp.success }} /> : null}
              {trendDown ? <TrendingDownIcon sx={{ fontSize: 13, color: pnp.danger }} /> : null}
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: trendColor, lineHeight: 1.2 }}>{trendText}</Typography>
            </Box>
          ) : null}
        </Box>
        {chart}
      </Box>
    </Box>
  );

  if (!onClick) return body;
  return (
    <ButtonBase onClick={onClick} sx={{ display: "block", width: "100%", height: "100%", textAlign: "left", borderRadius: "8px" }}>
      {body}
    </ButtonBase>
  );
}
