import { Box, Typography } from "@mui/material";
import BarChartRounded from "@mui/icons-material/BarChartRounded";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { bk, bkCardSx, bkPanelTitleSx } from "./bkTokens";

export type TrendGrain = "day" | "week" | "month";

export type TrendPoint = {
  /** Axis tick, already localised - "7 AM" for the day view, "08 Aug" otherwise. */
  label: string;
  n: number;
};

const GRAINS: { key: TrendGrain; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

/** 1.5K rather than 1500 on the value axis, matching the design. */
function compact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(n);
}

/**
 * Six gridlines on a round step, which is what gives the design its
 * 0 / 300 / 600 / 900 / 1.2K / 1.5K scale.
 *
 * Recharts' own tick picker optimises for fitting the data, so a peak of 1,255
 * comes out as 0 / 350 / 700 / 1.1K / 1.4K - correct, but it puts the series
 * against an axis whose steps nobody would choose to read. The step is snapped
 * up to a round multiple instead, so the top gridline always sits above the
 * peak and the intervals stay mentally divisible.
 */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const TICK_COUNT = 5;

function axisTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  let step = (NICE_STEPS.find((s) => normalised <= s) ?? 10) * magnitude;
  // Walk-ins are whole people. On a quiet day - a peak of 6 puts the ideal step
  // at 1.2, which snaps to 1.5 - the fractional step would label the axis
  // 0 / 1.5 / 3 / 4.5, so it is rounded up to the next whole number. Above 10
  // every candidate step is already an integer and this is a no-op.
  if (!Number.isInteger(step)) step = Math.ceil(step);
  return Array.from({ length: TICK_COUNT + 1 }, (_, i) => Math.round(step * i));
}

function TrendTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        bgcolor: bk.card,
        border: `1px solid ${bk.line}`,
        borderRadius: `${bk.radiusSm}px`,
        boxShadow: "0 4px 18px rgba(22,53,28,.14)",
        px: 1.5,
        py: 1,
      }}
    >
      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: bk.ink, lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: bk.muted, lineHeight: 1.4 }}>
        Walk-ins: {Number(payload[0]?.value ?? 0).toLocaleString()}
      </Typography>
    </Box>
  );
}

type Props = {
  grain: TrendGrain;
  onGrainChange: (g: TrendGrain) => void;
  points: TrendPoint[];
  /**
   * Points to skip between x labels. The design labels the day view every third
   * hour; left undefined the axis thins itself to whatever fits.
   */
  xTickInterval?: number;
  /** True while the series for this grain is in flight. */
  loading?: boolean;
};

export function BkWalkinsTrend({ grain, onGrainChange, points, xTickInterval, loading }: Props) {
  const hasData = points.some((p) => p.n > 0);
  const ticks = axisTicks(Math.max(...points.map((p) => p.n), 0));

  return (
    <Box sx={{ ...bkCardSx, p: 2, display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <BarChartRounded sx={{ fontSize: 20, color: bk.green }} />
          <Typography sx={bkPanelTitleSx}>Walk-ins Trend</Typography>
        </Box>

        {/* Segmented control: one track, the active segment filled deep green. */}
        <Box
          role="group"
          aria-label="Trend granularity"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            p: 0.375,
            borderRadius: "999px",
            bgcolor: "rgba(23, 59, 33, 0.05)",
            flexShrink: 0,
          }}
        >
          {GRAINS.map((g) => {
            const active = g.key === grain;
            return (
              <Box
                key={g.key}
                component="button"
                type="button"
                aria-pressed={active}
                onClick={() => onGrainChange(g.key)}
                sx={{
                  border: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  px: 1.75,
                  py: 0.625,
                  borderRadius: "999px",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: active ? "#FFFFFF" : bk.muted,
                  bgcolor: active ? bk.greenDeep : "transparent",
                  transition: "background-color 160ms ease, color 160ms ease",
                  "&:hover": { color: active ? "#FFFFFF" : bk.ink },
                  "&:focus-visible": { outline: `2px solid ${bk.green}`, outlineOffset: 1 },
                }}
              >
                {g.label}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 232, position: "relative" }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            {/* The right margin is the width of half the last x label - without
                it "10 PM" is clipped by the plot edge. */}
            <AreaChart data={points} margin={{ top: 8, right: 22, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="bkWalkinsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={bk.greenBright} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={bk.greenBright} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(23,59,33,.08)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: bk.muted }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                interval={xTickInterval ?? "preserveStartEnd"}
                minTickGap={24}
              />
              <YAxis
                width={44}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: bk.muted }}
                axisLine={false}
                tickLine={false}
                ticks={ticks}
                domain={[0, ticks[ticks.length - 1]]}
                tickFormatter={(v) => compact(Number(v))}
              />
              <Tooltip
                content={<TrendTooltip />}
                cursor={{ stroke: "rgba(23,59,33,.18)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="n"
                stroke={bk.greenBright}
                strokeWidth={2.5}
                fill="url(#bkWalkinsFill)"
                // Small solid dots on every reading, as in the design, with a
                // larger ring on hover.
                dot={{ r: 3, fill: bk.greenBright, stroke: bk.card, strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: bk.greenBright, stroke: bk.card, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          // An axis drawn over an all-zero series reads as a measured flat line,
          // which is a different claim from "nothing was recorded".
          <Box
            sx={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              border: `1px dashed ${bk.line}`,
              borderRadius: `${bk.radiusSm}px`,
            }}
          >
            <Typography sx={{ fontSize: "0.8125rem", color: bk.faint, fontWeight: 600 }}>
              {loading ? "Loading walk-ins…" : "No walk-ins recorded in this period"}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
