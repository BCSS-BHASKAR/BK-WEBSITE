import { useId } from "react";
import { Box } from "@mui/material";

export function MiniLineChart({
  data,
  height = 44,
  width = 160,
}: {
  data: number[];
  height?: number;
  width?: number;
}) {
  const gradId = useId().replace(/:/g, "");
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const pts = data
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${width} ${height}`}
      sx={{ width, height, display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#0EA5E9" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Box>
  );
}
