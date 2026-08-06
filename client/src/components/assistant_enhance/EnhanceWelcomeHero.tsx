import { Avatar, Box, Typography } from "@mui/material";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { chatUi } from "../../lib/chatAssistantTheme";

const QUICK_ACTIONS = [
  { label: "Walk-ins Today", message: "How many walk-ins were recorded today?" },
  { label: "Alerts Today", message: "Show me all alerts today." },
  { label: "Peak Hour", message: "What was the peak walk-in hour today?" },
  { label: "Daily Report", message: null },
];

export function EnhanceWelcomeHero({
  displayName,
  onPrompt,
  onDailyReport,
  disabled = false,
}: {
  displayName: string;
  onPrompt: (message: string) => void;
  onDailyReport?: () => void;
  disabled?: boolean;
}) {
  return (
    <Box
      sx={{
        borderRadius: chatUi.radius,
        border: chatUi.border,
        bgcolor: chatUi.surface,
        p: 2.5,
        mb: 2.5,
        display: "flex",
        gap: 2,
        alignItems: "flex-start",
      }}
    >
      <Avatar
        sx={{
          width: 56,
          height: 56,
          background: chatUi.iconRing,
          boxShadow: "0 0 28px rgba(59, 130, 246, 0.45)",
          flexShrink: 0,
        }}
      >
        <SmartToyOutlinedIcon sx={{ fontSize: 30, color: "#fff" }} />
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: "1.125rem", color: chatUi.text, mb: 0.75 }}>
          Hello, {displayName}! 👋
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", color: chatUi.textSecondary, lineHeight: 1.55, mb: 2 }}>
          I&apos;m the Biryani Katha assistant. Ask about guest footfall, kitchen staffing,
          security alerts, and camera areas — answers come directly from your database.
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {QUICK_ACTIONS.map((a) => (
            <Box
              key={a.label}
              component="button"
              type="button"
              onClick={() => {
                if (disabled) return;
                if (a.message === null) onDailyReport?.();
                else onPrompt(a.message);
              }}
              disabled={disabled}
              sx={{
                border: `1px solid rgba(59, 130, 246, 0.45)`,
                borderRadius: "999px",
                px: 1.75,
                py: 0.75,
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: chatUi.primary,
                bgcolor: chatUi.primarySoft,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                transition: "all 0.15s",
                whiteSpace: "nowrap",
                "&:hover": {
                  bgcolor: "rgba(59, 130, 246, 0.28)",
                  borderColor: chatUi.primary,
                },
              }}
            >
              {a.label}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
