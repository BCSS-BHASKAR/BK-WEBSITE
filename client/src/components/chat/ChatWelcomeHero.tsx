import { Avatar, Box, Typography } from "@mui/material";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { chatUi } from "../../lib/chatAssistantTheme";

const QUICK_ACTIONS = [
  { label: "Situation today", message: "situation today" },
  { label: "Violations at Highway", message: "violations at Highway today" },
  { label: "Wrong Parking", message: "wrong parking today" },
];

export function ChatWelcomeHero({
  displayName,
  onPrompt,
}: {
  displayName: string;
  onPrompt: (message: string) => void;
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
          I&apos;m your Data Assistant. I can help you find insights from plate reads, traffic data, watchlists, and
          violations across all sites.
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {QUICK_ACTIONS.map((a) => (
            <Box
              key={a.label}
              component="button"
              type="button"
              onClick={() => onPrompt(a.message)}
              sx={{
                border: `1px solid rgba(59, 130, 246, 0.45)`,
                borderRadius: "999px",
                px: 1.75,
                py: 0.75,
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: chatUi.primary,
                bgcolor: chatUi.primarySoft,
                cursor: "pointer",
                transition: "all 0.15s",
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
