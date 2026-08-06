import { createTheme } from "@mui/material/styles";
import { pnp } from "./lib/pnpTheme";

const easeOut = "cubic-bezier(0.22, 1, 0.36, 1)";
const reducedMotion = "@media (prefers-reduced-motion: reduce)";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: pnp.primary, light: "#D9AE45", dark: pnp.primaryDark, contrastText: "#FFFFFF" },
    secondary: { main: pnp.navy, light: "#7E3F5B", dark: "#3B0E1B", contrastText: "#FFFFFF" },
    info: { main: "#7E3F5B", light: "#A0688A", dark: "#5E1A2B", contrastText: "#FFFFFF" },
    success: { main: pnp.success, light: "#4ADE80", dark: "#166534", contrastText: "#FFFFFF" },
    error: { main: pnp.danger, light: "#E57373", dark: "#8C1D18", contrastText: "#FFFFFF" },
    warning: { main: pnp.warning, light: "#FB923C", dark: "#9A3412", contrastText: "#FFFFFF" },
    background: { default: pnp.pageBg, paper: pnp.cardBg },
    text: { primary: pnp.text, secondary: pnp.textSecondary },
    divider: "rgba(74, 18, 32, 0.1)",
  },
  shape: { borderRadius: pnp.cardRadius },
  typography: {
    fontFamily: ['"Inter"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"].join(","),
    fontSize: 14,
    body1: { fontSize: "0.875rem", lineHeight: 1.5 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.45 },
    h3: { fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.2, fontSize: "1.5rem" },
    h4: { fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.22, fontSize: "1.25rem" },
    h5: { fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25, fontSize: "1.0625rem" },
    h6: { fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.3, fontSize: "0.9375rem" },
    subtitle1: { fontWeight: 600, fontSize: "0.9375rem" },
    subtitle2: { fontWeight: 600, fontSize: "0.8125rem" },
    button: { fontWeight: 600, fontSize: "0.875rem", textTransform: "none" },
    overline: { fontWeight: 700, fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase" },
  },
  transitions: {
    duration: { standard: 200, enteringScreen: 240, leavingScreen: 160 },
    easing: { easeOut, sharp: "cubic-bezier(0.4, 0, 0.6, 1)" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: pnp.pageBg, WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" },
        "::selection": { backgroundColor: "rgba(184, 134, 11, 0.24)", color: pnp.text },
        "#root": { minHeight: "100%" },
        [reducedMotion]: {
          "*": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: pnp.cardRadius,
          border: pnp.cardBorder,
          boxShadow: pnp.cardShadow,
          backgroundImage: "none",
          backgroundColor: pnp.cardBg,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: pnp.cardRadius,
          border: pnp.cardBorder,
          boxShadow: pnp.cardShadow,
          [reducedMotion]: { transition: "none" },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", borderRadius: pnp.cardRadius, fontWeight: 600, [reducedMotion]: { transition: "none" } },
      },
      variants: [
        {
          props: { variant: "contained", color: "primary" },
          style: {
            backgroundImage: "linear-gradient(180deg, #D9AE45 0%, #B8860B 100%)",
            boxShadow: "0 2px 8px rgba(184, 134, 11, 0.3)",
            "&:hover": { backgroundImage: "linear-gradient(180deg, #B8860B 0%, #946A08 100%)" },
          },
        },
      ],
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 6 } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: pnp.cardRadius,
          background: "#FFFFFF",
          "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(184, 134, 11, 0.2)" },
        },
      },
    },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: pnp.cardRadius } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: pnp.cardRadius } } },
  },
});

