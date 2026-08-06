import { Box, Typography } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

// Generic donut slice — used for severity bands and for alert-type mixes.
export type DonutSlice = {
  key: string;
  name: string;
  value: number;
  color: string;
};

type Props = {
  slices: DonutSlice[];
  height?: number;
  emptyLabel?: string;
};

export function CrowdSeverityPieChart({ slices, height = 200, emptyLabel = "No data for this selection" }: Props) {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);
  const chartHeight = Math.max(150, height - 44);

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
    <Box sx={{ width: "100%" }}>
      <ResponsiveContainer width="100%" height={chartHeight}>
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
            {data.map((slice) => (
              <Cell key={slice.key} fill={slice.color} stroke="rgba(255,255,255,0.92)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const slice = payload[0].payload as DonutSlice;
              const pct = total > 0 ? ((slice.value / total) * 100).toFixed(0) : "0";
              return (
                <Box
                  sx={{
                    bgcolor: "background.paper",
                    border: "1px solid rgba(15,23,42,0.1)",
                    borderRadius: 1.5,
                    px: 1.25,
                    py: 0.85,
                    boxShadow: "0 8px 24px rgba(2,6,23,0.12)",
                    minWidth: 140,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.35 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: slice.color, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 900 }}>{slice.name}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
                    {slice.value.toLocaleString()} alert{slice.value === 1 ? "" : "s"} · {pct}%
                  </Typography>
                </Box>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", px: 0.5, pt: 0.75 }}>
        {data.map((slice) => (
          <Box key={slice.key} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: slice.color, flexShrink: 0 }} />
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, color: "text.secondary" }}>
              {slice.name}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
