import { Box, Typography } from "@mui/material";
import { chatUi } from "../../lib/chatAssistantTheme";

export function TypingIndicator({ label = "Analyzing" }: { label?: string }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
      <Typography sx={{ fontSize: "0.875rem", color: chatUi.textSecondary }}>{label}</Typography>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            bgcolor: chatUi.primary,
            animation: "enhanceTyping 1.2s infinite",
            animationDelay: `${i * 0.2}s`,
            "@keyframes enhanceTyping": {
              "0%, 80%, 100%": { opacity: 0.25, transform: "translateY(0)" },
              "40%": { opacity: 1, transform: "translateY(-3px)" },
            },
          }}
        />
      ))}
    </Box>
  );
}
