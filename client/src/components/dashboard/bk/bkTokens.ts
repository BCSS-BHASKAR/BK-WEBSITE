import type { SxProps, Theme } from "@mui/material";

/**
 * Design tokens for the Biryani Katha dashboard.
 *
 * The rest of the console runs on the maroon/gold `pnp` palette. This dashboard
 * was redesigned on a green/cream scheme, so its values live here rather than in
 * pnpTheme - importing them from there would either force a global recolour or
 * leave this file quietly overriding half of it. Nothing outside
 * components/dashboard/bk reads these.
 *
 * Cards are plain `Box`, never `Paper`. The global MuiPaper override stamps the
 * maroon border, a 10px radius and the maroon shadow onto every Paper in the
 * app, so a Paper here would have to unset three properties before setting its
 * own. A Box starts from nothing.
 */
export const bk = {
  // Surfaces
  ground: "#FAF7F1",
  card: "#FFFFFF",
  /** The value-props strip, which sits a shade off-white against the cards. */
  cardMuted: "#F8F7F2",
  line: "rgba(23, 59, 33, 0.10)",
  lineSoft: "rgba(23, 59, 33, 0.06)",
  shadow: "0 1px 2px rgba(22, 53, 28, 0.05), 0 4px 14px rgba(22, 53, 28, 0.05)",
  radius: 12,
  radiusSm: 8,

  // Ink
  ink: "#1E2A1F",
  muted: "#6E7A6C",
  faint: "#98A296",

  // Brand greens
  greenDeep: "#16351C",
  green: "#2F7D3E",
  greenBright: "#2E9E4F",
  greenSoft: "#E4F0E6",

  // Categorical accents, one hue per concern, assigned by identity never by rank
  orange: "#E0761A",
  orangeSoft: "#FDEEDF",
  purple: "#7C4DBE",
  purpleSoft: "#EFE8FA",
  red: "#C0392B",
  redSoft: "#FBE7E5",
  amber: "#E0A03A",
  amberSoft: "#FDF2E0",

  // Status
  up: "#1E8E3E",
  down: "#C0392B",
} as const;

/** The white panel every dashboard section is drawn on. */
export const bkCardSx: SxProps<Theme> = {
  bgcolor: bk.card,
  border: `1px solid ${bk.line}`,
  borderRadius: `${bk.radius}px`,
  boxShadow: bk.shadow,
  minWidth: 0,
  boxSizing: "border-box",
};

/** Section heading inside a card: 15px/700 beside a small tinted glyph. */
export const bkPanelTitleSx: SxProps<Theme> = {
  fontSize: "0.9375rem",
  fontWeight: 700,
  color: bk.ink,
  letterSpacing: "-0.01em",
  lineHeight: 1.3,
};

/** The red "View All …" link that closes three of the panels. */
export const bkFooterLinkSx: SxProps<Theme> = {
  display: "block",
  width: "100%",
  textAlign: "center",
  fontSize: "0.8125rem",
  fontWeight: 700,
  color: bk.red,
  textDecoration: "none",
  background: "none",
  border: 0,
  cursor: "pointer",
  py: 0.5,
  borderRadius: `${bk.radiusSm}px`,
  fontFamily: "inherit",
  "&:hover": { textDecoration: "underline", bgcolor: bk.redSoft },
};

/** Grid gutter used between every card on the page. */
export const BK_GAP = 2;
