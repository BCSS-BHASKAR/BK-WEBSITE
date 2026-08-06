import { Box, Skeleton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { pnp } from "../lib/pnpTheme";

const POLICE_BLUE = pnp.primary;
const POLICE_BLUE_DARK = pnp.primaryDark;

export function HourlyViolationDots({
  data,
  pending,
  onHourClick,
}: {

  data: number[];
  pending?: boolean;
  onHourClick?: (hour: number) => void;
}) {
  const theme = useTheme();
  const maxCount = Math.max(1, ...data);
  const maxColumnDots = 10;
  const dotSize = 10;
  const dotGap = 4;

  if (pending) {
    return <Skeleton variant="rounded" height={170} sx={{ borderRadius: 2 }} />;
  }

  const total = data.reduce((acc, n) => acc + n, 0);
  if (total === 0) {
    return (
      <Box
        sx={{
          height: 170,
          display: "grid",
          placeItems: "center",
          color: "text.secondary",
          fontWeight: 700,
          borderRadius: 2,
          bgcolor: "rgba(2,6,23,0.03)",
        }}
      >
        No violations in this interval
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", minWidth: 0, overflow: "hidden", pb: 0.5 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
          alignItems: "end",
          minHeight: 150,
          gap: 0.5,
        }}
      >
        {data.map((count, h) => {
          const dotsToRender = Math.min(maxColumnDots, count);
          const overflow = Math.max(0, count - maxColumnDots);
          const intensity = count / maxCount;
          return (
            <Box
              key={h}
              role="button"
              tabIndex={onHourClick ? 0 : -1}
              onClick={onHourClick && count > 0 ? () => onHourClick(h) : undefined}
              onKeyDown={
                onHourClick && count > 0
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onHourClick(h);
                      }
                    }
                  : undefined
              }
              sx={{
                display: "flex",
                flexDirection: "column-reverse",
                alignItems: "center",
                gap: `${dotGap}px`,
                cursor: onHourClick && count > 0 ? "pointer" : "default",
                borderRadius: 1.25,
                px: 0.5,
                py: 0.75,
                transition: "background-color 160ms ease",
                "&:hover": count > 0 ? { bgcolor: "rgba(95,141,184,0.08)" } : {},
              }}
            >
              {Array.from({ length: dotsToRender }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: "50%",
                    bgcolor: POLICE_BLUE,
                    opacity: 0.35 + 0.65 * (0.5 + intensity * 0.5),
                    boxShadow: i === dotsToRender - 1 ? `0 0 0 2px rgba(95,141,184,0.16)` : "none",
                  }}
                />
              ))}
              {overflow > 0 ? (
                <Typography
                  sx={{
                    fontSize: 9,
                    fontWeight: 900,
                    color: POLICE_BLUE_DARK,
                    lineHeight: 1,
                  }}
                >
                  +{overflow}
                </Typography>
              ) : null}
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          mt: 0.75,
          display: "grid",
          gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
          gap: 0.5,
        }}
      >
        {Array.from({ length: 24 }).map((_, h) => {
          const showLabel = h % 3 === 0 || h === 23;
          return (
            <Typography
              key={h}
              sx={{
                fontSize: 10,
                fontWeight: 800,
                color: theme.palette.text.secondary,
                textAlign: "center",
                lineHeight: 1.2,
              }}
            >
              {showLabel ? String(h).padStart(2, "0") : ""}
            </Typography>
          );
        })}
      </Box>
    </Box>
  );
}
