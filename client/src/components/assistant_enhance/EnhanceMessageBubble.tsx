import { useState } from "react";
import { Avatar, Box, Typography, IconButton } from "@mui/material";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownOffAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import { chatUi } from "../../lib/chatAssistantTheme";
import { MessageRenderer } from "./MessageRenderer";

interface EnhanceMessageBubbleProps {
  message: {
    id: string;
    role: "user" | "assistant" | "system";
    text: string;
    ts: number;
  };
  userInitials: string;
  onFeedback?: (msgId: string, type: 'thumbs_up' | 'thumbs_down') => void;
}

function formatMsgTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function EnhanceMessageBubble({ message, userInitials, onFeedback }: EnhanceMessageBubbleProps) {
  const isUser = message.role === "user";
  const [feedbackState, setFeedbackState] = useState<'thumbs_up' | 'thumbs_down' | null>(null);

  const handleFeedback = (type: 'thumbs_up' | 'thumbs_down') => {
    if (feedbackState) return;
    setFeedbackState(type);
    if (onFeedback) {
      onFeedback(message.id, type);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: 1.25,
        mb: 2.5,
      }}
    >
      {/* Avatar */}
      {isUser ? (
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: chatUi.primaryDark,
            fontSize: "0.75rem",
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {userInitials}
        </Avatar>
      ) : (
        <Avatar sx={{ width: 36, height: 36, background: chatUi.iconRing, flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
          <SmartToyOutlinedIcon sx={{ fontSize: 20, color: "#fff" }} />
        </Avatar>
      )}

      {/* Bubble Container */}
      <Box sx={{ maxWidth: isUser ? "min(85%, 500px)" : "min(95%, 720px)", minWidth: 0, flex: 1 }}>
        <Box
          sx={{
            borderRadius: isUser ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
            bgcolor: isUser ? chatUi.userBubble : chatUi.botBubble,
            border: isUser ? "none" : chatUi.borderSubtle,
            boxShadow: isUser ? "none" : "0 4px 12px rgba(0,0,0,0.1)",
            py: 1.5,
            px: 2,
            maxWidth: "100%",
            overflow: "hidden",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          <MessageRenderer text={message.text} isUser={isUser} />
        </Box>

        {/* Metadata */}
        {isUser ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5, mt: 0.5, pr: 0.5 }}>
            <Typography sx={{ fontSize: "0.6875rem", color: chatUi.textMuted }}>{formatMsgTime(message.ts)}</Typography>
            <DoneAllIcon sx={{ fontSize: 14, color: chatUi.primary }} />
          </Box>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 1, mt: 0.5, pl: 0.5 }}>
            <Typography sx={{ fontSize: "0.6875rem", color: chatUi.textMuted }}>{formatMsgTime(message.ts)}</Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "rgba(148, 163, 184, 0.4)", display: "flex", alignItems: "center", gap: 0.5 }}>
              •
              <span>Verified Analytics</span>
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <IconButton 
              size="small" 
              onClick={() => handleFeedback('thumbs_up')} 
              sx={{ color: feedbackState === 'thumbs_up' ? chatUi.primary : chatUi.textMuted, p: 0.5 }}
              disabled={feedbackState !== null}
            >
              <ThumbUpOffAltIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <IconButton 
              size="small" 
              onClick={() => handleFeedback('thumbs_down')} 
              sx={{ color: feedbackState === 'thumbs_down' ? '#ef4444' : chatUi.textMuted, p: 0.5 }}
              disabled={feedbackState !== null}
            >
              <ThumbDownOffAltIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        )}
      </Box>
    </Box>
  );
}
