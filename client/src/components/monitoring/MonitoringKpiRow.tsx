import { Box, Grid, Paper, Skeleton, Typography } from "@mui/material";
import { contentCardSx } from "../../lib/uiSurfaces";
import type { InferenceModule } from "../../lib/inferenceModules";

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

function fmtDur(s: number | null) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
}
function fmtHour(h: number | null) {
  return h == null ? "—" : `${String(h).padStart(2, "0")}:00`;
}

type Tile = { label: string; value: string | number; hint?: string; onClick?: () => void };

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
 */
export function MonitoringKpiRow({
  module, kpis, loading, onDrill,
}: {
  module: InferenceModule;
  kpis?: ModuleKpis;
  loading?: boolean;
  onDrill?: () => void;
}) {
  const caps = module.capabilities;
  const k = kpis;

  const tiles: Tile[] = [
    { label: `Total ${module.label.toLowerCase()}`, value: k?.total ?? 0, hint: "in selected range", onClick: onDrill },
    { label: "Active cameras", value: k?.cameras ?? 0, hint: "reporting this module" },
    ...(caps.duration
      ? [
          { label: "Longest duration", value: fmtDur(k?.longestSeconds ?? null) },
          { label: "Average duration", value: fmtDur(k?.avgSeconds ?? null) },
        ]
      : [
          { label: "Peak hour", value: fmtHour(k?.peakHour ?? null), hint: k ? `${k.peakHourCount} events` : undefined },
          { label: "Average per hour", value: k?.avgPerHour ?? "—" },
        ]),
    // "Avg confidence" and "Latest detection" are gone. Confidence is a model
    // diagnostic rather than an operational figure, and the timestamp was a
    // long string sitting in a row of short numbers, which pushed the walk-ins
    // tiles out of step with every other monitoring page. Recency still reads
    // off the first row of the table below.
  ];

  return (
    <Grid container spacing={1.5}>
      {tiles.map((t) => (
        <Grid key={t.label} size={{ xs: 6, sm: 6, md: 3 }}>
          <Paper
            onClick={t.onClick}
            sx={{
              ...contentCardSx, p: 1.75, height: "100%",
              cursor: t.onClick ? "pointer" : "default",
              transition: "box-shadow 160ms ease",
              ...(t.onClick ? { "&:hover": { boxShadow: "0 2px 10px rgba(15,23,42,.10)" } } : {}),
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: module.colour, flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary" noWrap>{t.label}</Typography>
            </Box>
            {loading ? (
              <Skeleton width="60%" height={32} />
            ) : (
              <Typography sx={{ fontWeight: 800, fontSize: 24, lineHeight: 1.15 }}>{t.value}</Typography>
            )}
            {t.hint && !loading && (
              <Typography variant="caption" color="text.secondary">{t.hint}</Typography>
            )}
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}
