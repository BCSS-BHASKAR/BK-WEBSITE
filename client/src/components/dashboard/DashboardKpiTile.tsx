import type { ReactNode } from "react";
import { Box, ButtonBase, Paper, Skeleton, Typography } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import { contentCardSx } from "../../lib/uiSurfaces";
import { pnp, pnpFont } from "../../lib/pnpTheme";

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
  footnote?: string;
  icon: ReactNode;
  accent: string;
  iconBg?: string;
  pending?: boolean;
  onClick?: () => void;
};

export function DashboardKpiTile({ label, value, hint, footnote, icon, accent, iconBg, pending, onClick }: Props) {
  const trendUp = hint?.includes("↑");
  const trendDown = hint?.includes("↓");
  const operational = hint?.includes("operational");
  const trendColor = trendUp || operational ? pnp.success : trendDown ? pnp.danger : pnp.textSecondary;

  const inner = (
    <Paper elevation={0} sx={{ ...contentCardSx, p: 2, height: "100%", minHeight: 128, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          bgcolor: iconBg ?? `${accent}14`,
          color: accent,
          mb: 1.25,
          "& .MuiSvgIcon-root": { fontSize: 24 },
        }}
      >
        {icon}
      </Box>
      <Typography sx={pnpFont.kpiLabel}>{label}</Typography>
      {pending ? (
        <Skeleton width={88} height={34} sx={{ mt: 0.75 }} />
      ) : (
        <Typography sx={{ ...pnpFont.kpiValue, mt: 0.5 }}>{value}</Typography>
      )}
      {hint ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, mt: 0.75 }}>
          {trendUp ? <TrendingUpIcon sx={{ fontSize: 15, color: pnp.success }} /> : null}
          {trendDown ? <TrendingDownIcon sx={{ fontSize: 15, color: pnp.danger }} /> : null}
          <Typography sx={{ ...pnpFont.kpiTrend, color: trendColor }}>{hint}</Typography>
        </Box>
      ) : null}
      {footnote ? (
        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: pnp.textMuted, mt: 0.5, lineHeight: 1.35 }}>
          {footnote}
        </Typography>
      ) : null}
    </Paper>
  );

  if (!onClick) return inner;
  return (
    <ButtonBase onClick={onClick} sx={{ display: "block", width: "100%", height: "100%", textAlign: "left", borderRadius: `${pnp.cardRadius}px` }}>
      {inner}
    </ButtonBase>
  );
}
