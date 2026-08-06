import { Box } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export const VEHICLE_MIX_PIE_COLORS = ["#1D4ED8", "#0EA5E9", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"];

export type MixSlice = { name: string; value: number };

export function VehicleMixPieChart({
  slices,
  height = 200,
}: {
  slices: MixSlice[];
  height?: number;
}) {
  const data = slices.filter((s) => s.value > 0);

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
        No classifiable detections for this selection
      </Box>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={52}
          outerRadius={76}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={VEHICLE_MIX_PIE_COLORS[i % VEHICLE_MIX_PIE_COLORS.length]} stroke="rgba(255,255,255,0.9)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.[0] ? (
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
                {Number(payload[0].value ?? 0).toLocaleString()}
              </Box>
            ) : null
          }
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
