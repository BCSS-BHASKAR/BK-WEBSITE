import { useMemo } from "react";
import { Box, Grid, Paper, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { contentCardSx } from "../../lib/uiSurfaces";
import type { InferenceModule } from "../../lib/inferenceModules";

// Recessive grid/axis ink; text never wears the series colour.
const INK = "rgba(0,0,0,.45)";
const GRID = "rgba(0,0,0,.08)";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ModuleAnalytics = {
  byDay: { day: string; n: number }[];
  byHour: { hour: number; n: number }[];
  byCamera: { camera_key: string; n: number; latest: string }[];
  byWeekday: { weekday: number; n: number }[];
  heatmap: { weekday: number; hour: number; n: number }[];
};

function Panel({ title, subtitle, height = 180, children }: {
  title: string; subtitle?: string; height?: number; children: React.ReactNode;
}) {
  return (
    <Paper sx={{ ...contentCardSx, height: "100%" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {subtitle}
        </Typography>
      )}
      <Box sx={{ height, mt: 1 }}>{children}</Box>
    </Paper>
  );
}

/**
 * Per-module analytics.
 *
 * Every panel is SINGLE-SERIES and painted in that module's own hue, so no
 * legend is needed (the panel title names the series) and no two hues ever
 * compete inside one chart.
 *
 * There is deliberately no day x hour heatmap. With a few days of history it is
 * a mostly-empty grid, and the hourly and weekday panels answer the same
 * question directly. The API still returns `heatmap`; nothing here reads it.
 */
export function MonitoringAnalytics({
  module, data, loading,
}: { module: InferenceModule; data?: ModuleAnalytics; loading?: boolean }) {
  const hue = module.colour;

  const hourly = useMemo(() => {
    const m = new Map((data?.byHour || []).map((r) => [Number(r.hour), Number(r.n)]));
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, n: m.get(h) || 0 }));
  }, [data]);

  const weekly = useMemo(() => {
    const m = new Map((data?.byWeekday || []).map((r) => [Number(r.weekday), Number(r.n)]));
    return WEEKDAYS.map((label, i) => ({ label, n: m.get(i) || 0 }));
  }, [data]);

  const daily = useMemo(
    () => (data?.byDay || []).map((r) => ({
      day: r.day,
      label: new Date(r.day).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" }),
      n: Number(r.n),
    })),
    [data]
  );

  const cameras = useMemo(
    () => (data?.byCamera || []).slice().sort((a, b) => Number(b.n) - Number(a.n)),
    [data]
  );

  if (loading) {
    return (
      <Grid container spacing={1.5}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 12, md: 6 }}>
            <Paper sx={{ ...contentCardSx }}><Skeleton height={200} /></Paper>
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Grid container spacing={1.5}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Panel title="Daily trend" subtitle="Detections per day">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`ga-${module.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={hue} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={hue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
              <RTooltip formatter={(v) => [Number(v ?? 0), module.label] as [number, string]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="n" stroke={hue} strokeWidth={2} fill={`url(#ga-${module.key})`} dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Panel title="Hourly distribution" subtitle="By hour of day (site time, IST)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false}
                     interval={1} tickFormatter={(h) => String(h).padStart(2, "0")} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
              <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                        labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                        formatter={(v) => [Number(v ?? 0), "events"] as [number, string]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="n" fill={hue} radius={[4, 4, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Panel title="Weekly pattern" subtitle="Detections by day of week">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
              <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                        formatter={(v) => [Number(v ?? 0), "events"] as [number, string]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="n" fill={hue} radius={[4, 4, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Panel title="Camera distribution" subtitle="Which cameras see this most" height={180}>
          <Box sx={{ height: "100%", overflowY: "auto", pr: 0.5 }}>
            {cameras.length === 0 && (
              <Typography variant="body2" color="text.secondary">No camera activity in range.</Typography>
            )}
            {cameras.map((c) => {
              const pct = Math.max(2, (Number(c.n) / Number(cameras[0].n || 1)) * 100);
              return (
                <Box key={c.camera_key} sx={{ mb: 1 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Tooltip title={c.camera_key}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: "70%" }}>
                        {c.camera_key.trim()}
                      </Typography>
                    </Tooltip>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.n}</Typography>
                  </Stack>
                  <Box sx={{ height: 6, bgcolor: "rgba(0,0,0,.06)", borderRadius: 3, overflow: "hidden" }}>
                    <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: hue, borderRadius: 3 }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Panel>
      </Grid>

    </Grid>
  );
}
