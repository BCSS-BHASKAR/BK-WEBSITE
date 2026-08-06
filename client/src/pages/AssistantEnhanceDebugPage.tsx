import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { checkEnhanceHealth, mapEnhanceError, postEnhanceDebug, UNAVAILABLE_MESSAGE } from "../lib/assistant_enhance/api";
import { loadSessionId } from "../lib/assistant_enhance/session";
import type { EnhanceDebugResponse, EnhanceHealthStatus } from "../lib/assistant_enhance/types";
import { HealthIndicator } from "../components/assistant_enhance/HealthIndicator";
import { chatUi } from "../lib/chatAssistantTheme";
import { ui } from "../lib/uiSurfaces";

function DebugBlock({ title, data }: { title: string; data: unknown }) {
  const empty = data === null || data === undefined || data === "";
  return (
    <Paper sx={{ p: 2, mb: 2, bgcolor: chatUi.surface, border: chatUi.border, borderRadius: chatUi.radius }}>
      <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: chatUi.primary, mb: 1 }}>{title}</Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          bgcolor: chatUi.inputBg,
          borderRadius: chatUi.radiusSm,
          overflow: "auto",
          fontSize: "0.75rem",
          color: chatUi.text,
          maxHeight: 320,
        }}
      >
        {empty ? "—" : typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </Box>
    </Paper>
  );
}

export function AssistantEnhanceDebugPage() {
  const [params] = useSearchParams();
  const [sessionId, setSessionId] = useState(params.get("session") || loadSessionId());
  const [data, setData] = useState<EnhanceDebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<EnhanceHealthStatus>("connecting");

  const refreshHealth = useCallback(async () => {
    setHealthStatus("connecting");
    const { ok } = await checkEnhanceHealth();
    setHealthStatus(ok ? "connected" : "unavailable");
  }, []);

  const fetchDebug = useCallback(async (sid: string) => {
    if (!sid.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { ok } = await checkEnhanceHealth();
      if (!ok) {
        setError(UNAVAILABLE_MESSAGE);
        setHealthStatus("unavailable");
        return;
      }
      setHealthStatus("connected");
      const { data: resp } = await postEnhanceDebug(sid);
      setData(resp);
    } catch (e) {
      setError(mapEnhanceError(e));
      setHealthStatus("unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    const sid = params.get("session");
    if (sid) {
      setSessionId(sid);
      void fetchDebug(sid);
    }
  }, [params, fetchDebug]);

  return (
    <Box
      sx={{
        flex: 1,
        p: { xs: 2, md: 2.5 },
        minHeight: 0,
        overflowY: "auto",
        bgcolor: chatUi.panelBg,
        borderRadius: { md: `${ui.cardRadius}px` },
        border: { md: chatUi.border },
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: "1.25rem", color: chatUi.text }}>
          Analytics Assistant — Debug
        </Typography>
        <HealthIndicator status={healthStatus} />
      </Box>
      <Typography sx={{ fontSize: "0.875rem", color: chatUi.textSecondary, mb: 2 }}>
        Pipeline trace for the last question in a session.
      </Typography>

      <Box sx={{ display: "flex", gap: 1, mb: 2, maxWidth: 560 }}>
        <TextField
          fullWidth
          size="small"
          label="Session ID"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          sx={{
            "& .MuiInputBase-input": { color: chatUi.text },
            "& .MuiInputLabel-root": { color: chatUi.textMuted },
            "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.3)" },
          }}
        />
        <Button variant="contained" onClick={() => void fetchDebug(sessionId)} disabled={loading || !sessionId.trim()}>
          Load
        </Button>
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {loading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={24} sx={{ color: chatUi.primary }} />
          <Typography sx={{ color: chatUi.textSecondary }}>Loading debug trace…</Typography>
        </Box>
      ) : null}

      {data && !loading ? (
        <Box>
          <DebugBlock title="Session ID" data={data.session_id ?? data.sessionId} />
          <DebugBlock title="Memory Key" data={data.memory_key} />
          <DebugBlock title="Context Size" data={data.context_size} />
          <DebugBlock title="Loaded Context" data={data.loaded_context} />
          <DebugBlock title="Question" data={data.question} />
          <DebugBlock title="Normalized Question" data={data.normalized_question} />
          <DebugBlock title="Conversation Context" data={data.conversation_context ?? data.context} />
          <DebugBlock title="Intent" data={data.intent} />
          <DebugBlock title="Entities" data={data.entities ?? data.entity_resolution} />
          <DebugBlock title="Confidence" data={data.confidence} />
          <DebugBlock title="Plan" data={data.plan ?? data.execution_plan} />
          <DebugBlock title="SQL" data={data.sql} />
          <DebugBlock title="Execution Time" data={data.execution_time_ms != null ? `${data.execution_time_ms} ms` : null} />
          <DebugBlock title="Analytics Output" data={data.analytics_output ?? data.analytics} />
          <DebugBlock title="Answer" data={data.answer} />
          {data.error ? <DebugBlock title="Error" data={data.error} /> : null}
        </Box>
      ) : null}

      {!data && !loading && !error ? (
        <Typography sx={{ color: chatUi.textMuted, fontSize: "0.875rem" }}>
          Enter a session ID from a chat at /assistant_enhance, or add ?session=... to the URL.
        </Typography>
      ) : null}
    </Box>
  );
}
