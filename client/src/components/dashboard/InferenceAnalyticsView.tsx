import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Box, Chip, CircularProgress, Grid, IconButton, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { api } from "../../lib/api";
import { contentCardSx } from "../../lib/uiSurfaces";
// Read-only: the shared monitoring table tokens are used as-is so this card
// matches the Monitoring pages. Everything this dashboard needs beyond them is
// declared locally below, so nothing outside this file changes.
import { tableCellSx, tableHeadSx } from "../monitoring/monitoringTokens";
import { MODULE_BY_KEY, type InferenceModuleKey } from "../../lib/inferenceModules";
import { useAutoRefreshMs } from "../../lib/useAppSettings";
import { usePermissions } from "../../lib/permissions";
import { MonitoringMediaViewer } from "../monitoring/MonitoringMediaViewer";
import type { MonitoringRow } from "../monitoring/MonitoringEventsTable";

// ---------------------------------------------------------------------------
// Palette
//
// Validated categorical slots (adjacent pairlist, light surface): worst CVD
// dE 9.1, worst normal-vision dE 22.9 - both clear of the gates. Three of these
// sit under 3:1 against a light surface, so the "relief rule" applies: every
// chart below carries visible value labels or a table, never colour alone.
// One hue per SERVICE, assigned by identity and never by rank, so a filter can
// never repaint a series.
// ---------------------------------------------------------------------------
const SERVICE_COLOUR: Record<string, string> = {
  walkins: "#2a78d6",      // slot 1 blue
  loitering: "#eb6834",    // slot 2 orange
  intrusion: "#1baf7a",    // slot 3 aqua
  after_hours: "#eda100",  // slot 4 yellow
  chef_absence: "#c2408c", // slot 6 magenta
};
const SERVICE_LABEL: Record<string, string> = {
  walkins: "Walk-ins",
  loitering: "Loitering",
  intrusion: "Intrusion",
  after_hours: "After Hours",
  chef_absence: "Chef Absence",
};
// The modules the dashboard reports on. kitchen_unattended is deliberately
// absent: chef_absence is the module that actually records unmanned-station
// incidents at this site, so carrying both showed the same concern twice - once
// under a name that never had any events behind it.
const SERVICES = [
  "walkins", "loitering", "intrusion", "after_hours", "chef_absence",
] as const;

// Everything that warrants attention, i.e. every module except walk-ins.
// Walk-ins are footfall, not something to act on.
const ALERT_SERVICES = ["loitering", "intrusion", "after_hours", "chef_absence"] as const;

// Recessive grid/axis ink; text never wears a series colour.
const INK_MUTED = "rgba(0,0,0,.45)";
const GRID = "rgba(0,0,0,.08)";
const SEQ = "#2a78d6"; // single-hue sequential for magnitude charts

/**
 * Slice hues for the camera-activity donut.
 *
 * A donut is an ALL-PAIRS form - the reader compares arcs that do not touch -
 * and that gate is far harder than the adjacent-pair one the bar charts above
 * clear. This exact five passes it: validated all-pairs on a light surface at
 * worst CVD dE 6.9 and worst normal-vision dE 16.3. Pairs that read fine side
 * by side in a bar chart fail here (orange beside magenta lands at dE 12.9,
 * under the 15 floor), which is why this is NOT the SERVICE_COLOUR order.
 *
 * Five is also the ceiling, hence top four cameras plus "Other": a twelve-camera
 * fleet cannot be seated in a pie without folding the tail.
 */
const SLICE_COLOURS = ["#2a78d6", "#eda100", "#1baf7a", "#4a3aa7", "#e34948"];
const DONUT_SLICES = 4;

/**
 * Column widths for the Latest captures table, declared once and applied to the
 * header cell and the body cell alike so the two can never drift apart.
 *
 * Percentages, not pixels: this card is a half-width panel beside the donut on a
 * desktop and full-width on a phone. Fixed pixel columns would leave whichever
 * column had no width absorbing the entire difference - a Camera column three
 * times wider than it needs at one breakpoint and clipped at the next. These sum
 * to 100, which under `table-layout: fixed` holds the proportions at any width.
 *
 * Camera takes the largest share because it carries the longest values
 * ("Camera_Loitering-1", "cam-after hours -2"); View is sized for one icon.
 */
