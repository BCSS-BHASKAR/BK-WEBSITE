import { Box, Paper, Typography } from "@mui/material";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRounded from "@mui/icons-material/TrendingDownRounded";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import CalendarMonthRounded from "@mui/icons-material/CalendarMonthRounded";
import VideocamRounded from "@mui/icons-material/VideocamRounded";
import { contentCardSx } from "../../lib/uiSurfaces";
import { tintOf } from "./monitoringTokens";
import type { InferenceModule } from "../../lib/inferenceModules";
import type { ModuleAnalytics } from "./MonitoringAnalytics";
import type { ModuleKpis } from "./MonitoringKpiRow";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Insight = {
  headline: string;
  body: string;
  colour: string;
  icon: React.ReactNode;
};

function hour12(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m` : `${Math.round(s)}s`;
}

/**
 * Derived readings of the same data the charts plot.
 *
 * Every card here is computed from the analytics payload already on the page -
 * nothing is fetched, and nothing is asserted that the charts do not also show.
 * An insight is omitted entirely rather than rendered empty: a panel that says
 * "Busiest day: —" is worse than one card shorter, because it invites the reader
 * to treat a gap in the data as a finding.
 */
function buildInsights(
  module: InferenceModule,
  data: ModuleAnalytics | undefined,
  kpis: ModuleKpis | undefined
): Insight[] {
  const out: Insight[] = [];
  const hue = module.colour;

  // 1. Busiest 6-hour window, and how much of the day's activity it holds.
  const byHour = data?.byHour || [];
  const total = byHour.reduce((a, r) => a + Number(r.n), 0);
  if (total > 0) {
    const counts = Array.from({ length: 24 }, (_, h) =>
      Number(byHour.find((r) => Number(r.hour) === h)?.n || 0)
    );
    const WINDOW = 6;
    let bestStart = 0;
    let bestSum = -1;
    for (let start = 0; start <= 24 - WINDOW; start += 1) {
      const sum = counts.slice(start, start + WINDOW).reduce((a, n) => a + n, 0);
      if (sum > bestSum) { bestSum = sum; bestStart = start; }
    }
    const share = Math.round((bestSum / total) * 100);
    // A 6-hour window is a quarter of the day, so 25% is the "no pattern"
    // baseline. Reporting the lift over that is what makes the number mean
    // something; the raw share alone always looks impressive.
    const lift = share - Math.round((WINDOW / 24) * 100);
    out.push({
      headline: `${share}%`,
      body: `of events fall between ${hour12(bestStart)} and ${hour12(bestStart + WINDOW)}${
        lift > 0 ? ` — ${lift} points above an even spread` : ""
      }`,
      colour: hue,
      icon: lift > 0 ? <TrendingUpRounded /> : <TrendingDownRounded />,
    });
  }

  // 2. Duration band, only for modules that actually measure one.
  if (module.capabilities.duration && kpis?.avgSeconds != null && kpis.longestSeconds != null) {
    out.push({
      headline: `${fmtDur(kpis.avgSeconds)} – ${fmtDur(kpis.longestSeconds)}`,
      body: "Average to longest dwell in this range",
      colour: "#2a78d6",
      icon: <ScheduleRounded />,
    });
  }

  // 3. Busiest weekday.
  const byWeekday = data?.byWeekday || [];
  if (byWeekday.length) {
    const top = byWeekday.reduce((a, r) => (Number(r.n) > Number(a.n) ? r : a));
    if (Number(top.n) > 0) {
      out.push({
        headline: WEEKDAYS[Number(top.weekday)] ?? "—",
        body: `Busiest day in this range (${top.n} events)`,
        colour: "#15803D",
        icon: <CalendarMonthRounded />,
      });
    }
  }

  // 4. Most active camera, with its share.
  const byCamera = data?.byCamera || [];
  if (byCamera.length) {
    const camTotal = byCamera.reduce((a, r) => a + Number(r.n), 0);
    const top = byCamera.reduce((a, r) => (Number(r.n) > Number(a.n) ? r : a));
    if (camTotal > 0 && Number(top.n) > 0) {
      out.push({
        headline: (top.camera_key || "—").trim(),
        body: `Most active camera (${Math.round((Number(top.n) / camTotal) * 1000) / 10}% of events)`,
        colour: "#7E3F5B",
        icon: <VideocamRounded />,
      });
    }
  }

  return out;
}

export function MonitoringInsights({
  module, data, kpis, loading,
}: {
  module: InferenceModule;
  data?: ModuleAnalytics;
  kpis?: ModuleKpis;
  loading?: boolean;
}) {
  const insights = buildInsights(module, data, kpis);

  return (
    <Paper sx={{ ...contentCardSx, height: "100%", display: "flex", flexDirection: "column" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>Quick Insights</Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary">Reading the range…</Typography>
      ) : insights.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing recorded in this range to draw conclusions from.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {insights.map((i) => (
            <Box
              key={i.headline + i.body}
              sx={{
                display: "flex", alignItems: "flex-start", gap: 1.25,
                p: 1.25, borderRadius: "10px",
                bgcolor: tintOf(i.colour, 0.07),
                border: `1px solid ${tintOf(i.colour, 0.18)}`,
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 32, height: 32, flexShrink: 0, borderRadius: "8px",
                  display: "grid", placeItems: "center",
                  bgcolor: "#fff", color: i.colour,
                  "& .MuiSvgIcon-root": { fontSize: 18 },
                }}
              >
                {i.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: "0.9375rem", color: i.colour, lineHeight: 1.3 }}>
                  {i.headline}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.45 }}>
                  {i.body}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}
