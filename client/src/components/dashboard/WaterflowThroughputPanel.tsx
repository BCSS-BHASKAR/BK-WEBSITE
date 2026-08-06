import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Chip, Skeleton, Typography, useTheme } from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { api } from "../../lib/api";
import { contentCardSx } from "../../lib/uiSurfaces";
import { pnp, pnpFont } from "../../lib/pnpTheme";
import { SITE_LABELS } from "../../i18n/lang";
import { ymdSite } from "../../lib/siteTimeZone";
import {
  WATERFLOW_THRESHOLDS,
  type WaterflowThresholdTier,
} from "../../lib/waterflowThresholds";
import { WaterflowThroughputChart } from "../charts/WaterflowThroughputChart";
import type { TrafficPoint } from "../charts/TrafficAreaChart";

type WaterflowResp = {
  siteName: string;
  from: string;
  windowStart?: string;
  windowEnd?: string;
  thresholdPerHour?: number;
  thresholds?: { alert: number; alarm: number; critical: number };
  total: number;
  timeseries: {
    bucket: string;
    total: number;
    partial?: boolean;
    drillDay?: string;
    hourStartUnix?: number;
  }[];
};

function thresholdsFromApi(raw?: WaterflowResp["thresholds"]): WaterflowThresholdTier[] {
  if (!raw) return WATERFLOW_THRESHOLDS;
  return WATERFLOW_THRESHOLDS.map((tier) => ({
    ...tier,
    value: Number(raw[tier.key as keyof typeof raw]) || tier.value,
  }));
}

function WaterLevelLineIcon() {
  const primary = useTheme().palette.primary.main;
  return (
    <Box
      component="span"
      sx={{
        width: 14,
        height: 0,
        borderTop: `2.5px solid ${primary}`,
        display: "block",
        ml: 0.75,
      }}
    />
  );
}

export function WaterflowThroughputPanel() {
  const q = useQuery({
    queryKey: ["dashboard", "waterflow-throughput", ymdSite()],
    queryFn: async () => (await api.get<WaterflowResp>("/dashboard/waterflow-throughput")).data,
    refetchInterval: 60_000,
  });

  const pending = q.isPending && !q.data;
  const chartPoints: TrafficPoint[] = (q.data?.timeseries ?? []).map((p) => ({
    name: p.bucket,
    total: p.total,
    partial: p.partial,
    drillDay: p.drillDay,
    hourStartUnix: p.hourStartUnix,
  }));
  const today = q.data?.from ?? ymdSite();
  const thresholds = useMemo(
    () => thresholdsFromApi(q.data?.thresholds),
    [q.data?.thresholds]
  );
  const subtitle =
    q.data?.windowStart && q.data?.windowEnd
      ? `${q.data.windowStart} – ${q.data.windowEnd} · ${q.data.siteName}`
      : SITE_LABELS.waterflowThroughputHint;

  return (
    <Box sx={{ ...contentCardSx, p: 2, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, mb: 1.5, flexWrap: "wrap" }}>
        <Box>
          <Typography sx={pnpFont.cardTitle}>{SITE_LABELS.waterflowThroughput}</Typography>
          <Typography sx={{ ...pnpFont.cardSubtitle, mt: 0.35 }}>{subtitle}</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {pending ? (
            <Skeleton width={88} height={28} sx={{ borderRadius: 1 }} />
          ) : (
            <Chip
              size="small"
              icon={<WaterLevelLineIcon />}
              label="Water Level"
              sx={{
                height: 24,
                fontWeight: 700,
                fontSize: "0.6875rem",
                bgcolor: pnp.primarySoft,
                color: pnp.primary,
                border: "none",
                "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
              }}
            />
          )}
          <Chip
            size="small"
            icon={<FiberManualRecordIcon sx={{ fontSize: "8px !important", color: `${pnp.success} !important` }} />}
            label="Hourly"
            sx={{ height: 24, fontWeight: 700, fontSize: "0.625rem", bgcolor: pnp.successSoft, color: pnp.success, border: "none" }}
          />
        </Box>
      </Box>
      {pending ? (
        <Skeleton variant="rounded" height={220} sx={{ borderRadius: 2 }} />
      ) : (
        <WaterflowThroughputChart data={chartPoints} thresholds={thresholds} hourContextYmd={today} />
      )}
    </Box>
  );
}
