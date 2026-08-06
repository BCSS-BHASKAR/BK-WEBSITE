import { Box, useTheme } from "@mui/material";
import type { MouseHandlerDataParam } from "recharts";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChartDayTick, formatChartHourTick } from "../../lib/siteTimeZone";

export type TrafficPoint = {
  name: string;
  total: number;
  partial?: boolean;

  drillDay?: string;

  hourStartUnix?: number;
};

type MergedPoint = TrafficPoint & { violations?: number };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function inferTimeScale(data: TrafficPoint[]): "day" | "hour" {
  if (!data.length) return "day";
  return data.every((p) => ISO_DAY.test(p.name)) ? "day" : "hour";
}

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

export function TrafficAreaChart({
  data,
  violations,
  height = 220,
  id = "traffic",
  onBucketClick,

  timeScale = "auto",

  hourContextYmd,
}: {
  data: TrafficPoint[];
  violations?: TrafficPoint[];
  height?: number;
  id?: string;
  onBucketClick?: (point: TrafficPoint) => void;
  timeScale?: "day" | "hour" | "auto";
  hourContextYmd?: string;
}) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  const violationColor = "#D97706";
  const scale = timeScale === "auto" ? inferTimeScale(data) : timeScale;
  const maxTicks = scale === "hour" ? 8 : 10;
  const hasViolations = Array.isArray(violations) && violations.length > 0;
  const violationMap = hasViolations
    ? new Map(violations!.map((v) => [v.name, Number(v.total || 0)]))
    : null;
  const mergedData: MergedPoint[] = data.map((p) =>
    violationMap ? { ...p, violations: violationMap.get(p.name) ?? 0 } : p
  );
  const tickIdx = tickIndices(mergedData.length, maxTicks);
  const xTicks = tickIdx.map((i) => mergedData[i].name);
  const denseDayAxis = scale === "day" && mergedData.length > 8;
  const xAxisHeight = scale === "hour" ? 36 : denseDayAxis ? 56 : 40;
  const bottomMargin = scale === "hour" ? 4 : denseDayAxis ? 8 : 6;
  const totalViolations = hasViolations
    ? violations!.reduce((acc, v) => acc + Number(v.total || 0), 0)
    : 0;
  const violationRightAxis = hasViolations && totalViolations > 0;

  const formatTick = (value: string) =>
    scale === "day" ? formatChartDayTick(value) : formatChartHourTick(value, hourContextYmd);

  const formatTooltipLabel = (label: unknown) => {
    const s = String(label ?? "");
    return scale === "day" ? formatChartDayTick(s) : formatChartHourTick(s, hourContextYmd);
  };

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
        No detections in this interval
      </Box>
    );
  }

  const handleChartClick = (state: MouseHandlerDataParam) => {
    if (!onBucketClick) return;
    const idxRaw = state.activeTooltipIndex ?? state.activeIndex;
    const idx = typeof idxRaw === "number" ? idxRaw : Number(idxRaw);
    let pt: TrafficPoint | undefined;
    if (Number.isFinite(idx) && mergedData[idx as number]) {
      pt = mergedData[idx as number];
    } else if (state.activeLabel != null) {
      const label = String(state.activeLabel);
      pt = mergedData.find((d) => d.name === label);
    }
    if (pt) onBucketClick(pt);
  };

  return (
    <Box sx={{ position: "relative", cursor: onBucketClick ? "pointer" : "default" }}>
      {violationRightAxis ? (
        <Box
          sx={{
            position: "absolute",
            top: -22,
            right: 0,
            display: "flex",
            gap: 1.25,
            alignItems: "center",
            fontSize: 11,
            fontWeight: 800,
            color: "text.secondary",
            zIndex: 1,
          }}
        >
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: primary }} />
            Reads
          </Box>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: violationColor }} />
            Violations
          </Box>
        </Box>
      ) : null}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={mergedData}
          margin={{ top: 8, right: violationRightAxis ? 40 : 12, left: 0, bottom: bottomMargin }}
          onClick={onBucketClick ? handleChartClick : undefined}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={secondary} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis
            dataKey="name"
            type="category"
            ticks={xTicks}
            tickFormatter={formatTick}
            tick={{
              fontSize: scale === "hour" ? 10 : 11,
              fill: theme.palette.text.secondary,
              fontWeight: 700,
              ...(denseDayAxis
                ? { angle: -32, textAnchor: "end", dy: 6 }
                : { angle: 0, textAnchor: "middle" }),
            }}
            tickLine={false}
            axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
            padding={{ left: 4, right: 8 }}
            height={xAxisHeight}
          />
          <YAxis
            yAxisId="reads"
            tick={{ fontSize: 11, fill: theme.palette.text.secondary, fontWeight: 700 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          {violationRightAxis ? (
            <YAxis
              yAxisId="violations"
              orientation="right"
              tick={{ fontSize: 11, fill: violationColor, fontWeight: 800 }}
              tickLine={false}
              axisLine={false}
              width={32}
              allowDecimals={false}
            />
          ) : null}
          <Tooltip
            cursor={{ stroke: primary, strokeWidth: 1, strokeOpacity: 0.35 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.[0]) return null;
              const row = payload[0].payload as MergedPoint;
              const reads = Number(row.total ?? 0);
              const viol = Number(row.violations ?? 0);
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
                    {formatTooltipLabel(label)}
                    {row.partial ? " · In Progress" : ""}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.primary" }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: primary }} />
                    {reads.toLocaleString()} reads
                  </Box>
                  {violationRightAxis ? (
                    <Box sx={{ mt: 0.25, display: "flex", alignItems: "center", gap: 0.75, color: violationColor }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: violationColor }} />
                      {viol.toLocaleString()} violations
                    </Box>
                  ) : null}
                </Box>
              );
            }}
          />
          <Area
            yAxisId="reads"
            type="monotone"
            dataKey="total"
            name="Reads"
            stroke={primary}
            strokeWidth={2.5}
            fill={`url(#${id}-fill)`}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, fill: secondary, style: { cursor: onBucketClick ? "pointer" : undefined } }}
            isAnimationActive={false}
          />
          {violationRightAxis ? (
            <Bar
              yAxisId="violations"
              dataKey="violations"
              name="Violations"
              fill={violationColor}
              fillOpacity={0.72}
              radius={[3, 3, 0, 0]}
              maxBarSize={14}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
}
