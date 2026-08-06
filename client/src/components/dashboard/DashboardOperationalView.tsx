import type { ReactNode } from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import PolicyIcon from "@mui/icons-material/Policy";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import VideocamIcon from "@mui/icons-material/Videocam";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import DirectionsWalkOutlinedIcon from "@mui/icons-material/DirectionsWalkOutlined";
import SoupKitchenOutlinedIcon from "@mui/icons-material/SoupKitchenOutlined";
import { DonutChart } from "../charts/DonutChart";
import { DashboardKpiTile } from "./DashboardKpiTile";
import { DashboardOpsMap } from "./DashboardOpsMap";
import { DashboardLiveCameras } from "./DashboardLiveCameras";
import { WaterflowThroughputPanel } from "./WaterflowThroughputPanel";
import { PeopleAnalyticsSection } from "./PeopleAnalyticsSection";
import { DashboardPanel } from "./DashboardPanel";
import type { HeatmapData } from "./DashboardHeatmap";
import { AdditionalAnalyticsSection } from "./AdditionalAnalyticsSection";
import { SITE_LABELS } from "../../i18n/lang";
import { pnp, pnpFont } from "../../lib/pnpTheme";
import { gridCols, pageLayoutSx, ui } from "../../lib/uiSurfaces";
import {
  VIOLATION_DASHBOARD_ORDER,
  VIOLATION_TYPE_META,
  violationTypeLabel,
} from "../../lib/violationTypes";
import { displayCameraName } from "../../lib/cameraDisplay";
import { formatDbNaiveInDisplay } from "../../lib/siteTimeZone";

type StreamRow = { id: string; name: string; online: boolean };
type TopPlate = { plate: string; total: number; last_seen?: string; last_camera?: string; last_camera_id?: string };
type WatchlistRow = { id: number; plate: string; camera: string; created_at: string; list_name: string };
type ViolationRow = { id: number; violationType: string; plate: string | null; cameraName: string; detectedAt: string };
type AttributeRow = { key: string; label: string; total: number };

export type DashboardOperationalProps = {
  error?: boolean;
  pending?: boolean;
  from: string;
  to: string;
  violations: number;
  violationsTrend?: string;
  reads: number;
  readsTrend?: string;
  watchlistHits: number;
  watchlistTrend?: string;
  watchlistFootnote?: string;
  activeWatchlists?: number;
  lastWatchlistHit?: string | null;
  camerasOnline: number;
  camerasTotal: number;
  cameraUptimePercent?: number;
  distinctPlatesTrend?: string;
  activityReadsTrend?: string;
  officersValue?: string;
  officersHint?: string;
  trafficViolationsByType: Record<string, number>;
  violationTotal: number;
  streams: StreamRow[];
  heatmap?: HeatmapData;
  heatmapPending?: boolean;
  topPlates: TopPlate[];
  topPlatesPending?: boolean;
  watchlistRows: WatchlistRow[];
  watchlistPending?: boolean;
  topViolationTypes: { type: string; count: number }[];
  attributes: AttributeRow[];
  totalReads: number;
  uniquePlates: number;
  topPlate?: { plate: string; reads: number; lastCamera: string } | null;
  busiestCamera?: { name: string; reads: number; id?: string | null };
  sparkTotals: number[];
  recentViolations: ViolationRow[];
  recentPending?: boolean;
  onOpenViolations: (type?: string, plate?: string) => void;
  onOpenVehicleReport: (opts?: { plate?: string; cameraId?: string }) => void;
  onOpenWatchlists?: () => void;
  onOpenLiveView: (streamId?: string) => void;
  onHeatmapCell?: (cameraId: string, hourIndex: number) => void;
  violationsByCamera?: { camera_id: string; name: string; total: number }[];
  spanDays: number;
  guestFootfall?: number;
  guestFootfallTrend?: string;
  occupancyAlerts?: number;
  peoplePending?: boolean;
  chefPresence?: number;
  chefPresenceTrend?: string;
  chefPresencePending?: boolean;
  onOpenWalkins?: () => void;
  onOpenCrowds?: () => void;
};

