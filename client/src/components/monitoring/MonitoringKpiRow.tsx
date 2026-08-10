import type { ReactNode } from "react";
import { Box, Grid, Paper, Skeleton, Typography } from "@mui/material";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import VideocamRounded from "@mui/icons-material/VideocamRounded";
import TimerOutlined from "@mui/icons-material/TimerOutlined";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import { contentCardSx } from "../../lib/uiSurfaces";
import { tintOf } from "./monitoringTokens";
import type { InferenceModule } from "../../lib/inferenceModules";
import { KpiDelta } from "../KpiDelta";
import { buildDelta, rangeLabel, type RangeDelta } from "../../lib/rangeCompare";

export type ModuleKpis = {
  total: number;
  cameras: number;
  latest: string | null;
  longestSeconds: number | null;
  avgSeconds: number | null;
  avgConfidence: number | null;
  peakHour: number | null;
  peakHourCount: number;
  avgPerHour: number | null;
};

const SITE_TZ = "Asia/Kolkata";

function fmtDur(s: number | null) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
}
function fmtHour(h: number | null) {
  return h == null ? "—" : `${String(h).padStart(2, "0")}:00`;
}
function fmtWhen(ts: string | null | undefined) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", {
    timeZone: SITE_TZ, day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

/**
 * Signed duration difference, phrased the way the tile reads: "+ 1m 12s".
 *
 * A percentage would be the wrong unit here - "average dwell up 19%" is far
 * harder to act on than "up 1m 12s" - so this carries no pct and the arrow plus
 * colour do the direction.
 */
function durationDelta(current: number | null, previous: number | null, suffix: string): RangeDelta {
  if (current == null || previous == null) {
    return { pct: null, label: "no comparison available", direction: "none" };
  }
  const diff = Math.round(current - previous);
  if (diff === 0) return { pct: null, label: `no change ${suffix}`, direction: "flat" };
  return {
    pct: null,
    label: `${diff > 0 ? "+" : "−"} ${fmtDur(Math.abs(diff))} ${suffix}`,
    direction: diff > 0 ? "up" : "down",
  };
}

type Tile = {
  label: string;
  value: string | number;
  icon: ReactNode;
  hint?: string;
  delta?: RangeDelta;
  /** Per-day series for the sparkline. Omitted where no real series exists. */
  spark?: { n: number }[];
  onClick?: () => void;
};

/**
 * KPI row for a Monitoring page.
 *
 * Every module shows exactly four tiles, so the row is one clean band of the
 * same height and rhythm on all five pages. The middle pair is chosen from the
 * module's declared capabilities: "Longest / Average duration" where a duration
 * exists, "Peak hour / Average per hour" where it does not.
 *
 * Every figure comes from GET /inference/kpis/:module, which applies the same
 * false-positive suppression as the table below - so a thumbs-down moves the
 * tile and the table together.
 *
 * Sparklines are drawn ONLY where a genuine per-day series exists, which today
 * is the event count. The analytics endpoint returns daily totals, not daily
 * averages, so a duration tile has nothing real to plot - and a decorative
 * squiggle on a card of measured numbers reads as data. Those tiles keep their
 * hint instead.
 */
export function MonitoringKpiRow({
  module, kpis, previousKpis, dailySeries, from, to, loading, onDrill,
}: {
  module: InferenceModule;
  kpis?: ModuleKpis;
  previousKpis?: ModuleKpis;
  /** byDay from the module analytics, used for the count tile's sparkline. */
  dailySeries?: { n: number }[];
  from?: string;
  to?: string;
  loading?: boolean;
  onDrill?: () => void;
}) {
  const caps = module.capabilities;
  const k = kpis;
  const hue = module.colour;
  // With no range set the page is showing all time, so there is no preceding
  // period to compare against - the tile falls back to naming the range.
  const comparable = Boolean(from && to);
  const comparisonSuffix = comparable ? buildDelta(1, 1, from!, to!).label : "";

  const tiles: Tile[] = [
    {
      label: `Total ${module.label.toLowerCase()} events`,
      value: k?.total ?? 0,
      icon: <GroupsRounded />,
      spark: dailySeries,
      ...(comparable
        ? { delta: buildDelta(k?.total, previousKpis?.total, from!, to!) }
        : { hint: rangeLabel(from || "", to || "") }),
      onClick: onDrill,
    },
    {
      label: "Active cameras",
      value: k?.cameras ?? 0,
      icon: <VideocamRounded />,
      hint: "Reporting this module",
    },
    ...(caps.duration
      ? [
          {
            label: "Longest duration",
            value: fmtDur(k?.longestSeconds ?? null),
            icon: <TimerOutlined />,
            hint: fmtWhen(k?.latest) ? `Latest ${fmtWhen(k?.latest)}` : undefined,
          },
          {
            label: "Average duration",
            value: fmtDur(k?.avgSeconds ?? null),
            icon: <ScheduleRounded />,
            ...(comparable
              ? { delta: durationDelta(k?.avgSeconds ?? null, previousKpis?.avgSeconds ?? null, comparisonSuffix) }
              : {}),
          },
        ]
      : [
          {
            label: "Peak hour",
            value: fmtHour(k?.peakHour ?? null),
            icon: <ScheduleRounded />,
            hint: k ? `${k.peakHourCount} events` : undefined,
          },
          {
            label: "Average per hour",
            value: k?.avgPerHour ?? "—",
            icon: <TrendingUpRounded />,
          },
        ]),
  ];

  return (
    <Grid container spacing={1.5}>
      {tiles.map((t) => (
        <Grid key={t.label} size={{ xs: 12, sm: 6, lg: 3 }}>
          <Paper
            onClick={t.onClick}
            sx={{
              ...contentCardSx, p: 2, height: "100%",
              display: "flex", alignItems: "flex-start", gap: 1.5,
              cursor: t.onClick ? "pointer" : "default",
              transition: "box-shadow 160ms ease",
              ...(t.onClick ? { "&:hover": { boxShadow: "0 2px 10px rgba(15,23,42,.10)" } } : {}),
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 42, height: 42, flexShrink: 0, borderRadius: "50%",
                display: "grid", placeItems: "center",
                bgcolor: tintOf(hue, 0.14), color: hue,
                "& .MuiSvgIcon-root": { fontSize: 22 },
              }}
            >
              {t.icon}
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                {t.label}
              </Typography>
              {loading ? (
                <Skeleton width="60%" height={32} />
              ) : (
                <Typography sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.2 }} noWrap>
                  {typeof t.value === "number" ? t.value.toLocaleString() : t.value}
                </Typography>
              )}
              {!loading && t.delta ? <KpiDelta delta={t.delta} /> : null}
              {!loading && !t.delta && t.hint ? (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  {t.hint}
                </Typography>
              ) : null}
            </Box>

            {!loading && t.spark && t.spark.length > 1 ? (
              <Box sx={{ width: 76, height: 40, flexShrink: 0, alignSelf: "center" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={t.spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`spark-${module.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={hue} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={hue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone" dataKey="n" stroke={hue} strokeWidth={1.8}
                      fill={`url(#spark-${module.key})`} dot={false} isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            ) : null}
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}
