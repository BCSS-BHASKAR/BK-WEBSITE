/**
 * Palette for the navigation rail.
 *
 * The rail is the one surface the Biryani Katha design paints deep green; the
 * rest of the console still runs on the maroon/gold `pnp` palette, so these
 * values live here rather than replacing pnp.navy* in place. Only AppShell
 * reads them - the maroon nav* keys in pnpTheme are now unreferenced and can be
 * removed whenever that file is next touched.
 */
export const rail = {
  /** Deep green ground. A shallow gradient, not flat, so the rail has depth. */
  bg: "linear-gradient(180deg, #173C14 0%, #133310 45%, #0E2A0C 100%)",
  /** Flat equivalent, for surfaces that cannot take a gradient. */
  bgSolid: "#133310",
  border: "rgba(233, 199, 103, 0.14)",
  divider: "rgba(255, 255, 255, 0.10)",

  /** Active row: a filled pill, no left accent bar - the design has none. */
  activeFill: "linear-gradient(90deg, #2F7A33 0%, #276A2C 100%)",
  activeShadow: "0 4px 14px rgba(0, 0, 0, 0.30)",
  activeText: "#FFFFFF",
  /** The active row's icon is gold in the design, not white. */
  activeIcon: "#F0C948",

  hover: "rgba(255, 255, 255, 0.07)",

  text: "rgba(240, 244, 232, 0.88)",
  textMuted: "rgba(240, 244, 232, 0.62)",
  caption: "rgba(240, 244, 232, 0.42)",
  icon: "rgba(240, 244, 232, 0.78)",

  gold: "#E9C767",
  cream: "#F3EFE0",
} as const;

export const railSidebarBg = rail.bgSolid;

/** One nav row. Shape only - AppShell layers density and indentation on top. */
export const railNavItemSx = (selected: boolean) => ({
  position: "relative" as const,
  borderRadius: "10px",
  mb: 0.5,
  minHeight: 42,
  px: 1.5,
  py: 1,
  bgcolor: "transparent",
  background: selected ? rail.activeFill : "transparent",
  color: selected ? rail.activeText : rail.text,
  boxShadow: selected ? rail.activeShadow : "none",
  "&:hover": {
    background: selected ? rail.activeFill : rail.hover,
  },
  "& .MuiListItemIcon-root": {
    color: selected ? rail.activeIcon : rail.icon,
    minWidth: 38,
  },
});
