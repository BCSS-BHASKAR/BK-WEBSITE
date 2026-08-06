import { Box, Stack, Typography } from "@mui/material";
import { displayCameraName } from "../../lib/cameraDisplay";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";

export type HeatmapData = {
  hours: string[];
  cameras: { camera_id: string; name: string }[];
  matrix: Record<string, number[]>;
};

type Props = {
  heatmap: HeatmapData | undefined;
  onCellClick?: (cameraId: string, hourIndex: number) => void;
};

export function DashboardHeatmap({ heatmap, onCellClick }: Props) {
  if (!heatmap) return null;
  const { cameras, hours, matrix } = heatmap;
  const labelCol = "minmax(3.5rem, 5rem)";
  const hourCol = "minmax(0, 1fr)";
  const colTemplate = `${labelCol} repeat(${hours.length}, ${hourCol})`;
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
    if (/^\d+$/.test(cid)) {
      const n = String(Number(cid));
      if (matrixNorm[n]) return matrixNorm[n];
    }
    const found = Object.keys(matrixNorm).find((k) => k.trim() === cid.trim());
    return found ? matrixNorm[found] : undefined;
  };

  const grandTotal = Object.values(matrixNorm).reduce((acc, arr) => {
    if (!Array.isArray(arr)) return acc;
    return acc + arr.reduce((a, v) => a + Number(v || 0), 0);
  }, 0);

  if (grandTotal === 0) {
    return (
      <Box sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
        <BarChartRoundedIcon sx={{ fontSize: 32, opacity: 0.4, mb: 1 }} />
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>No hour-level reads in this window</Typography>
      </Box>
    );
  }

  const max = Math.max(1, ...Object.values(matrixNorm).flatMap((arr) => arr || []));

  const activeCameras = cameras.filter((c) => {
    const raw = resolveRow(c.camera_id);
    const row = (raw ?? []).slice(0, hours.length);
    while (row.length < hours.length) row.push(0);
    return row.reduce((s, v) => s + Number(v || 0), 0) > 0;
  });

  if (!activeCameras.length) {
    return (
      <Box sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
        <BarChartRoundedIcon sx={{ fontSize: 32, opacity: 0.4, mb: 1 }} />
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>No hour-level reads in this window</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", minWidth: 0, overflow: "hidden" }}>
      <Stack spacing={1.25} sx={{ width: "100%", minWidth: 0 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: colTemplate, columnGap: 0.35, alignItems: "end" }}>
          <Box />
          {hours.map((h, hi) => (
            <Typography key={hi} sx={{ fontSize: "0.5625rem", fontWeight: 700, color: "text.secondary", textAlign: "center" }}>
              {String(h).padStart(2, "0")}
            </Typography>
          ))}
        </Box>
        {activeCameras.map((c) => {
          const camLabel = displayCameraName(c.name, c.camera_id);
          const raw = resolveRow(c.camera_id);
          const row = (raw ?? []).slice(0, hours.length);
          while (row.length < hours.length) row.push(0);
          return (
            <Box key={c.camera_id} sx={{ display: "grid", gridTemplateColumns: colTemplate, columnGap: 0.35, alignItems: "center" }}>
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={camLabel}>
                {camLabel}
              </Typography>
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
                      height: 16,
                      borderRadius: 0.75,
                      bgcolor: `rgba(37, 99, 235, ${0.12 + t * 0.78})`,
                      border: "1px solid rgba(15,23,42,0.06)",
                      ...(onCellClick ? { cursor: "pointer", p: 0 } : {}),
                    }}
                  />
                );
              })}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
