
// Biryani Katha brand palette, taken verbatim from the :root custom properties
// on biryanikatha.com:
//   --green #3E5626   --mustard #C08529   --cream #FADD9D   --grey #DFDFDF
// plus the secondary leaf green #3E7D2C used on the site's accents.
//
// Only the brand-bearing surfaces move to these values - sidebar, footer, nav
// active state, primary accents. The enterprise dashboard's card/table/page
// structure is unchanged; this is a repalette, not a redesign.
export const brand = {
  green: "#3E5626",
  greenDeep: "#2C3D1B",
  greenLeaf: "#3E7D2C",
  mustard: "#C08529",
  mustardDark: "#8F6119",
  cream: "#FADD9D",
  grey: "#DFDFDF",
} as const;

export const pnp = {

  navy: brand.green,
  navySidebar: brand.green,
  navyMuted: "#4A6630",
  pageBg: "#FAF8F2",
  headerBg: "#FFFFFF",
  footerBg: brand.greenDeep,

  cardBg: "#FFFFFF",
  cardRadius: 10,
  cardBorder: "1px solid rgba(62, 86, 38, 0.12)",
  cardShadow: "0 1px 3px rgba(44, 61, 27, 0.07), 0 4px 16px rgba(44, 61, 27, 0.05)",

  primary: brand.mustard,
  primaryDark: brand.mustardDark,
  primarySoft: "#FDF4DF",
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

  text: "#1F2A16",
  textSecondary: "#5F6B52",
  textMuted: "#95A088",

  // Weighted toward the dark end of the mustard so white nav text clears 4.5:1
  // across the whole pill - the brightest brand mustard alone only reaches
  // ~3.2:1 against white, which the sidebar's 14px label cannot carry.
  navActiveGradient: `linear-gradient(90deg, #7A5415 0%, ${brand.mustardDark} 60%, #A8731F 100%)`,
  navActiveBar: brand.cream,
  navText: "rgba(245, 245, 235, 0.9)",
  navTextMuted: "rgba(222, 226, 210, 0.85)",

  loginBg: "#243117",
  mapDark: brand.greenDeep,

  kpiBlue: brand.mustard,
  kpiGreen: brand.greenLeaf,
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
  boxShadow: selected ? "0 4px 14px rgba(143, 97, 25, 0.38)" : "none",
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
    bgcolor: selected ? undefined : "rgba(250, 221, 157, 0.12)",
    background: selected ? pnp.navActiveGradient : "rgba(250, 221, 157, 0.12)",
  },
  "& .MuiListItemIcon-root": {
    color: "inherit",
    minWidth: 38,
  },
});
