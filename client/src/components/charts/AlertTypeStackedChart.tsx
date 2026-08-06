import { Box, useTheme } from "@mui/material";
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
import { CROWD_ALERT_TYPES, CROWD_ALERT_TYPE_META, type CrowdAlertType } from "../../lib/crowdAlertTypes";

export type AlertTypeStackedPoint = {
  name: string;
} & Record<CrowdAlertType, number>;

/**
 * Builds a chart point from an API `byAlertType` map, filling in any type the
 * response omits. Written against CROWD_ALERT_TYPES so adding a new alert type
 * needs no changes at the call sites.
 */
export function alertTypePoint(
  name: string,
  counts?: Partial<Record<CrowdAlertType, number>>
): AlertTypeStackedPoint {
  const point = { name } as AlertTypeStackedPoint;
  for (const type of CROWD_ALERT_TYPES) {
    point[type] = counts?.[type] ?? 0;
  }
  return point;
}

type Props = {
  data: AlertTypeStackedPoint[];
  variant?: "area" | "bar";
  height?: number;
  emptyLabel?: string;
  /** Only used by the "area" variant, which plots a time axis. */
  timeScale?: "day" | "hour";
  hourContextYmd?: string;
};

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

export function AlertTypeStackedChart({
  data,
  variant = "area",
  height = 220,
  emptyLabel = "No alerts in this interval",
  timeScale = "day",
  hourContextYmd,
}: Props) {
  const theme = useTheme();
  const isTimeAxis = variant === "area";

  // Drop series that are entirely zero so the legend and stack stay honest.
  const activeTypes = CROWD_ALERT_TYPES.filter((t) => data.some((d) => Number(d[t] || 0) > 0));
  const hasData = activeTypes.length > 0;

  const maxTicks = timeScale === "hour" ? 8 : 10;
  const tickIdx = tickIndices(data.length, maxTicks);
  const xTicks = isTimeAxis ? tickIdx.map((i) => data[i].name) : undefined;
  const denseDayAxis = isTimeAxis && timeScale === "day" && data.length > 8;

  const formatTick = (value: string) => {
    if (!isTimeAxis) return value;
    return timeScale === "day" ? formatChartDayTick(value) : formatChartHourTick(value, hourContextYmd);
  };

  if (!data.length || !hasData) {
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
          fontSize: "0.8125rem",
          px: 2,
          textAlign: "center",
        }}
      >
        {emptyLabel}
      </Box>
    );
  }

  return (
    <Box>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: denseDayAxis ? 8 : 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis
            dataKey="name"
            type="category"
            ticks={xTicks}
            tickFormatter={formatTick}
            tick={{
              fontSize: 11,
              fill: theme.palette.text.secondary,
              fontWeight: 700,
              ...(denseDayAxis ? { angle: -32, textAnchor: "end", dy: 6 } : { angle: 0, textAnchor: "middle" }),
            }}
            tickLine={false}
            axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
            padding={{ left: 4, right: 8 }}
            height={denseDayAxis ? 56 : 40}
          />
          <YAxis
            tick={{ fontSize: 11, fill: theme.palette.text.secondary, fontWeight: 700 }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as AlertTypeStackedPoint;
              const total = activeTypes.reduce((sum, t) => sum + Number(row[t] || 0), 0);
              return (
                <Box
                  sx={{
                    bgcolor: "background.paper",
                    border: "1px solid rgba(15,23,42,0.1)",
                    borderRadius: 1.5,
                    px: 1.25,
                    py: 0.85,
                    boxShadow: "0 8px 24px rgba(2,6,23,0.12)",
                    minWidth: 160,
                  }}
                >
                  <Box sx={{ fontWeight: 900, color: "text.secondary", fontSize: 11, mb: 0.5 }}>
                    {formatTick(String(label ?? ""))} · {total.toLocaleString()} alert{total === 1 ? "" : "s"}
                  </Box>
                  {activeTypes.map((t) => (
                    <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 12, fontWeight: 700 }}>
                      <Box
                        sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: CROWD_ALERT_TYPE_META[t].color, flexShrink: 0 }}
                      />
                      {CROWD_ALERT_TYPE_META[t].shortLabel}: {Number(row[t] || 0).toLocaleString()}
                    </Box>
                  ))}
                </Box>
              );
            }}
          />
          {activeTypes.map((t) =>
            variant === "area" ? (
              <Area
                key={t}
                type="monotone"
                dataKey={t}
                stackId="alerts"
                name={CROWD_ALERT_TYPE_META[t].shortLabel}
                stroke={CROWD_ALERT_TYPE_META[t].color}
                strokeWidth={2}
                fill={CROWD_ALERT_TYPE_META[t].color}
                fillOpacity={0.25}
                dot={false}
                isAnimationActive={false}
              />
            ) : (
              <Bar
                key={t}
                dataKey={t}
                stackId="alerts"
                name={CROWD_ALERT_TYPE_META[t].shortLabel}
                fill={CROWD_ALERT_TYPE_META[t].color}
                maxBarSize={48}
                isAnimationActive={false}
              />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, justifyContent: "center", pt: 0.75 }}>
        {activeTypes.map((t) => (
          <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: CROWD_ALERT_TYPE_META[t].color }} />
            <Box sx={{ fontSize: "0.6875rem", fontWeight: 800, color: "text.secondary" }}>
              {CROWD_ALERT_TYPE_META[t].shortLabel}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
