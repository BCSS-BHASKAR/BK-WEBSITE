import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Box, Chip, Skeleton, Stack, Typography } from "@mui/material";
import DirectionsWalkOutlinedIcon from "@mui/icons-material/DirectionsWalkOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { api } from "../../lib/api";
import { DashboardPanel } from "./DashboardPanel";
import { TrafficAreaChart } from "../charts/TrafficAreaChart";
import { CameraBarChart } from "../charts/CameraBarChart";
import { AlertClockChart } from "../charts/AlertClockChart";
import {
  AlertTypeStackedChart,
  alertTypePoint,
  type AlertTypeStackedPoint,
} from "../charts/AlertTypeStackedChart";
import { formatReportPeriodLabel } from "../../lib/reportPeriodLabel";
import { goWalkinsReport } from "../../lib/walkinsReportNav";
import { goCrowdsReport } from "../../lib/crowdsReportNav";
import {
  CROWD_ALERT_TYPES,
  CROWD_ALERT_TYPE_META,
  crowdAlertTypeColor,
  crowdAlertTypeDescription,
  crowdAlertTypeLabel,
  type CrowdAlertType,
} from "../../lib/crowdAlertTypes";
import { resolveCrowdZoneName } from "../../lib/reportFilterScopes";
import { formatHourEndTickFromStart, formatPeopleReportDisplayTime } from "../../lib/siteTimeZone";
import { pnp } from "../../lib/pnpTheme";
import { gridCols } from "../../lib/uiSurfaces";

type WalkinsStats = {
  total: number;
  byHourOfDay: { hour: number; total: number }[];
  peakHour: { hour: number; total: number };
  activeEntrances: number;
  cameras: { camera_id: string; name: string; total: number }[];
  timeline: { label: string; total: number }[];
  timelineMode?: "hourly" | "daily";
};

type CrowdsStats = {
  total: number;
  peakPeople: number;
  peakOccupancy: number;
  bySeverity: { ALERT: number; ALARM: number; CRITICAL: number };
  byAlertType?: Record<CrowdAlertType, number>;
  byHourOfDay?: { hour: number; total: number; byAlertType?: Record<CrowdAlertType, number> }[];
  peakHour?: { hour: number; total: number };
  zones: { camera_id: string; name: string; alerts: number; peakPeople: number; peakOccupancy: number }[];
  timeline: {
    label: string;
    total: number;
    peakPeople: number;
    peakOccupancy: number;
    byAlertType?: Record<CrowdAlertType, number>;
  }[];
  timelineMode?: "hourly" | "daily";
};

type CrowdEventsResp = {
  rows: {
    id: number;
    camera_id: string;
    alert_type?: string;
    trigger_date: string;
  }[];
};

type Props = {
  from: string;
  to: string;
  spanDays: number;
};

// Single-area venue: every alert reports the same zone, so the latest-alerts
// feed shows what happened instead. Flip to true to show the zone again.
const SHOW_ALERT_ZONE = false;

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        px: 1.25,
        py: 0.85,
        borderRadius: "8px",
        bgcolor: "rgba(15,23,42,0.03)",
        border: "1px solid rgba(15,23,42,0.06)",
        minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: pnp.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "1rem", fontWeight: 800, color: pnp.text, mt: 0.25, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