// Hospitality deployment: the traffic-enforcement and ANPR surfaces are hidden.
// All the markup below is left intact — flip this to false to restore them.
const HIDE_VEHICLE_MODULES: boolean = true;

const GRID = { display: "grid", gap: ui.gridGap, alignItems: "stretch" as const, minWidth: 0, width: "100%" };

function RankedList({
  items,
  pending,
  empty,
  numbered,
  plain,
}: {
  items: { key: string; primary: string; secondary?: string; badge?: ReactNode; onClick?: () => void }[];
  pending?: boolean;
  empty: string;
  numbered?: boolean;
  plain?: boolean;
}) {
  if (pending) {
    return (
      <Stack spacing={1}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={48} sx={{ borderRadius: "8px" }} />
        ))}
      </Stack>
    );
  }
  if (!items.length) {
    return (
      <Typography sx={{ ...pnpFont.cardSubtitle, py: 3, textAlign: "center" }}>{empty}</Typography>
    );
  }
  return (
    <Stack spacing={plain ? 1.1 : 0.75}>
      {items.map((it, i) => (
        <ButtonBase
          key={it.key}
          onClick={it.onClick}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            width: "100%",
            textAlign: "left",
            p: plain ? 0.5 : 1.25,
            borderRadius: plain ? 0 : "8px",
            border: plain ? "none" : "1px solid rgba(15, 23, 42, 0.06)",
            bgcolor: plain ? "transparent" : pnp.cardBg,
            borderBottom: plain && i < items.length - 1 ? "1px solid rgba(15,23,42,0.05)" : undefined,
            "&:hover": { bgcolor: plain ? "rgba(37,99,235,0.04)" : pnp.primarySoft },
          }}
        >
          {numbered ? (
            <Typography sx={{ width: 20, fontSize: "0.8125rem", fontWeight: 800, color: pnp.textMuted }}>{i + 1}</Typography>
          ) : null}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: plain ? 600 : 700, color: pnp.text }} noWrap>
              {it.primary}
            </Typography>
            {it.secondary ? (
              <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, mt: 0.2 }} noWrap>
                {it.secondary}
              </Typography>
            ) : null}
          </Box>
          {it.badge}
        </ButtonBase>
      ))}
    </Stack>
  );
}

