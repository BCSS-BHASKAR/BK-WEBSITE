import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Avatar, Box, CircularProgress, IconButton, TextField, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { isAxiosError } from "axios";
import { api } from "../lib/api";
import type { ChatApiResponse, ChatMessage } from "../lib/chatTypes";
import { ChatAssistantCards } from "../components/chat/ChatAssistantCards";
import { ChatAssistantSidebar } from "../components/chat/ChatAssistantSidebar";
import { ChatWelcomeHero } from "../components/chat/ChatWelcomeHero";
import { useAuth } from "../auth/AuthContext";
import { chatUi } from "../lib/chatAssistantTheme";
import { ui } from "../lib/uiSurfaces";

const SESSION_KEY = "anpr-chat-session-id";

function loadSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
  } catch {

  }
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {

  }
  return id;
}

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
  const name = userDisplayName(email);
  return name.slice(0, 2).toUpperCase();
}

function formatMsgTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ChatAssistantPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(loadSessionId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayName = userDisplayName(user?.email);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const submitMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      const userMsg: ChatMessage = { id: newMessageId(), role: "user", text: trimmed, ts: Date.now() };
      setMessages((m) => [...m, userMsg]);
      setLoading(true);

      try {
        const { data } = await api.post<ChatApiResponse>("/chat/", { message: trimmed, sessionId });
        if (!data?.message || typeof data.message !== "string") {
          throw new Error("Invalid assistant response. Try signing in again or refresh the page.");
        }
        if (data.sessionId && data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
          try {
            sessionStorage.setItem(SESSION_KEY, data.sessionId);
          } catch {

          }
        }
        const assistantMsg: ChatMessage = {
          id: newMessageId(),
          role: "assistant",
          text: data.message,
          cards: data.cards,
          ts: Date.now(),
        };
        setMessages((m) => [...m, assistantMsg]);
      } catch (e) {
        const msg = isAxiosError(e)
          ? String(e.response?.data?.message || "Could not reach the assistant.")
          : e instanceof Error
            ? e.message
            : "Something went wrong.";
        setError(msg);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, sessionId]
  );

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    void submitMessage(text);
  }, [input, submitMessage]);

  const onPrompt = useCallback(
    (message: string) => {
      setInput("");
      void submitMessage(message);
    },
    [submitMessage]
  );

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      send();
    }
  };

  const showWelcome = messages.length === 0;

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
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
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
              "&::-webkit-scrollbar-thumb": {
                bgcolor: "rgba(148,163,184,0.25)",
                borderRadius: 4,
              },
            }}
          >
            {showWelcome ? <ChatWelcomeHero displayName={displayName} onPrompt={onPrompt} /> : null}

            {messages.map((msg) => (
              <Box
                key={msg.id}
                sx={{
                  display: "flex",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  alignItems: "flex-start",
                  gap: 1.25,
                  mb: 2.5,
                }}
              >
                {msg.role === "assistant" ? (
                  <Avatar
                    sx={{
                      width: 36,
                      height: 36,
                      background: chatUi.iconRing,
                      flexShrink: 0,
                    }}
                  >
                    <SmartToyOutlinedIcon sx={{ fontSize: 20, color: "#fff" }} />
                  </Avatar>
                ) : (
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
                    {userInitials(user?.email)}
                  </Avatar>
                )}

                <Box sx={{ maxWidth: "min(85%, 640px)", minWidth: 0 }}>
                  <Box
                    sx={{
                      borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      bgcolor: msg.role === "user" ? chatUi.userBubble : chatUi.botBubble,
                      border: msg.role === "user" ? "none" : chatUi.borderSubtle,
                      py: 1.25,
                      px: 1.75,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.9375rem",
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                        color: chatUi.text,
                      }}
                    >
                      {msg.text}
                    </Typography>
                  </Box>

                  {msg.role === "user" ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 0.5,
                        mt: 0.5,
                        pr: 0.5,
                      }}
                    >
                      <Typography sx={{ fontSize: "0.6875rem", color: chatUi.textMuted }}>
                        {formatMsgTime(msg.ts)}
                      </Typography>
                      <DoneAllIcon sx={{ fontSize: 14, color: chatUi.primary }} />
                    </Box>
                  ) : null}

                  {msg.role === "assistant" && msg.cards?.length ? (
                    <ChatAssistantCards cards={msg.cards} />
                  ) : null}
                </Box>
              </Box>
            ))}

            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2, pl: 0.5 }}>
                <Avatar sx={{ width: 36, height: 36, background: chatUi.iconRing }}>
                  <SmartToyOutlinedIcon sx={{ fontSize: 20, color: "#fff" }} />
                </Avatar>
                <CircularProgress size={20} sx={{ color: chatUi.primary }} />
                <Typography sx={{ fontSize: "0.875rem", color: chatUi.textSecondary }}>Searching records…</Typography>
              </Box>
            ) : null}
          </Box>

          {error ? (
            <Alert
              severity="error"
              onClose={() => setError(null)}
              sx={{ mb: 1.5, flexShrink: 0, bgcolor: "rgba(239,68,68,0.12)", color: chatUi.text }}
            >
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
              <IconButton
                size="small"
                aria-label="Attach"
                disabled
                sx={{ color: chatUi.textMuted, mb: 0.25 }}
              >
                <AttachFileOutlinedIcon fontSize="small" />
              </IconButton>
              <TextField
                inputRef={inputRef}
                fullWidth
                multiline
                maxRows={4}
                placeholder="Ask about plate reads, violations, or a plate number..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                variant="standard"
                slotProps={{ input: { disableUnderline: true } }}
                sx={{
                  "& input, & textarea": {
                    color: `${chatUi.text} !important`,
                    caretColor: `${chatUi.text} !important`,
                  },
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
                disabled={loading || !input.trim()}
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
            <Typography
              sx={{
                textAlign: "center",
                fontSize: "0.6875rem",
                color: chatUi.textMuted,
                mt: 1.25,
              }}
            >
              🔒 Read-only · No data is created, updated, or deleted
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: { xs: "none", lg: "block" },
            overflowY: "auto",
            overflowX: "hidden",
            maxHeight: "100%",
            pr: 0.5,
          }}
        >
          <ChatAssistantSidebar onPrompt={onPrompt} />
        </Box>
      </Box>
    </Box>
  );
}
