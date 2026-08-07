

const base = import.meta.env.BASE_URL;

export const loginNavy = "#243117";

export const LOGIN_HERO_IMAGE = `${base}LoginHero.jpg`;
export const LOGIN_FLAG_IMAGE = `${base}LoginFlag.png`;

export const loginPanelBg =
  "radial-gradient(ellipse 100% 55% at 12% 0%, rgba(217, 174, 69, 0.18) 0%, transparent 52%), radial-gradient(ellipse 70% 45% at 92% 100%, rgba(194, 65, 12, 0.14) 0%, transparent 48%), linear-gradient(165deg, #243117 0%, #3E5626 42%, #2C3D1B 100%)";

export const loginGlassCard = {
  bgcolor: "rgba(255, 255, 255, 0.9)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  border: "1px solid rgba(255, 255, 255, 0.78)",
  boxShadow:
    "0 0 0 1px rgba(255,255,255,0.45) inset, 0 28px 72px rgba(2, 6, 23, 0.42), 0 8px 24px rgba(15, 23, 42, 0.18)",
};

export const loginMiniCard = {
  bgcolor: "rgba(43, 8, 16, 0.72)",
  border: "1px solid rgba(217, 174, 69, 0.24)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "inset 0 1px 0 rgba(242, 214, 138, 0.08)",
};

export const loginHeroBackground = {
  position: "relative" as const,
  overflow: "hidden" as const,
  bgcolor: "#2C3D1B",
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
