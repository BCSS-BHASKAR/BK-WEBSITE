import { useMemo } from "react";
import { Box, Grid, Paper, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { contentCardSx } from "../../lib/uiSurfaces";
import type { InferenceModule } from "../../lib/inferenceModules";

// Recessive grid/axis ink; text never wears the series colour.
const INK = "rgba(0,0,0,.45)";
const GRID = "rgba(0,0,0,.08)";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Donut slice hues.
 *
 * A donut is an ALL-PAIRS form - the reader compares arcs that do not touch -
 * which is a harder separation gate than the adjacent-pair one a bar chart has
 * to clear. This set is validated for that on a light surface; it is not the
 * module palette, whose hues are chosen to sit beside each other, not apart.
 */
const SLICE_HUES = ["#eb6834", "#2a78d6", "#1baf7a", "#7E3F5B", "#eda100", "#4a3aa7"];

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
  const cameraTotal = useMemo(() => cameras.reduce((a, c) => a + Number(c.n), 0), [cameras]);

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
        <Panel title="Detections per day" subtitle="Daily totals across the selected range">
          <ResponsiveContainer width="100%" height="100%">
            {/* A line, not a filled area: the fill implied a running total, and
                what these are is a count taken once per day. */}
            <LineChart data={daily} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
              <RTooltip formatter={(v) => [Number(v ?? 0), module.label] as [number, string]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="n" stroke={hue} strokeWidth={2.5}
                    dot={{ r: 3.5, fill: hue, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5.5 }}
                    isAnimationActive={false}>
                {/* The design labels every point. It is only readable because
                    these panels plot a handful of days - Recharts will collide
                    labels rather than thin them, so this stays off the 24-bar
                    hourly chart at narrow widths. */}
                <LabelList dataKey="n" position="top" offset={8}
                           style={{ fontSize: 10, fontWeight: 700, fill: INK }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Panel title="Detections by hour" subtitle="Time of day the events occur (site time, IST)">
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
              <Bar dataKey="n" fill={hue} radius={[4, 4, 0, 0]} maxBarSize={16}>
                <LabelList dataKey="n" position="top" offset={4}
                           formatter={(v) => (Number(v) > 0 ? String(v) : "")}
                           style={{ fontSize: 9, fontWeight: 700, fill: INK }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Panel title="Detections by weekday" subtitle="Which days of the week are busiest">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} tickMargin={4} />
              <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                        formatter={(v) => [Number(v ?? 0), "events"] as [number, string]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="n" fill={hue} radius={[4, 4, 0, 0]} maxBarSize={26}>
                <LabelList dataKey="n" position="top" offset={4}
                           formatter={(v) => (Number(v) > 0 ? String(v) : "")}
                           style={{ fontSize: 10, fontWeight: 700, fill: INK }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Panel title="Detections by camera" subtitle="Share of events recorded by each camera" height={200}>
          {cameras.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No camera recorded an event in this range.
            </Typography>
          ) : (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: "center", height: "100%" }}>
              <Box sx={{ width: 168, height: 168, flexShrink: 0, position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cameras} dataKey="n" nameKey="camera_key"
                      innerRadius="52%" outerRadius="98%"
                      startAngle={90} endAngle={-270}
                      paddingAngle={1} stroke="#fff" strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {cameras.map((c, i) => (
                        <Cell key={c.camera_key} fill={SLICE_HUES[i % SLICE_HUES.length]} />
                      ))}
                    </Pie>
                    <RTooltip
                      formatter={(v, n) => [`${Number(v ?? 0)} events`, String(n)] as [string, string]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>

              {/* The legend carries the exact counts. Several slice hues sit
                  under 3:1 against a white card, so identity never rests on
                  colour alone - the name and number beside each swatch are what
                  make the chart readable in greyscale and to a colour-blind
                  reader. */}
              <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
                {cameras.map((c, i) => {
                  const pct = cameraTotal ? Math.round((Number(c.n) / cameraTotal) * 1000) / 10 : 0;
                  return (
                    <Stack key={c.camera_key} direction="row"
                           sx={{ alignItems: "center", gap: 1, mb: 0.85, minWidth: 0 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                                 bgcolor: SLICE_HUES[i % SLICE_HUES.length] }} />
                      <Tooltip title={c.camera_key}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                          {(c.camera_key || "—").trim()}
                        </Typography>
                      </Tooltip>
                      <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                        {c.n}{" "}
                        <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>
                          ({pct}%)
                        </Box>
                      </Typography>
                    </Stack>
                  );
                })}
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between",
                                             pt: 1, borderTop: "1px solid rgba(15,23,42,.08)" }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Total</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{cameraTotal}</Typography>
                </Stack>
              </Box>
            </Stack>
          )}
        </Panel>
      </Grid>

    </Grid>
  );
}
