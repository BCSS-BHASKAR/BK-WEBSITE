import { Box, Typography } from "@mui/material";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import { displayCameraName, heatmapCheckpointDot } from "../../lib/cameraDisplay";
import { pnp } from "../../lib/pnpTheme";
import type { HeatmapData } from "./DashboardHeatmap";

const LEGEND_STOPS = [
  "rgba(37, 99, 235, 0.08)",
  "rgba(37, 99, 235, 0.22)",
  "rgba(37, 99, 235, 0.42)",
  "rgba(37, 99, 235, 0.62)",
  "rgba(37, 99, 235, 0.88)",
];

type Props = {
  heatmap: HeatmapData | undefined;
  onCellClick?: (cameraId: string, hourIndex: number) => void;
};

export function BusyHoursHeatmap({ heatmap, onCellClick }: Props) {
  if (!heatmap) return null;
  const { cameras, hours, matrix } = heatmap;
  const matrixNorm: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(matrix || {})) {
    const nk = String(k).replace(/\0/g, "").trim();
    if (!nk) continue;
    matrixNorm[nk] = Array.isArray(v) ? v : [];
  }

  const resolveRow = (cameraId: string) => {
    const cid = String(cameraId).replace(/\0/g, "").trim();
    const direct = matrixNorm[cid];
    if (direct) return direct;
    const found = Object.keys(matrixNorm).find((k) => k.trim() === cid.trim());
    return found ? matrixNorm[found] : undefined;
  };

  const grandTotal = Object.values(matrixNorm).reduce((acc, arr) => {
    if (!Array.isArray(arr)) return acc;
    return acc + arr.reduce((a, v) => a + Number(v || 0), 0);
  }, 0);

  if (grandTotal === 0) {
    return (
      <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
        <BarChartRoundedIcon sx={{ fontSize: 32, opacity: 0.4, mb: 1 }} />
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>No hour-level reads in this window</Typography>
      </Box>
    );
  }

  const max = Math.max(1, ...Object.values(matrixNorm).flatMap((arr) => arr || []));
  const labelCol = "minmax(5.5rem, 7rem)";
  const hourCol = "minmax(12px, 1fr)";
  const totalCol = "3.5rem";
  const colTemplate = `${labelCol} repeat(${hours.length}, ${hourCol}) ${totalCol}`;

  const activeCameras = cameras.filter((c) => {
    const raw = resolveRow(c.camera_id);
    const row = (raw ?? []).slice(0, hours.length);
    while (row.length < hours.length) row.push(0);
    return row.reduce((s, v) => s + Number(v || 0), 0) > 0;
  });

  if (!activeCameras.length) {
    return (
      <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
        <BarChartRoundedIcon sx={{ fontSize: 32, opacity: 0.4, mb: 1 }} />
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>No hour-level reads in this window</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, mb: 1.75, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "9px",
              bgcolor: pnp.primarySoft,
              color: pnp.primary,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <ScheduleRoundedIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700, color: pnp.text, lineHeight: 1.25 }}>Busy Hours</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, mt: 0.35, maxWidth: 440, lineHeight: 1.45 }}>
              Darker cells show more reads at that hour. Tap a cell to drill down.
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, flexShrink: 0 }}>
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 600, color: pnp.textMuted, mr: 0.25 }}>Low</Typography>
          {LEGEND_STOPS.map((bg, i) => (
            <Box key={i} sx={{ width: 13, height: 13, borderRadius: "3px", bgcolor: bg, border: "1px solid rgba(15,23,42,0.06)" }} />
          ))}
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 600, color: pnp.textMuted, ml: 0.25 }}>High</Typography>
        </Box>
      </Box>

      <Box sx={{ overflowX: "auto", pb: 0.5 }}>
        <Box sx={{ minWidth: hours.length * 16 + 220 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: colTemplate, columnGap: 0.35, alignItems: "end", mb: 0.85 }}>
            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 800, color: pnp.textMuted, letterSpacing: "0.07em" }}>CHECKPOINT</Typography>
            {hours.map((h, hi) => (
              <Typography key={hi} sx={{ fontSize: "0.5625rem", fontWeight: 700, color: pnp.textMuted, textAlign: "center" }}>
                {String(h).padStart(2, "0")}
              </Typography>
            ))}
            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 800, color: pnp.textMuted, textAlign: "right", letterSpacing: "0.06em" }}>
              TOTAL
            </Typography>
          </Box>
          {activeCameras.map((c) => {
            const camLabel = displayCameraName(c.name, c.camera_id);
            const raw = resolveRow(c.camera_id);
            const row = (raw ?? []).slice(0, hours.length);
            while (row.length < hours.length) row.push(0);
            const rowTotal = row.reduce((s, v) => s + Number(v || 0), 0);
            const dot = heatmapCheckpointDot();
            return (
              <Box
                key={c.camera_id}
                sx={{ display: "grid", gridTemplateColumns: colTemplate, columnGap: 0.35, alignItems: "center", mb: 0.55 }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.65, minWidth: 0 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dot, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: pnp.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={camLabel}>
                    {camLabel}
                  </Typography>
                </Box>
                {row.map((v, idx) => {
                  const t = v / max;
                  return (
                    <Box
                      key={idx}
                      {...(onCellClick
                        ? { component: "button" as const, type: "button" as const, onClick: () => onCellClick(c.camera_id, idx) }
                        : {})}
                      title={`${v} reads · ${camLabel}`}
                      sx={{
                        width: "100%",
                        maxWidth: 24,
                        height: 10,
                        mx: "auto",
                        borderRadius: "999px",
                        bgcolor: `rgba(37, 99, 235, ${0.1 + t * 0.82})`,
                        border: "1px solid rgba(15,23,42,0.04)",
                        ...(onCellClick ? { cursor: "pointer", p: 0, minHeight: 10 } : {}),
                      }}
                    />
                  );
                })}
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: pnp.text, textAlign: "right" }}>
                  {rowTotal.toLocaleString()}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
