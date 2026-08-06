import { Box, useTheme } from "@mui/material";
import type { MouseHandlerDataParam } from "recharts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BAR_COLORS = ["#1D4ED8", "#0EA5E9", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"];

export type CameraBarRow = { name: string; total: number; cameraId?: string | null };

export function CameraBarChart({
  data,
  height = 200,
  onBarClick,
}: {
  data: CameraBarRow[];
  height?: number;
  onBarClick?: (row: CameraBarRow) => void;
}) {
  const theme = useTheme();

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
        No detections for this selection
      </Box>
    );
  }

  const handleClick = onBarClick
    ? (state: MouseHandlerDataParam) => {
        const name = state.activeLabel != null ? String(state.activeLabel) : "";
        const row = data.find((d) => d.name === name);
        if (row) onBarClick(row);
      }
    : undefined;

  return (
    <Box sx={{ position: "relative", cursor: onBarClick ? "pointer" : "default", touchAction: "none" }}>
      <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        onClick={handleClick}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: theme.palette.text.secondary, fontWeight: 700 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fontSize: 11, fill: theme.palette.text.primary, fontWeight: 800 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(29,78,216,0.06)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const row = payload[0].payload as CameraBarRow;
            const value = Number(payload[0].value ?? 0);
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
                <Box sx={{ fontWeight: 900, mb: 0.25 }}>{row.name}</Box>
                <Box sx={{ color: "text.secondary", fontWeight: 700 }}>
                  {value.toLocaleString()} alert{value === 1 ? "" : "s"}
                </Box>
              </Box>
            );
          }}
        />
        <Bar dataKey="total" radius={[0, 8, 8, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </Box>
  );
}
