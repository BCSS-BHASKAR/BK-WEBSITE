import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, Avatar, Box, IconButton, TextField, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  checkEnhanceHealth,
  extractAnswer,
  mapEnhanceError,
  postEnhanceChat,
  postEnhanceFeedback,
  UNAVAILABLE_MESSAGE,
} from "../lib/assistant_enhance/api";
import { loadSessionId, resetSessionId } from "../lib/assistant_enhance/session";
import type { EnhanceMessage } from "../lib/assistant_enhance/types";
import { EnhanceWelcomeHero } from "../components/assistant_enhance/EnhanceWelcomeHero";
import { EnhanceAssistantSidebar } from "../components/assistant_enhance/EnhanceAssistantSidebar";
import { TypingIndicator } from "../components/assistant_enhance/TypingIndicator";
import { EnhanceMessageBubble } from "../components/assistant_enhance/EnhanceMessageBubble";
import { useAuth } from "../auth/AuthContext";
import { chatUi } from "../lib/chatAssistantTheme";
import { ui } from "../lib/uiSurfaces";

function newMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function userDisplayName(email?: string | null): string {
  if (!email) return "Officer";
  const local = email.split("@")[0] ?? "";
  const part = local.split(/[._]/)[0];
  if (!part) return "Officer";
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

function userInitials(email?: string | null): string {
  return userDisplayName(email).slice(0, 2).toUpperCase();
}

export function AssistantEnhancePage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<EnhanceMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(loadSessionId);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayName = userDisplayName(user?.email);

  const refreshHealth = useCallback(async () => {
    const { ok } = await checkEnhanceHealth();
    setUnavailable(!ok);
    if (!ok) setError(UNAVAILABLE_MESSAGE);
  }, []);

  useEffect(() => {
    void refreshHealth();
    const interval = window.setInterval(() => void refreshHealth(), 30000);
    return () => window.clearInterval(interval);
  }, [refreshHealth]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const submitMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || unavailable) return;

      setError(null);
      setMessages((m) => [...m, { id: newMessageId(), role: "user", text: trimmed, ts: Date.now() }]);
      setLoading(true);

      try {
        const { data } = await postEnhanceChat(sessionId, trimmed);
        const answer = extractAnswer(data);
        if (!answer) throw new Error("Invalid assistant response.");

        setMessages((m) => [...m, { id: newMessageId(), role: "assistant", text: answer, ts: Date.now() }]);
      } catch (e) {
        const msg = mapEnhanceError(e);
        setError(msg);
        if (msg === UNAVAILABLE_MESSAGE) {
          setUnavailable(true);
        }
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, sessionId, unavailable]
  );

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    void submitMessage(text);
  }, [input, submitMessage]);

  const onPrompt = useCallback(
    (message: string) => {
      if (unavailable) return;
      setInput("");
      void submitMessage(message);
    },
    [submitMessage, unavailable]
  );

  const submitDailyReport = useCallback(async () => {
    if (loading || unavailable) return;
    setError(null);
    setMessages((m) => [...m, { id: newMessageId(), role: "user", text: "Daily Report — Today", ts: Date.now() }]);
    setLoading(true);
    try {
      const base = `daily-${Date.now()}`;
      const [r1, r2, r3] = await Promise.all([
        postEnhanceChat(`${base}-v`, "Show me the violation breakdown for today."),
        postEnhanceChat(`${base}-w`, "Show me the walk-ins summary for today."),
        postEnhanceChat(`${base}-o`, "Show me the overcrowding summary for today."),
      ]);
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const parts = [
        `**Daily Report — ${today}**`,
        "---",
        extractAnswer(r1.data) || "No traffic data available.",
        "---",
        extractAnswer(r2.data) || "No walk-in data available.",
        "---",
        extractAnswer(r3.data) || "No overcrowding data available.",
      ];
      setMessages((m) => [...m, { id: newMessageId(), role: "assistant", text: parts.join("\n\n"), ts: Date.now() }]);
    } catch (e) {
      setError(mapEnhanceError(e));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, unavailable]);

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      send();
    }
  };

  const handleFeedback = useCallback((msgId: string, type: 'thumbs_up' | 'thumbs_down') => {
    const target = messages.find(m => m.id === msgId);
    if (!target) return;
    const question = messages.slice(0, messages.indexOf(target)).reverse().find(m => m.role === 'user')?.text || '';
    void postEnhanceFeedback(sessionId, question, target.text, type);
  }, [messages, sessionId]);

  const handleResetChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setSessionId(resetSessionId());
    setResetDialogOpen(false);
  }, []);

  const inputDisabled = loading || unavailable;

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        borderRadius: { md: `${ui.cardRadius}px` },
        overflow: "hidden",
        border: { md: chatUi.border },
        bgcolor: chatUi.panelBg,
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          gap: { xs: 0, lg: 2 },
          p: { xs: 2, lg: 2.5 },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", mb: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={(e) => {
                e.currentTarget.blur();
                setResetDialogOpen(true);
              }}
              sx={{
                textTransform: "none",
                borderColor: chatUi.borderSubtle,
                color: chatUi.textMuted,
                "&:hover": { borderColor: chatUi.primary, color: chatUi.primary, bgcolor: chatUi.primarySoft },
              }}
            >
              Refresh Chat
            </Button>
          </Box>

          {unavailable ? (
            <Alert severity="warning" sx={{ mb: 1.5, flexShrink: 0, bgcolor: "rgba(245,158,11,0.12)", color: chatUi.text }}>
              {UNAVAILABLE_MESSAGE}
            </Alert>
          ) : null}

          <Box
            ref={scrollRef}
            sx={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              minHeight: 0,
              pr: 0.5,
              scrollbarWidth: "thin",
              scrollbarColor: `${chatUi.textMuted} transparent`,
              "&::-webkit-scrollbar": { width: 8 },
              "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(148,163,184,0.25)", borderRadius: 4 },
            }}
          >
            {messages.length === 0 ? <EnhanceWelcomeHero displayName={displayName} onPrompt={onPrompt} onDailyReport={submitDailyReport} disabled={unavailable} /> : null}

            {messages.map((msg) => (
              <EnhanceMessageBubble
                key={msg.id}
                message={msg}
                userInitials={userInitials(user?.email)}
                onFeedback={msg.role === 'assistant' ? handleFeedback : undefined}
              />
            ))}

            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2, pl: 0.5 }}>
                <Avatar sx={{ width: 36, height: 36, background: chatUi.iconRing }}>
                  <SmartToyOutlinedIcon sx={{ fontSize: 20, color: "#fff" }} />
                </Avatar>
                <TypingIndicator label="Analyzing database" />
              </Box>
            ) : null}
          </Box>

          {error && !unavailable ? (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5, flexShrink: 0, bgcolor: "rgba(239,68,68,0.12)", color: chatUi.text }}>
              {error}
            </Alert>
          ) : null}

          <Box sx={{ flexShrink: 0, pt: 1 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-end",
                gap: 1,
                borderRadius: chatUi.radius,
                border: chatUi.border,
                bgcolor: chatUi.inputBg,
                px: 1.5,
                py: 1,
              }}
            >
              <IconButton size="small" aria-label="Attach" disabled sx={{ color: chatUi.textMuted, mb: 0.25 }}>
                <AttachFileOutlinedIcon fontSize="small" />
              </IconButton>
              <TextField
                inputRef={inputRef}
                fullWidth
                multiline
                maxRows={4}
                placeholder={
                  unavailable
                    ? "Analytics assistant is currently unavailable."
                    : "Ask about traffic violations, walk-ins, or overcrowding..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={inputDisabled}
                variant="standard"
                slotProps={{ input: { disableUnderline: true } }}
                sx={{
                  "& input, & textarea": { color: `${chatUi.text} !important`, caretColor: `${chatUi.text} !important` },
                  "& .MuiInputBase-input": {
                    color: chatUi.text,
                    fontSize: "0.9375rem",
                    "&::placeholder": { color: chatUi.textMuted, opacity: 1 },
                  },
                }}
              />
              <IconButton
                aria-label="Send message"
                onClick={send}
                disabled={inputDisabled || !input.trim()}
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: chatUi.primary,
                  color: "#fff",
                  mb: 0.25,
                  "&:hover": { bgcolor: chatUi.primaryDark },
                  "&.Mui-disabled": { bgcolor: "rgba(59,130,246,0.35)", color: "#fff" },
                }}
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </Box>
            <Typography sx={{ textAlign: "center", fontSize: "0.6875rem", color: chatUi.textMuted, mt: 1.25 }}>
              🔒 Read-only analytics · Supports Walk-ins, Kitchen Unattended &amp; Alerts · Session persists across refresh
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: { xs: "none", lg: "block" }, overflowY: "auto", maxHeight: "100%", pr: 0.5, scrollbarWidth: "thin", scrollbarColor: `${chatUi.textMuted} transparent`, "&::-webkit-scrollbar": { width: 6 }, "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(148,163,184,0.2)", borderRadius: 4 } }}>
          <EnhanceAssistantSidebar onPrompt={onPrompt} disabled={unavailable} />
        </Box>
      </Box>

      {/* Reset Confirmation Dialog */}
      <Dialog
        open={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        sx={{
          "& .MuiDialog-paper": {
            bgcolor: chatUi.surfaceElevated,
            color: chatUi.text,
            border: chatUi.border,
            borderRadius: chatUi.radius,
            backgroundImage: "none",
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>Refresh Chat Session?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: chatUi.textSecondary }}>
            Are you sure you want to start a new session? This will clear your current conversation history and reset the assistant's memory of previous queries.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button
            onClick={() => setResetDialogOpen(false)}
            sx={{ color: chatUi.textMuted, textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleResetChat}
            variant="contained"
            color="error"
            autoFocus
            sx={{ textTransform: "none", boxShadow: "none" }}
          >
            Clear Conversation
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
