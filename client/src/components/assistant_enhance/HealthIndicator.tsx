import { Box, Typography } from "@mui/material";
import { chatUi } from "../../lib/chatAssistantTheme";
import type { EnhanceHealthStatus } from "../../lib/assistant_enhance/types";

const STATE: Record<
  EnhanceHealthStatus,
  { label: string; color: string; pulse?: boolean }
> = {
  connected: { label: "Connected", color: chatUi.success },
  connecting: { label: "Connecting", color: chatUi.warning, pulse: true },
  unavailable: { label: "Unavailable", color: "#EF4444" },
};

export function HealthIndicator({ status }: { status: EnhanceHealthStatus }) {
  const cfg = STATE[status];
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          bgcolor: cfg.color,
          boxShadow: status === "connected" ? `0 0 8px ${cfg.color}` : "none",
          animation: cfg.pulse ? "enhancePulse 1.4s ease-in-out infinite" : "none",
          "@keyframes enhancePulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.35 },
          },
        }}
      />
      <Typography sx={{ fontSize: "0.75rem", color: chatUi.textMuted, fontWeight: 600 }}>
        {cfg.label}
      </Typography>
    </Box>
  );
}