const CAPTURE_COLS = {
  event: "26%",
  camera: "40%",
  detected: "24%",
  view: "10%",
} as const;

/** Clip an over-long value to its column instead of letting it widen the table. */
const clipSx = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
} as const;
const captureHeadSx = { ...tableHeadSx, ...clipSx, verticalAlign: "middle" as const };
const captureCellSx = { ...tableCellSx, ...clipSx, verticalAlign: "middle" as const };

const SITE_TZ = "Asia/Kolkata";

type Stats = {
  byDay: { day: string; service: string; n: number }[];
  byHour: { hour: number; n: number }[];
  byCamera: { service: string; camera_key: string; n: number; latest: string }[];
};
type Summary = {
  counts: Record<string, number | string>;
  last24h: { service: string; n: number; latest: string }[];
  topUpperColours: { name: string; n: number }[];
};

function fmtDateTime(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: SITE_TZ, day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
// fmtBytes was removed with the "Media stored" tile - it had no other caller.

/** Hero/stat tile. A single headline number is a tile, never a one-bar chart. */
function StatTile({ label, value, hint, accent, onClick }: {
  label: string; value: string | number; hint?: string; accent?: string; onClick?: () => void;
}) {
  return (
    <Paper
      onClick={onClick}
      sx={{
        ...contentCardSx, p: 1.75, height: "100%",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 160ms ease",
        ...(onClick ? { "&:hover": { boxShadow: "0 2px 10px rgba(15,23,42,.10)" } } : {}),
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        {accent && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: accent, flexShrink: 0 }} />}
        <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
      </Stack>
      <Typography sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1.1 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

function ChartCard({ title, subtitle, height = 190, children }: {
  title: string; subtitle?: string; height?: number; children: React.ReactNode;
}) {
  return (
    <Paper sx={{ ...contentCardSx, p: 2, height: "100%" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {subtitle}
        </Typography>
      )}
      <Box sx={{ height, mt: subtitle ? 0 : 1 }}>{children}</Box>
    </Paper>
  );
}

/**
 * Stands in for a chart that has nothing to plot.
 *
 * An axis drawn over an all-zero series reads as a measured flat line, which is
 * a different claim from "this module recorded nothing in this period". The
 * modules that are quiet still get their card, so the set of five stays whole.
 */
function NoData({ label = "No events recorded in this period" }: { label?: string }) {
  return (
    <Box
      sx={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 0.75,
        border: "1px dashed rgba(15,23,42,.14)", borderRadius: 1.5,
        px: 1.5, textAlign: "center",
      }}
    >
      <InboxOutlinedIcon sx={{ fontSize: 22, color: "text.disabled" }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

export function InferenceAnalyticsView({ from, to }: { from?: string; to?: string } = {}) {
  const navigate = useNavigate();
  const refetchInterval = useAutoRefreshMs();
  const { can } = usePermissions();
  // Latest captures open in the same viewer the Monitoring pages use.
  const [captureIndex, setCaptureIndex] = useState<number | null>(null);
  const { data: stats, isLoading: lStats } = useQuery({
    queryKey: ["inference", "stats", from, to],
    queryFn: async () =>
      (await api.get("/inference/stats", {
        params: { days: 14, ...(from && to ? { from, to } : {}) },
      })).data as Stats,
    refetchInterval,
  });
  const { data: summary, isLoading: lSum } = useQuery({
    queryKey: ["inference", "summary", from, to],
    queryFn: async () =>
      (await api.get("/inference/summary", { params: from && to ? { from, to } : {} })).data as Summary,
    refetchInterval,
  });
  const { data: recent } = useQuery({
    queryKey: ["inference", "recent"],
    queryFn: async () => (await api.get("/inference/timeline", { params: { pageSize: 12 } })).data,
    refetchInterval,
  });
  // Camera fleet state for the Cameras Online tile. This is the same endpoint
  // the Cameras Online page reads, so the two can never report different
  // counts - the spec asks for that consistency explicitly.
  // /api/streams is guarded by the cameras_online grant, so a user without it
  // gets a 403. Ask only when the grant is held: otherwise the query retries a
  // request that can never succeed, and the tile would print a confident "0 / 0"
  // for a fleet it was simply not allowed to see.
  const canSeeCameras = can("cameras_online");
  const { data: streams, isError: streamsError } = useQuery({
    queryKey: ["streams", "fleet"],
    queryFn: async () => (await api.get("/streams")).data as {
      streams: { id: string; name: string; online: boolean }[];
    },
    enabled: canSeeCameras,
    refetchInterval,
  });
  const { data: facets } = useQuery({
    queryKey: ["inference", "facets"],
    queryFn: async () => (await api.get("/inference/facets")).data as {
      colours: { region: string; name: string; n: number; rgb: number[] | null }[];
    },
  });

  /**
   * byDay only contains days that HAVE data. Plotting those directly drew a
   * two-point diagonal across a 14-day window - a trend that is not there.
   * Build the full day axis for the range and zero-fill so the shape is real.
   */
  const perService = useMemo(() => {
    const present = (stats?.byDay || []).map((r) => String(r.day).slice(0, 10)).sort();
    let start: Date;
    let end: Date;
    if (from && to) {
      start = new Date(`${from}T00:00:00Z`);
      end = new Date(`${to}T00:00:00Z`);
    } else if (present.length) {
      start = new Date(`${present[0]}T00:00:00Z`);
      end = new Date(`${present[present.length - 1]}T00:00:00Z`);
    } else {
      end = new Date();
      start = new Date(end.getTime() - 6 * 86400000);
    }
    const days: string[] = [];
    for (let d = new Date(start); d <= end && days.length < 92; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    const lookup = new Map(
      (stats?.byDay || []).map((r) => [`${String(r.day).slice(0, 10)}|${r.service}`, Number(r.n)])
    );
    return SERVICES.map((svc) => ({
      service: svc,
      total: (stats?.byDay || []).filter((r) => r.service === svc).reduce((a, r) => a + Number(r.n), 0),
      points: days.map((d) => ({
        day: d,
        label: new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
          timeZone: "UTC", day: "2-digit", month: "short",
        }),
        n: lookup.get(`${d}|${svc}`) || 0,
      })),
    }));
  }, [stats, from, to]);

  // Every hour present so the shape of the day is honest, not just hours with data.
  const hourly = useMemo(() => {
    const map = new Map((stats?.byHour || []).map((r) => [Number(r.hour), Number(r.n)]));
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, n: map.get(h) || 0 }));
  }, [stats]);
  const hourlyTotal = useMemo(() => hourly.reduce((a, r) => a + r.n, 0), [hourly]);

  /**
   * Donut slices: the busiest cameras, with the remainder folded into "Other".
   *
   * byCamera is one row per camera PER SERVICE, so a camera feeding two modules
   * arrives twice. Totalling by camera key first is what makes the shares add up
   * to the whole rather than past it.
   */
  const cameraShare = useMemo(() => {
    const byKey = new Map<string, number>();
    for (const r of stats?.byCamera || []) {
      if (!SERVICE_LABEL[r.service]) continue;
      const key = (r.camera_key || "").trim() || "—";
      byKey.set(key, (byKey.get(key) || 0) + Number(r.n));
    }
    const ranked = [...byKey.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n);
    const total = ranked.reduce((a, r) => a + r.n, 0);
    if (!total) return [];

    const head = ranked.slice(0, DONUT_SLICES);
    const tail = ranked.slice(DONUT_SLICES);
    const slices = head.map((r, i) => ({
      name: r.name,
      title: r.name,
      n: r.n,
      colour: SLICE_COLOURS[i],
    }));
    if (tail.length) {
      slices.push({
        name: `Other (${tail.length} camera${tail.length === 1 ? "" : "s"})`,
        title: tail.map((r) => `${r.name} — ${r.n}`).join("\n"),
        n: tail.reduce((a, r) => a + r.n, 0),
        colour: SLICE_COLOURS[DONUT_SLICES],
      });
    }
    return slices.map((s) => ({ ...s, pct: Math.round((s.n / total) * 1000) / 10 }));
  }, [stats]);

  const upperColours = useMemo(
    () => (facets?.colours || []).filter((c) => c.region === "upper").slice(0, 8),
    [facets]
  );
  const last24 = useMemo(
    () => new Map((summary?.last24h || []).map((r) => [r.service, r])),
    [summary]
  );

  if (lStats || lSum) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>;
  }

  const c = summary?.counts || {};

  // Every module except walk-ins. Walk-ins are footfall, not something to act
  // on, so folding them in would inflate the alert headline.
  //
  // Chef Absence has its own tile AND is counted here. That overlap is
  // deliberate: the tile answers "how is the kitchen covered", the total answers
  // "how much needs attention overall", and the hint on each says which it is.
  const activeAlerts = ALERT_SERVICES.reduce((a, s) => a + Number(c[s] || 0), 0);

  const online = (streams?.streams || []).filter((s) => s.online).length;
  const totalCams = (streams?.streams || []).length;
  // A dash for "not permitted", "failed" and "none reported" alike - never a
  // zero the page did not actually establish.
  const camerasLabel = !canSeeCameras || streamsError || !totalCams ? "—" : `${online} / ${totalCams}`;

  return (
    <Box>
      {/* KPI row - four operational headlines, not one tile per module.
          "Events captured" and "Media stored" are gone: the first restated the
          sum of the others, and the second reported S3 storage, which is not an
          operational figure. The per-module detail lives in the charts below. */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <StatTile
            label="Walk-ins"
            value={Number(c.walkins || 0)}
            accent={MODULE_BY_KEY.walkins.colour}
            hint={`${Number(last24.get("walkins")?.n || 0)} in last 24h`}
            onClick={() => navigate(MODULE_BY_KEY.walkins.route)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <StatTile
            label="Chef Absence"
            value={Number(c.chef_absence || 0)}
            accent={MODULE_BY_KEY.chef_absence.colour}
            hint={`${Number(last24.get("chef_absence")?.n || 0)} in last 24h`}
            onClick={() => navigate(MODULE_BY_KEY.chef_absence.route)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <StatTile
            label="Active Alerts"
            value={activeAlerts}
            accent={MODULE_BY_KEY.intrusion.colour}
            hint="across alert modules"
            onClick={() => navigate("/crowds-report")}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <StatTile
            label="Cameras Online"
            value={camerasLabel}
            accent={MODULE_BY_KEY.loitering.colour}
            hint="reporting a signal now"
            onClick={() => navigate("/live-view")}
          />
        </Grid>
      </Grid>

      {/* Small multiples: one single-series chart per service. Avoids a 5-series
          stack where hues would compete, and each chart names its own series so
          no legend box is needed. */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Daily activity by service
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {perService.map((s) => (
          <Grid key={s.service} size={{ xs: 12, sm: 6, md: 4 }}>
            <ChartCard
              title={SERVICE_LABEL[s.service]}
              subtitle={s.total === 1 ? "1 event" : `${s.total} events`}
              height={140}
            >
              {s.total === 0 ? (
                <NoData />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {/* Daily counts are discrete per-day events, so bars are the
                      honest form. An interpolated area implied continuous change
                      between two sampled days. */}
                  <BarChart data={s.points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: INK_MUTED }}
                           axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
                    <YAxis allowDecimals={false} width={30} tick={{ fontSize: 10, fill: INK_MUTED }}
                           axisLine={false} tickLine={false} tickMargin={4} />
                    <RTooltip cursor={{ fill: "rgba(0,0,0,.04)" }}
                              formatter={(v) => [Number(v ?? 0), SERVICE_LABEL[s.service]] as [number, string]}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="n" fill={SERVICE_COLOUR[s.service]} radius={[3, 3, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </Grid>
        ))}
      </Grid>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Activity patterns
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Magnitude over an ordered scale -> single-hue sequential bars */}
        <Grid size={{ xs: 12, md: 7 }}>
          <ChartCard title="When events happen" subtitle="All services by hour of day (site time, IST)" height={210}>
            {hourlyTotal === 0 ? (
              <NoData label="No events recorded across any module in this period" />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: INK_MUTED }} axisLine={false} tickLine={false}
                       tickFormatter={(h) => `${String(h).padStart(2, "0")}`} interval={1} />
                <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10, fill: INK_MUTED }}
                       axisLine={false} tickLine={false} tickMargin={4} />
                <RTooltip
                  labelFormatter={(h) => `${String(h).padStart(2, "0")}:00 – ${String(Number(h) + 1).padStart(2, "0")}:00`}
                  formatter={(v) => [Number(v ?? 0), "events"] as [number, string]}
                  cursor={{ fill: "rgba(0,0,0,.04)" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                {/* 4px rounded data-end, anchored to the baseline */}
                <Bar dataKey="n" fill={SEQ} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>

        {/* Colour IS the identity here, so the bars carry the extracted RGB and
            every row is labelled with its name and count. */}
        <Grid size={{ xs: 12, md: 5 }}>
          <ChartCard title="Upper-garment colours" subtitle="People seen wearing each colour" height={210}>
            {upperColours.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No walk-in colour data yet.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={upperColours} layout="vertical" margin={{ top: 0, right: 28, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: INK_MUTED }}
                         axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={72}
                         tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={false} tickLine={false} />
                  <RTooltip formatter={(v) => [Number(v ?? 0), "people"] as [number, string]} cursor={{ fill: "rgba(0,0,0,.04)" }}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="n" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {upperColours.map((cc) => (
                      <Cell key={cc.name}
                            fill={cc.rgb && cc.rgb.length === 3 ? `rgb(${cc.rgb.join(",")})` : SEQ}
                            stroke="rgba(0,0,0,.22)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>
      </Grid>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Cameras and captures
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ ...contentCardSx, p: 2, height: "100%" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Camera activity</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              Share of all events by camera
            </Typography>
            {cameraShare.length === 0 ? (
              <Box sx={{ height: 250 }}><NoData label="No camera activity recorded yet" /></Box>
            ) : (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: "center" }}>
                <Box sx={{ width: { xs: "100%", sm: 190 }, height: 190, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      {/* A donut, not a filled pie: the hole keeps the arcs thin
                          rather than turning the card into a block of colour. */}
                      <Pie
                        data={cameraShare}
                        dataKey="n"
                        nameKey="name"
                        innerRadius="58%"
                        outerRadius="92%"
                        // The 2px white stroke IS the surface gap between
                        // adjacent fills; paddingAngle only nudges them apart so
                        // two same-sized neighbours still read as two arcs.
                        paddingAngle={1}
                        stroke="#fff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {cameraShare.map((s) => (
                          <Cell key={s.name} fill={s.colour} />
                        ))}
                      </Pie>
                      <RTooltip
                        formatter={(v, n) => [`${Number(v ?? 0)} events`, String(n)] as [string, string]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>

                {/* The legend carries the exact counts. Two slice hues sit under
                    3:1 against the card, so identity is never colour alone - the
                    name and number beside each swatch are the relief. */}
                <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
                  {cameraShare.map((s) => (
                    <Stack key={s.name} direction="row" spacing={1}
                           sx={{ alignItems: "center", justifyContent: "space-between", minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: s.colour, flexShrink: 0 }} />
                        <Tooltip title={s.title}>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{s.name}</Typography>
                        </Tooltip>
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                        {s.n}
                        <Box component="span" sx={{ ml: 0.5, fontWeight: 500, color: "text.secondary" }}>
                          {s.pct}%
                        </Box>
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
            )}
          </Paper>
        </Grid>

        {/* Latest captures.
            A table rather than a thumbnail wall: the grid showed a picture and a
            timestamp but never which module fired or which camera saw it, so a
            capture could not be identified without opening it. The evidence is
            still one click away - the row and the View button both open the
            same viewer the Monitoring pages use. */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ ...contentCardSx, p: 0, height: "100%", overflow: "hidden" }}>
            <Box sx={{ p: 2, pb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Latest captures</Typography>
              <Typography variant="caption" color="text.secondary">
                Most recent detections across every module
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 300 }}>
              {/* table-layout: fixed at 100% width is what holds the header rule
                  and the row content on the same vertical lines - without it the
                  browser re-widths every column to fit the longest camera key on
                  the current page, so the columns shift as you paginate. */}
              <Table size="small" stickyHeader sx={{ width: "100%", tableLayout: "fixed" }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...captureHeadSx, width: CAPTURE_COLS.event }}>Event</TableCell>
                    <TableCell sx={{ ...captureHeadSx, width: CAPTURE_COLS.camera }}>Camera</TableCell>
                    <TableCell sx={{ ...captureHeadSx, width: CAPTURE_COLS.detected }}>Detected at</TableCell>
                    <TableCell sx={{ ...captureHeadSx, width: CAPTURE_COLS.view }} align="center">View</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(recent?.rows || []).slice(0, 12).map((r: any, i: number) => {
                    const hue = SERVICE_COLOUR[r.service] || "#999";
                    return (
                      <TableRow key={`${r.service}-${r.id}`} hover sx={{ cursor: "pointer" }}
                                onClick={() => setCaptureIndex(i)}>
                        <TableCell sx={{ ...captureCellSx, width: CAPTURE_COLS.event }}>
                          <Chip
                            size="small"
                            label={SERVICE_LABEL[r.service] || r.service}
                            sx={{
                              maxWidth: "100%", height: 22, fontSize: 11, fontWeight: 700,
                              bgcolor: `${hue}1A`, color: hue, border: `1px solid ${hue}44`,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ ...captureCellSx, width: CAPTURE_COLS.camera }}>
                          <Tooltip title={r.camera_key || ""}>
                            <Box component="span" sx={{ display: "block", ...clipSx }}>
                              {(r.camera_key || "—").trim() || "—"}
                            </Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ ...captureCellSx, width: CAPTURE_COLS.detected }}>
                          {fmtDateTime(r.occurred_at)}
                        </TableCell>
                        <TableCell sx={{ ...captureCellSx, width: CAPTURE_COLS.view }} align="center">
                          <IconButton size="small" aria-label="View capture"
                                      onClick={(e) => { e.stopPropagation(); setCaptureIndex(i); }}>
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!(recent?.rows || []).length && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ ...captureCellSx, py: 5, textAlign: "center" }}>
                        <Typography variant="body2" color="text.secondary">Nothing captured yet.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Reuses the Monitoring viewer, so a capture opened from the dashboard
          behaves identically - video plays, Previous/Next steps through the
          latest set, and the feedback controls are the same. */}
      {captureIndex !== null && (recent?.rows || [])[captureIndex] && (
        <MonitoringMediaViewer
          open
          module={MODULE_BY_KEY[((recent!.rows[captureIndex].service) as InferenceModuleKey)] ?? MODULE_BY_KEY.intrusion}
          rows={(recent?.rows || []).slice(0, 12).map((r: any) => ({ ...r, detected_at: r.occurred_at })) as MonitoringRow[]}
          index={captureIndex}
          onIndexChange={setCaptureIndex}
          onClose={() => setCaptureIndex(null)}
          verdictFor={() => null}
          onFeedback={() => {}}
        />
      )}
    </Box>
  );
}
