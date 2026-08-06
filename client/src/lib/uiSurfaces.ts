import type { SxProps, Theme } from "@mui/material";
import { pnp } from "./pnpTheme";

export const ui = {

  mastheadContentGap: { xs: 2, md: 2.5 },
  pageGap: 2.5,
  sectionGap: 2,
  gridGap: 1.5,
  cardPad: { xs: 2, sm: 2.25 },
  cardRadius: `${pnp.cardRadius}px`,
  maxContentWidth: 1680,
} as const;

export const pageLayoutSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  gap: ui.pageGap,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  boxSizing: "border-box",
};

export const gridCols = (n: number) => `repeat(${n}, minmax(0, 1fr))` as const;

export const contentCardSx: SxProps<Theme> = {
  p: ui.cardPad,
  borderRadius: ui.cardRadius,
  border: pnp.cardBorder,
  bgcolor: pnp.cardBg,
  boxShadow: pnp.cardShadow,
};

export const chartPanelSx: SxProps<Theme> = {
  ...contentCardSx,
};

export const summaryCardSx: SxProps<Theme> = {
  p: 2,
  height: "100%",
  borderRadius: ui.cardRadius,
  border: pnp.cardBorder,
  bgcolor: pnp.cardBg,
  boxShadow: pnp.cardShadow,
};

export const statTileSx: SxProps<Theme> = {
  p: 1.5,
  borderRadius: "8px",
  border: pnp.cardBorder,
  bgcolor: pnp.cardBg,
  boxShadow: "0 1px 2px rgba(10, 25, 49, 0.04)",
};

export const listRowSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 1.25,
  p: 1.25,
  borderRadius: "8px",
  border: "1px solid rgba(15, 23, 42, 0.06)",
  bgcolor: pnp.cardBg,
  textAlign: "left",
  transition: "background-color 160ms ease, box-shadow 160ms ease",
  "&:hover": { bgcolor: pnp.primarySoft, boxShadow: "0 2px 8px rgba(37, 99, 235, 0.08)" },
};
