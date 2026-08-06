
export const chatUi = {
  panelBg: "#0B1220",
  surface: "#131C2E",
  surfaceElevated: "#1A2438",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  borderSubtle: "1px solid rgba(148, 163, 184, 0.08)",
  text: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  primary: "#3B82F6",
  primaryDark: "#2563EB",
  primarySoft: "rgba(59, 130, 246, 0.15)",
  userBubble: "#2563EB",
  botBubble: "#1E293B",
  inputBg: "#0F172A",
  iconRing: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
  success: "#22C55E",
  successSoft: "rgba(34, 197, 94, 0.15)",
  warning: "#F59E0B",
  radius: "12px",
  radiusSm: "8px",
} as const;

export const chatCardSx = {
  p: 2,
  borderRadius: chatUi.radius,
  border: chatUi.border,
  bgcolor: chatUi.surfaceElevated,
  color: chatUi.text,
} as const;
