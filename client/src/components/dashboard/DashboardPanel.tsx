import type { ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { contentCardSx } from "../../lib/uiSurfaces";
import { pnp, pnpFont } from "../../lib/pnpTheme";

type IconTone = "primary" | "green" | "purple" | "danger";

// Same tokens the KPI tiles use, so a panel icon matches the tile it belongs to.
const iconToneSx: Record<IconTone, { bg: string; color: string }> = {
  primary: { bg: pnp.primarySoft, color: pnp.primary },
  green: { bg: pnp.successSoft, color: pnp.success },
  purple: { bg: pnp.purpleSoft, color: pnp.purple },
  danger: { bg: pnp.dangerSoft, color: pnp.danger },
};

type Props = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  iconTone?: IconTone;
  action?: ReactNode;
  headerLink?: { label: string; onClick: () => void };
  footerLink?: { label: string; onClick: () => void };
  children: ReactNode;
  sx?: object;
  dark?: boolean;
  minHeight?: number | string;
};

export function DashboardPanel({
  title,
  subtitle,
  icon,
  iconTone = "primary",
  action,
  headerLink,
  footerLink,
  children,
  sx,
  dark,
  minHeight,
}: Props) {
  const isBrand = dark;
  const showHeader = Boolean(title || subtitle || icon || action || headerLink);

  return (
    <Paper
      elevation={0}
      sx={{
        ...contentCardSx,
        p: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
        minHeight: minHeight ?? 0,
        ...(dark
          ? {
              bgcolor: pnp.mapDark,
              border: "1px solid rgba(59, 130, 246, 0.22)",
              color: "#F8FAFC",
              boxShadow: "0 8px 32px rgba(2, 6, 23, 0.35)",
            }
          : {}),
        ...sx,
      }}
    >
      {showHeader ? (
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, mb: 1.5, flexShrink: 0, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, minWidth: 0 }}>
            {icon ? (
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "9px",
                  bgcolor: iconToneSx[iconTone].bg,
                  color: iconToneSx[iconTone].color,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {icon}
              </Box>
            ) : null}
            <Box>
              {title ? (
                <Typography sx={{ ...(isBrand ? { color: "#F8FAFC", fontSize: "0.875rem", fontWeight: 700 } : pnpFont.cardTitle) }}>{title}</Typography>
              ) : null}
              {subtitle ? (
                <Typography sx={{ ...(isBrand ? { color: "rgba(148,163,184,0.9)", fontSize: "0.75rem", mt: 0.25 } : { ...pnpFont.cardSubtitle, mt: title ? 0.25 : 0 }) }}>
                  {subtitle}
                </Typography>
              ) : null}
            </Box>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            {action}
            {headerLink ? (
              <Typography
                component="button"
                type="button"
                onClick={headerLink.onClick}
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: pnp.primary,
                  border: "none",
                  bgcolor: "transparent",
                  cursor: "pointer",
                  p: 0,
                  font: "inherit",
                  whiteSpace: "nowrap",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {headerLink.label}
              </Typography>
            ) : null}
          </Box>
        </Box>
      ) : null}
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</Box>
      {footerLink ? (
        <Box sx={{ mt: 1.5, pt: 1, borderTop: "1px solid rgba(15,23,42,0.06)", flexShrink: 0 }}>
          <Typography
            component="button"
            type="button"
            onClick={footerLink.onClick}
            sx={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: pnp.primary,
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
              p: 0,
              font: "inherit",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {footerLink.label}
          </Typography>
        </Box>
      ) : null}
    </Paper>
  );
}
