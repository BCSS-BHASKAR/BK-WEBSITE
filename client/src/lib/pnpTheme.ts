
export const pnp = {

  navy: "#4A1220",
  navySidebar: "#4A1220",
  navyMuted: "#5E1A2B",
  pageBg: "#FAF7F2",
  headerBg: "#FFFFFF",
  footerBg: "#3B0E1B",

  cardBg: "#FFFFFF",
  cardRadius: 10,
  cardBorder: "1px solid rgba(74, 18, 32, 0.09)",
  cardShadow: "0 1px 3px rgba(59, 14, 27, 0.07), 0 4px 16px rgba(59, 14, 27, 0.05)",

  primary: "#B8860B",
  primaryDark: "#946A08",
  primarySoft: "#FBF3DE",
  success: "#15803D",
  successSoft: "#DCFCE7",
  danger: "#B3261E",
  dangerSoft: "#FBE9E7",
  warning: "#C2410C",
  warningSoft: "#FFEDD5",
  purple: "#7E3F5B",
  purpleSoft: "#F7EAF0",
  amber: "#D9AE45",
  amberSoft: "#FEF6E0",

  text: "#2A1A12",
  textSecondary: "#7A6455",
  textMuted: "#A8968A",

  navActiveGradient: "linear-gradient(90deg, #946A08 0%, #B8860B 55%, #D9AE45 100%)",
  navActiveBar: "#F2D68A",
  navText: "rgba(245, 232, 214, 0.9)",
  navTextMuted: "rgba(214, 191, 165, 0.85)",

  loginBg: "#2B0810",
  mapDark: "#3B0E1B",

  kpiBlue: "#B8860B",
  kpiGreen: "#15803D",
  kpiRed: "#B3261E",
  kpiPurple: "#7E3F5B",
  kpiOrange: "#C2410C",
} as const;

export const pnpSidebarBg = pnp.navySidebar;

export const pnpFont = {
  family: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  kpiLabel: { fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.35, color: pnp.textSecondary },
  kpiValue: { fontSize: "1.75rem", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: pnp.text },
  kpiTrend: { fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.3 },
  cardTitle: { fontSize: "0.875rem", fontWeight: 700, lineHeight: 1.35, color: pnp.text },
  cardSubtitle: { fontSize: "0.75rem", fontWeight: 500, lineHeight: 1.4, color: pnp.textSecondary },
  pageTitle: { fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, color: pnp.text },
  pageSubtitle: { fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.45, color: pnp.textSecondary },
} as const;

export const pnpNavItemSx = (selected: boolean) => ({
  position: "relative" as const,
  borderRadius: "8px",
  mb: 0.5,
  minHeight: 42,
  px: 1.5,
  py: 1,
  bgcolor: selected ? "transparent" : "transparent",
  background: selected ? pnp.navActiveGradient : "transparent",
  color: selected ? "#FFFFFF" : pnp.navText,
  boxShadow: selected ? "0 4px 14px rgba(184, 134, 11, 0.35)" : "none",
  "&::before": selected
    ? {
        content: '""',
        position: "absolute",
        left: 0,
        top: "20%",
        bottom: "20%",
        width: 4,
        borderRadius: "0 4px 4px 0",
        bgcolor: pnp.navActiveBar,
      }
    : {},
  "&:hover": {
    bgcolor: selected ? undefined : "rgba(242, 214, 138, 0.1)",
    background: selected ? pnp.navActiveGradient : "rgba(242, 214, 138, 0.1)",
  },
  "& .MuiListItemIcon-root": {
    color: "inherit",
    minWidth: 38,
  },
});
