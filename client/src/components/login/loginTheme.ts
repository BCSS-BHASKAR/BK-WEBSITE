

const base = import.meta.env.BASE_URL;

/**
 * Sign-in palette.
 *
 * Green over gold, matching the navigation rail and the dashboard rather than
 * the maroon the console used to run on - the sign-in page is the first thing
 * anyone sees, so it setting a different brand from the app behind it was the
 * one place the recolour could not be skipped.
 *
 * Gold is kept as the accent. It is what the Biryani Katha badge is drawn in and
 * what the rail's active row uses, so it is the brand's accent on green, not a
 * leftover from the maroon scheme.
 */
export const loginPalette = {
  /** Page ground, behind both panels. */
  ground: "#0B220A",
  panelTop: "#173C14",
  panelMid: "#133310",
  panelDeep: "#0B220A",

  gold: "#E9C767",
  goldBright: "#F0C948",
  goldDeep: "#B9861C",
  cream: "#F3EFE0",
  creamMuted: "rgba(240, 244, 232, 0.86)",
  creamFaint: "rgba(240, 244, 232, 0.62)",

  /** Focus ring and the primary button. */
  accent: "#2F7D3E",
  accentDeep: "#16351C",
  accentMid: "#1F4A28",

  hairline: "rgba(233, 199, 103, 0.20)",
  tint: "rgba(233, 199, 103, 0.12)",
} as const;

/** @deprecated Use `loginPalette.ground`. Kept so nothing outside this folder breaks. */
export const loginNavy = loginPalette.ground;

export const LOGIN_HERO_IMAGE = `${base}LoginHero.jpg`;
export const LOGIN_FLAG_IMAGE = `${base}LoginFlag.png`;

export const loginPanelBg =
  `radial-gradient(ellipse 100% 55% at 12% 0%, rgba(233, 199, 103, 0.16) 0%, transparent 52%), radial-gradient(ellipse 70% 45% at 92% 100%, rgba(47, 125, 62, 0.22) 0%, transparent 48%), linear-gradient(165deg, ${loginPalette.panelTop} 0%, ${loginPalette.panelMid} 45%, ${loginPalette.panelDeep} 100%)`;

export const loginGlassCard = {
  bgcolor: "rgba(255, 255, 255, 0.9)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  border: "1px solid rgba(255, 255, 255, 0.78)",
  boxShadow:
    "0 0 0 1px rgba(255,255,255,0.45) inset, 0 28px 72px rgba(2, 6, 23, 0.42), 0 8px 24px rgba(15, 23, 42, 0.18)",
};

export const loginMiniCard = {
  bgcolor: "rgba(11, 34, 10, 0.72)",
  border: `1px solid ${loginPalette.hairline}`,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "inset 0 1px 0 rgba(240, 201, 72, 0.08)",
};

export const loginHeroBackground = {
  position: "relative" as const,
  overflow: "hidden" as const,
  bgcolor: loginPalette.panelMid,
};

export const loginFutureMuted = "#94A3B8";
export const loginFutureText = "#64748B";

export const loginFutureLabelSx = {
  color: loginFutureText,
  cursor: "not-allowed",
};

export const loginFutureControlSx = {
  cursor: "not-allowed",
  userSelect: "none" as const,
  "&.Mui-disabled": {
    opacity: 1,
    cursor: "not-allowed",
  },
  "& .MuiFormControlLabel-label.Mui-disabled": {
    color: loginFutureText,
  },
  "& .MuiCheckbox-root.Mui-disabled": {
    color: loginFutureMuted,
  },
  "& .MuiOutlinedInput-root.Mui-disabled": {
    opacity: 1,
    bgcolor: "#F1F5F9",
    "& fieldset": { borderColor: "rgba(148, 163, 184, 0.4)" },
  },
  "& .MuiSelect-select.Mui-disabled": {
    color: loginFutureText,
    WebkitTextFillColor: loginFutureText,
  },
};

export const loginFutureLinkSx = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: loginFutureMuted,
  cursor: "not-allowed",
  pointerEvents: "none" as const,
  textDecoration: "none",
};

export const loginFutureButtonSx = {
  flex: 1,
  minWidth: 0,
  py: 1,
  fontSize: "0.625rem",
  fontWeight: 700,
  borderRadius: 1.5,
  textTransform: "none" as const,
  flexDirection: "column" as const,
  gap: 0.25,
  cursor: "not-allowed",
  "&.Mui-disabled": {
    opacity: 1,
    color: loginFutureText,
    borderColor: "rgba(148, 163, 184, 0.45)",
    bgcolor: "#F8FAFC",
  },
  "& .MuiButton-startIcon": { m: 0, color: loginFutureMuted },
};