export function PeopleAnalyticsSection({ from, to, spanDays }: Props) {
  const navigate = useNavigate();
  const reportPeriodLabel = formatReportPeriodLabel(from, to);
  const timelineResolution = spanDays > 1 ? "hourly" : undefined;

  const walkinsQ = useQuery({
    queryKey: ["dashboard", "walkins-range-stats", from, to, timelineResolution ?? "calendar"],
    queryFn: async () =>
      (
        await api.get<WalkinsStats>("/dashboard/walkins-range-stats", {
          params: { from, to, ...(timelineResolution ? { timelineResolution } : {}) },
        })
      ).data,
    refetchInterval: 15_000,
  });

  const crowdsQ = useQuery({
    queryKey: ["dashboard", "crowds-range-stats", from, to, timelineResolution ?? "calendar"],
    queryFn: async () =>
      (
        await api.get<CrowdsStats>("/dashboard/crowds-range-stats", {
          params: { from, to, ...(timelineResolution ? { timelineResolution } : {}) },
        })
      ).data,
    refetchInterval: 15_000,
  });

  const walkinsPending = walkinsQ.isPending && !walkinsQ.data;
  const crowdsPending = crowdsQ.isPending && !crowdsQ.data;

  const walkinTrend = useMemo(
    () => (walkinsQ.data?.timeline ?? []).map((p) => ({ name: p.label, total: p.total })),
    [walkinsQ.data?.timeline]
  );
  const hourBarData = useMemo(
    () =>
      (walkinsQ.data?.byHourOfDay ?? [])
        .filter((slot) => slot.total > 0)
        .map((slot) => ({
          name: formatHourEndTickFromStart(slot.hour, from === to ? from : undefined),
          total: slot.total,
        })),
    [walkinsQ.data?.byHourOfDay, from, to]
  );
  const peakHourLabel = useMemo(() => {
    const peak = walkinsQ.data?.peakHour;
    if (!peak || peak.total <= 0) return "—";
    return `${formatHourEndTickFromStart(peak.hour, from === to ? from : undefined)} (${peak.total.toLocaleString()})`;
  }, [walkinsQ.data?.peakHour, from, to]);
  const walkinZoneBars = useMemo(
    () =>
      (walkinsQ.data?.cameras ?? [])
        .filter((c) => (c.total ?? 0) > 0)
        .map((c) => ({ name: c.name, total: c.total })),
    [walkinsQ.data?.cameras]
  );

  const latestAlertsQ = useQuery({
    queryKey: ["dashboard", "crowds-latest", from, to],
    queryFn: async () =>
      (
        await api.get<CrowdEventsResp>("/dashboard/crowds-report-events", {
          params: { from, to, page: 1, pageSize: 4 },
        })
      ).data,
    refetchInterval: 15_000,
  });

  const crowdAlertTrend = useMemo<AlertTypeStackedPoint[]>(
    () => (crowdsQ.data?.timeline ?? []).map((p) => alertTypePoint(p.label, p.byAlertType)),
    [crowdsQ.data?.timeline]
  );

  const leadingAlertType = useMemo(() => {
    const counts = crowdsQ.data?.byAlertType;
    if (!counts) return null;
    let best: { type: CrowdAlertType; count: number } | null = null;
    for (const t of CROWD_ALERT_TYPES) {
      const c = counts[t] ?? 0;
      if (c > 0 && (!best || c > best.count)) best = { type: t, count: c };
    }
    return best;
  }, [crowdsQ.data?.byAlertType]);

  const dangerHourLabel = useMemo(() => {
    const peak = crowdsQ.data?.peakHour;
    if (!peak || peak.total <= 0) return "—";
    return `${formatHourEndTickFromStart(peak.hour, from === to ? from : undefined)} (${peak.total})`;
  }, [crowdsQ.data?.peakHour, from, to]);

  const hasWalkinData = (walkinsQ.data?.total ?? 0) > 0;
  const hasCrowdData = (crowdsQ.data?.total ?? 0) > 0;

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
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", color: pnp.text, letterSpacing: "-0.01em" }}>
            Guest & Alert Analytics
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, mt: 0.35 }}>
            Walk-in detections and AI alert inferences for {reportPeriodLabel}
          </Typography>
        </Box>
        <Chip
          size="small"
          icon={<FiberManualRecordIcon sx={{ fontSize: "8px !important", color: `${pnp.success} !important` }} />}
          label="Live"
          sx={{ height: 24, fontWeight: 700, fontSize: "0.6875rem", bgcolor: pnp.successSoft, color: pnp.success, border: "none" }}
        />
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: { xs: 1.5, sm: 2 }, bgcolor: "#F8FAFC" }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: gridCols(2) },
            gap: 2,
          }}
        >
          <DashboardPanel
            title="Walk-in Analytics"
            subtitle="Entrance detections and peak footfall hours"
            icon={<DirectionsWalkOutlinedIcon fontSize="small" />}
            iconTone="primary"
            footerLink={{ label: "Open walk-in report →", onClick: () => goWalkinsReport(navigate, { from, to }) }}
            minHeight={420}
          >
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" }, gap: 1, mb: 1.5 }}>
              {walkinsPending ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={52} sx={{ borderRadius: "8px" }} />)
              ) : (
                <>
                  <SummaryChip label="Walk-ins" value={(walkinsQ.data?.total ?? 0).toLocaleString()} />
                  <SummaryChip label="Peak hour" value={peakHourLabel} />
                  <SummaryChip label="Active entrances" value={String(walkinsQ.data?.activeEntrances ?? 0)} />
                </>
              )}
            </Box>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, mb: 0.75 }}>Detection trend</Typography>
            {walkinsPending ? (
              <Skeleton variant="rounded" height={160} />
            ) : hasWalkinData ? (
              <TrafficAreaChart
                data={walkinTrend}
                height={160}
                id="dash-walkins"
                timeScale={walkinsQ.data?.timelineMode === "hourly" ? "hour" : "day"}
                hourContextYmd={walkinsQ.data?.timelineMode === "hourly" && from === to ? from : undefined}
              />
            ) : (
              <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, py: 4, textAlign: "center" }}>
                No walk-in data for this period
              </Typography>
            )}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: gridCols(2) }, gap: 1.5, mt: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, mb: 0.75 }}>By time of day</Typography>
                {walkinsPending ? (
                  <Skeleton variant="rounded" height={150} />
                ) : hourBarData.length ? (
                  <CameraBarChart data={hourBarData} height={150} />
                ) : (
                  <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, py: 3, textAlign: "center" }}>—</Typography>
                )}
              </Box>
              <Box>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, mb: 0.75 }}>By entrance</Typography>
                {walkinsPending ? (
                  <Skeleton variant="rounded" height={150} />
                ) : walkinZoneBars.length ? (
                  <CameraBarChart data={walkinZoneBars} height={150} />
                ) : (
                  <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, py: 3, textAlign: "center" }}>—</Typography>
                )}
              </Box>
            </Box>
          </DashboardPanel>

          <DashboardPanel
            title="Active Alerts"
            subtitle="Security and kitchen staffing detections"
            icon={<WarningAmberRoundedIcon fontSize="small" />}
            iconTone="danger"
            footerLink={{ label: "View all alerts →", onClick: () => goCrowdsReport(navigate, { from, to }) }}
            minHeight={420}
          >
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" }, gap: 1, mb: 1.5 }}>
              {crowdsPending ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={52} sx={{ borderRadius: "8px" }} />)
              ) : (
                <>
                  <SummaryChip label="Alerts" value={(crowdsQ.data?.total ?? 0).toLocaleString()} />
                  <SummaryChip
                    label="Most frequent"
                    value={
                      leadingAlertType
                        ? `${CROWD_ALERT_TYPE_META[leadingAlertType.type].shortLabel} (${leadingAlertType.count})`
                        : "—"
                    }
                  />
                  <SummaryChip label="Peak alert hour" value={dangerHourLabel} />
                </>
              )}
            </Box>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, mb: 0.75 }}>Alert frequency by type</Typography>
            {crowdsPending ? (
              <Skeleton variant="rounded" height={160} />
            ) : hasCrowdData ? (
              <AlertTypeStackedChart
                data={crowdAlertTrend}
                variant="area"
                height={160}
                timeScale={crowdsQ.data?.timelineMode === "hourly" ? "hour" : "day"}
                hourContextYmd={crowdsQ.data?.timelineMode === "hourly" && from === to ? from : undefined}
                emptyLabel="No alerts for this period"
              />
            ) : (
              <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, py: 4, textAlign: "center" }}>
                No alerts for this period
              </Typography>
            )}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: gridCols(2) }, gap: 1.5, mt: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, mb: 0.75 }}>Alert clock</Typography>
                {crowdsPending ? (
                  <Skeleton variant="rounded" height={170} />
                ) : (
                  <AlertClockChart slots={crowdsQ.data?.byHourOfDay ?? []} size={190} />
                )}
              </Box>
              <Box>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, mb: 0.75 }}>Latest alerts</Typography>
                {latestAlertsQ.isPending && !latestAlertsQ.data ? (
                  <Skeleton variant="rounded" height={170} />
                ) : latestAlertsQ.data?.rows?.length ? (
                  <Stack spacing={0}>
                    {latestAlertsQ.data.rows.map((row, i, arr) => {
                      const tone = crowdAlertTypeColor(row.alert_type);
                      return (
                        <Box
                          key={row.id}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            py: 0.9,
                            borderBottom: i < arr.length - 1 ? "1px solid rgba(15,23,42,0.06)" : "none",
                          }}
                        >
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              bgcolor: tone.color,
                              flexShrink: 0,
                            }}
                          />
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: pnp.text }} noWrap>
                              {crowdAlertTypeLabel(row.alert_type)}
                            </Typography>
                            {/* One monitored area, so the zone name is the same on every
                                row — the alert description is the useful second line. */}
                            <Typography sx={{ fontSize: "0.6875rem", color: pnp.textSecondary }} noWrap>
                              {SHOW_ALERT_ZONE
                                ? resolveCrowdZoneName(row.camera_id) || row.camera_id
                                : crowdAlertTypeDescription(row.alert_type)}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: pnp.textMuted, flexShrink: 0 }}>
                            {formatPeopleReportDisplayTime(row.trigger_date)}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                ) : (
                  <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, py: 3, textAlign: "center" }}>—</Typography>
                )}
              </Box>
            </Box>
          </DashboardPanel>
        </Box>
      </Box>
    </Box>
  );
}