export function DashboardOperationalView(props: DashboardOperationalProps) {
  const {
    error,
    pending,
    from,
    to,
    violations,
    violationsTrend,
    reads,
    readsTrend,
    watchlistHits,
    watchlistTrend,
    watchlistFootnote = "Matches against active watchlists",
    camerasOnline,
    camerasTotal,
    officersValue = "—",
    officersHint = "Across all units",
    trafficViolationsByType,
    violationTotal,
    streams,
    heatmap,
    heatmapPending,
    topPlates,
    topPlatesPending,
    watchlistRows,
    watchlistPending,
    topViolationTypes,
    attributes,
    totalReads,
    recentViolations,
    recentPending,
    onOpenViolations,
    onOpenVehicleReport,
    onOpenWatchlists,
    onOpenLiveView,
    onHeatmapCell,
    guestFootfall = 0,
    guestFootfallTrend,
    occupancyAlerts = 0,
    peoplePending,
    chefPresence = 0,
    chefPresenceTrend,
    chefPresencePending,
    onOpenWalkins,
    onOpenCrowds,
  } = props;

  const camPct = camerasTotal > 0 ? Math.round((camerasOnline / camerasTotal) * 100) : 0;

  const donutItems = [...VIOLATION_DASHBOARD_ORDER]
    .map((t) => ({ type: t, count: trafficViolationsByType[t] ?? 0, meta: VIOLATION_TYPE_META[t] }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((x, i) => ({
      label: x.meta.label,
      value: x.count,
      color: x.meta.color ?? ["#2563EB", "#7C3AED", "#EA580C", "#16A34A", "#DC2626", "#CA8A04"][i % 6],
    }));

  const vehicleClassRows = attributes.slice(0, 5);
  const vehicleTotal = vehicleClassRows.reduce((s, a) => s + a.total, 0) || totalReads || 1;
  const activeAlerts = watchlistRows.length;

  const timelineEvents = [
    ...recentViolations.map((r) => {
      const cam = displayCameraName(r.cameraName);
      return {
        id: `v-${r.id}`,
        time: r.detectedAt,
        label: violationTypeLabel(r.violationType),
        sub: r.plate ? `${r.plate} · ${cam}` : cam,
        color: pnp.danger,
        onClick: () => (r.plate ? onOpenVehicleReport({ plate: r.plate }) : onOpenViolations(r.violationType)),
      };
    }),
    ...watchlistRows.map((r) => ({
      id: `w-${r.id}`,
      time: r.created_at,
      label: "Watchlist hit",
      sub: `${r.plate} · ${r.list_name}`,
      color: pnp.purple,
      onClick: () => onOpenVehicleReport({ plate: r.plate }),
    })),
  ]
    .sort((a, b) => (a.time < b.time ? 1 : -1))
    .slice(0, 4);

  return (
    <Box sx={pageLayoutSx}>
      {error ? (
        <Alert severity="error" variant="outlined" sx={{ borderRadius: `${pnp.cardRadius}px` }}>
          {SITE_LABELS.analyticsUnavailable}
        </Alert>
      ) : null}

      {}
      <Box
        sx={{
          ...GRID,
          gridTemplateColumns: {
            xs: "1fr",
            sm: gridCols(2),
            md: HIDE_VEHICLE_MODULES ? gridCols(2) : gridCols(3),
            lg: HIDE_VEHICLE_MODULES ? gridCols(4) : gridCols(5),
          },
        }}
      >
        {HIDE_VEHICLE_MODULES ? (
          <>
            <DashboardKpiTile
              label="Walk-ins"
              value={guestFootfall.toLocaleString()}
              hint={guestFootfallTrend}
              footnote="Guest arrivals in selected period"
              icon={<DirectionsWalkOutlinedIcon />}
              accent={pnp.kpiBlue}
              iconBg={pnp.primarySoft}
              pending={peoplePending}
              onClick={onOpenWalkins}
            />
            <DashboardKpiTile
              label="Kitchen Unattended"
              value={chefPresence.toLocaleString()}
              hint={chefPresenceTrend}
              footnote="Times the kitchen was unattended"
              // The value counts failures, so the icon and accent match the
              // Unattended Kitchen alert type rather than reading as "all good".
              icon={<SoupKitchenOutlinedIcon />}
              accent={pnp.kpiOrange}
              iconBg={pnp.warningSoft}
              pending={chefPresencePending}
              onClick={onOpenWatchlists}
            />
            <DashboardKpiTile
              label="Active Alerts"
              value={occupancyAlerts.toLocaleString()}
              footnote="Security & kitchen staffing alerts"
              icon={<WarningAmberRoundedIcon />}
              accent={pnp.kpiRed}
              iconBg={pnp.dangerSoft}
              pending={peoplePending}
              onClick={onOpenCrowds}
            />
            <DashboardKpiTile
              label="Cameras Online"
              value={camerasTotal > 0 ? `${camerasOnline} / ${camerasTotal}` : "—"}
              hint={camerasTotal > 0 ? `${camPct}% operational` : undefined}
              footnote="All venue cameras online"
              icon={<VideocamIcon />}
              accent={camPct >= 95 ? pnp.kpiGreen : pnp.kpiRed}
              iconBg={camPct >= 95 ? pnp.successSoft : pnp.dangerSoft}
              pending={pending}
              onClick={() => onOpenLiveView()}
            />
          </>
        ) : (
          <>
            <DashboardKpiTile
              label="Traffic Violations"
              value={violations.toLocaleString()}
              hint={violationsTrend}
              footnote="Recorded in selected period"
              icon={<PolicyIcon />}
              accent={pnp.kpiBlue}
              iconBg={pnp.primarySoft}
              pending={pending}
              onClick={() => onOpenViolations()}
            />
            <DashboardKpiTile
              label="Plate Reads (ANPR)"
              value={reads.toLocaleString()}
              hint={readsTrend}
              footnote="Total detections in period"
              icon={<DirectionsCarFilledIcon />}
              accent={pnp.kpiBlue}
              iconBg={pnp.primarySoft}
              pending={pending}
              onClick={() => onOpenVehicleReport()}
            />
            <DashboardKpiTile
              label="Watchlist Hits"
              value={watchlistHits.toLocaleString()}
              hint={watchlistTrend}
              footnote={watchlistFootnote}
              icon={<WarningAmberRoundedIcon />}
              accent={pnp.kpiPurple}
              iconBg={pnp.purpleSoft}
              pending={pending}
              onClick={() => (onOpenWatchlists ? onOpenWatchlists() : onOpenVehicleReport())}
            />
            <DashboardKpiTile
              label="Officers Online"
              value={officersValue}
              hint={officersHint}
              footnote="Active personnel now"
              icon={<GroupsOutlinedIcon />}
              accent={pnp.kpiOrange}
              iconBg={pnp.warningSoft}
              pending={pending}
            />
            <DashboardKpiTile
              label="Cameras Online"
              value={camerasTotal > 0 ? `${camerasOnline} / ${camerasTotal}` : "—"}
              hint={camerasTotal > 0 ? `${camPct}% operational` : undefined}
              footnote="All checkpoint cameras online"
              icon={<VideocamIcon />}
              accent={camPct >= 95 ? pnp.kpiGreen : pnp.kpiRed}
              iconBg={camPct >= 95 ? pnp.successSoft : pnp.dangerSoft}
              pending={pending}
              onClick={() => onOpenLiveView()}
            />
          </>
        )}
      </Box>

      {}
      {/* Live camera tiles are dropped here — the Live View module already shows
          the streams, and the map/donut are enforcement-only. */}
      <Box
        sx={{
          ...GRID,
          gridTemplateColumns: {
            xs: "1fr",
            md: "1fr",
            lg: "minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr)",
          },
          display: HIDE_VEHICLE_MODULES ? "none" : "grid",
        }}
      >
        <DashboardOpsMap violationsByCamera={props.violationsByCamera} />
        <DashboardPanel
          title="Violation Breakdown"
          subtitle="Distribution by violation type"
          minHeight={320}
          footerLink={{ label: "View full analytics →", onClick: () => onOpenViolations() }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 260, minWidth: 0, width: "100%", overflow: "hidden" }}>
            {pending ? (
              <Skeleton variant="circular" width={150} height={150} />
            ) : violationTotal > 0 && donutItems.length ? (
              <DonutChart showLegend legendPosition="side" legendStyle="compact" size={150} items={donutItems} />
            ) : (
              <Typography sx={pnpFont.cardSubtitle}>{SITE_LABELS.noViolationsYet}</Typography>
            )}
          </Box>
        </DashboardPanel>
        <DashboardLiveCameras streams={streams} pending={pending} onSelect={(id) => onOpenLiveView(id)} onViewAll={() => onOpenLiveView()} />
      </Box>

      {}
      <Box
        sx={{
          ...GRID,
          gridTemplateColumns: { xs: "1fr", md: gridCols(2), lg: gridCols(4) },
          display: HIDE_VEHICLE_MODULES ? "none" : "grid",
        }}
      >
        <DashboardPanel
          title="Top Violations (This Month)"
          minHeight={260}
          footerLink={{ label: "View all violations →", onClick: () => onOpenViolations() }}
        >
          <RankedList
            plain
            numbered
            empty="No violations this month"
            items={topViolationTypes.slice(0, 5).map((t) => ({
              key: t.type,
              primary: `${violationTypeLabel(t.type)} (${t.count.toLocaleString()})`,
              onClick: () => onOpenViolations(t.type),
            }))}
          />
        </DashboardPanel>

        <DashboardPanel
          title="Wanted Vehicle Alerts"
          minHeight={260}
          footerLink={{ label: "View watchlist →", onClick: () => (onOpenWatchlists ? onOpenWatchlists() : onOpenVehicleReport()) }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5, p: 1.25, borderRadius: "8px", bgcolor: pnp.dangerSoft, border: `1px solid rgba(220,38,38,0.15)` }}>
            <ShieldOutlinedIcon sx={{ color: pnp.danger, fontSize: 28 }} />
            <Box>
              <Typography sx={{ fontSize: "1.125rem", fontWeight: 800, color: pnp.danger, lineHeight: 1.1 }}>
                {activeAlerts} Active alert{activeAlerts === 1 ? "" : "s"}
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }}>High-priority watchlist</Typography>
            </Box>
          </Box>
          <RankedList
            plain
            pending={watchlistPending}
            empty="No active alerts"
            items={watchlistRows.slice(0, 5).map((r) => ({
              key: `wa-${r.id}`,
              primary: r.plate,
              secondary: r.list_name,
              badge: (
                <Chip label={r.list_name} size="small" sx={{ height: 22, fontWeight: 800, fontSize: "0.5625rem", bgcolor: pnp.dangerSoft, color: "#B91C1C" }} />
              ),
              onClick: () => onOpenVehicleReport({ plate: r.plate }),
            }))}
          />
        </DashboardPanel>

        <DashboardPanel
          title="Vehicle Classification"
          subtitle="Reads by vehicle class"
          minHeight={260}
          footerLink={{ label: "View full report →", onClick: () => onOpenVehicleReport() }}
        >
          <Stack spacing={1.25}>
            {vehicleClassRows.map((a) => {
              const pct = Math.round((a.total / vehicleTotal) * 100);
              return (
                <Box key={a.key}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{a.label}</Typography>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: pnp.textSecondary }}>
                      {a.total.toLocaleString()} · {pct}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: "rgba(15,23,42,0.06)",
                      "& .MuiLinearProgress-bar": {
                        borderRadius: 3,
                        bgcolor: [pnp.primary, pnp.purple, pnp.warning, pnp.success, pnp.kpiOrange][vehicleClassRows.indexOf(a) % 5],
                      },
                    }}
                  />
                </Box>
              );
            })}
            {!vehicleClassRows.length && !pending ? (
              <Typography sx={{ ...pnpFont.cardSubtitle, py: 2, textAlign: "center" }}>No classification data</Typography>
            ) : null}
          </Stack>
        </DashboardPanel>

        <DashboardPanel
          title="Activity Timeline"
          subtitle="Latest events"
          minHeight={260}
          footerLink={{ label: "View all activity →", onClick: () => onOpenVehicleReport() }}
        >
          {recentPending ? (
            <Stack spacing={1}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={52} />)}</Stack>
          ) : timelineEvents.length ? (
            <Stack spacing={0}>
              {timelineEvents.map((ev, i) => (
                <ButtonBase
                  key={ev.id}
                  onClick={ev.onClick}
                  sx={{
                    display: "flex",
                    gap: 1.25,
                    width: "100%",
                    textAlign: "left",
                    py: 1.15,
                    borderBottom: i < timelineEvents.length - 1 ? "1px solid rgba(15,23,42,0.06)" : "none",
                  }}
                >
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: ev.color, mt: 0.6, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{ev.label}</Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }} noWrap>
                      {ev.sub}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: pnp.textMuted, flexShrink: 0 }}>
                    {formatDbNaiveInDisplay(ev.time, "h:mm A")}
                  </Typography>
                </ButtonBase>
              ))}
            </Stack>
          ) : (
            <Typography sx={{ ...pnpFont.cardSubtitle, py: 3, textAlign: "center" }}>No recent activity</Typography>
          )}
        </DashboardPanel>
      </Box>

      {HIDE_VEHICLE_MODULES ? null : <WaterflowThroughputPanel />}

      <PeopleAnalyticsSection from={from} to={to} spanDays={props.spanDays} />

      {HIDE_VEHICLE_MODULES ? null : (
        <AdditionalAnalyticsSection
          heatmap={heatmap}
          heatmapPending={heatmapPending}
          reportFrom={from}
          reportTo={to}
          topPlates={topPlates}
          topPlatesPending={topPlatesPending}
          onHeatmapCell={onHeatmapCell}
          onOpenVehicleReport={onOpenVehicleReport}
        />
      )}
    </Box>
  );
}

