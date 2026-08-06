import { Box, useTheme } from "@mui/material";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrafficPoint } from "./TrafficAreaChart";
import { formatChartHourTick } from "../../lib/siteTimeZone";
import {
  WATERFLOW_THRESHOLDS,
  waterflowThresholdMax,
  type WaterflowThresholdTier,
} from "../../lib/waterflowThresholds";

function tickIndices(len: number, maxTicks: number): number[] {
  if (len <= 0) return [];
  if (len === 1) return [0];
  const cap = Math.min(maxTicks, len);
  const step = Math.max(1, Math.ceil((len - 1) / (cap - 1)));
  const idx = new Set<number>();
  for (let i = 0; i < len; i += step) idx.add(i);
  idx.add(len - 1);
  return [...idx].sort((a, b) => a - b);
}

type Props = {
  data: TrafficPoint[];
  thresholds?: WaterflowThresholdTier[];
  height?: number;
  hourContextYmd?: string;
  id?: string;
};

export function WaterflowThroughputChart({
  data,
  thresholds = WATERFLOW_THRESHOLDS,
  height = 220,
  hourContextYmd,
  id = "waterflow",
}: Props) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const tickIdx = tickIndices(data.length, 8);
  const xTicks = tickIdx.map((i) => data[i]?.name).filter(Boolean) as string[];
  const tierMax = waterflowThresholdMax(thresholds);
  const yMax = Math.max(tierMax, ...data.map((p) => p.total), 1);

  if (!data.length) {
    return (
      <Box
        sx={{
          height,
          display: "grid",
          placeItems: "center",
          color: "text.secondary",
          fontWeight: 700,
          borderRadius: 2,
          bgcolor: "rgba(2,6,23,0.03)",
        }}
      >
        No hourly data for this window
      </Box>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 56, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary} stopOpacity={0.3} />
              <stop offset="100%" stopColor={primary} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis
            dataKey="name"
            type="category"
            ticks={xTicks}
            tickFormatter={(v) => formatChartHourTick(String(v), hourContextYmd)}
            tick={{ fontSize: 10, fill: theme.palette.text.secondary, fontWeight: 700 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
            height={36}
          />
          <YAxis
            domain={[0, yMax]}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: theme.palette.text.secondary, fontWeight: 700 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ stroke: primary, strokeWidth: 1, strokeOpacity: 0.35 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.[0]) return null;
              const row = payload[0].payload as TrafficPoint;
              const reads = Number(row.total ?? 0);
              return (
                <Box
                  sx={{
                    bgcolor: "background.paper",
                    border: "1px solid rgba(15,23,42,0.1)",
                    borderRadius: 1.5,
                    px: 1.25,
                    py: 0.75,
                    fontSize: 12,
                    fontWeight: 800,
                    boxShadow: "0 8px 24px rgba(2,6,23,0.12)",
                  }}
                >
                  <Box sx={{ fontWeight: 900, color: "text.secondary", fontSize: 11, mb: 0.35 }}>
                    {formatChartHourTick(String(label ?? ""), hourContextYmd)}
                    {row.partial ? " · In progress" : ""}
                  </Box>
                  <Box sx={{ color: "text.primary" }}>{reads.toLocaleString()} events</Box>
                </Box>
              );
            }}
          />
          {thresholds.map((tier) => (
            <ReferenceLine
              key={tier.key}
              y={tier.value}
              stroke={tier.color}
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{
                value: tier.label,
                position: "right",
                fill: tier.color,
                fontSize: 10,
                fontWeight: 800,
              }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="total"
            stroke={primary}
            strokeWidth={2.5}
            fill={`url(#${id}-fill)`}
            dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
