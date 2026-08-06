import { isAxiosError } from "axios";
import { api } from "../api";
import type { EnhanceChatResponse, EnhanceDebugResponse, EnhanceHealthResponse } from "./types";

export const HEALTH_TIMEOUT_MS = 5000;
export const CHAT_TIMEOUT_MS = 60000;

export const UNAVAILABLE_MESSAGE = "Analytics assistant is currently unavailable.";

export function mapEnhanceError(error: unknown): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const msg = error.response?.data?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    if (status === 504 || error.code === "ECONNABORTED") {
      return "The request timed out. Please try again.";
    }
    if (status === 503 || status === 502) return UNAVAILABLE_MESSAGE;
    if (error.message.includes("Network Error")) return UNAVAILABLE_MESSAGE;
  }
  if (error instanceof Error && error.message === "Invalid assistant response.") {
    return "Received an invalid response from the analytics assistant.";
  }
  return UNAVAILABLE_MESSAGE;
}

export async function checkEnhanceHealth(): Promise<{ ok: boolean; data: EnhanceHealthResponse | null }> {
  try {
    const { data } = await api.get<EnhanceHealthResponse>("/assistant-enhance/health", {
      timeout: HEALTH_TIMEOUT_MS,
    });
    const status = String(data?.status || "").toLowerCase();
    const ok = status === "ok" || status === "degraded";
    return { ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

export async function postEnhanceChat(sessionId: string, message: string) {
  return api.post<EnhanceChatResponse>(
    "/assistant-enhance/chat",
    { session_id: sessionId, message },
    { timeout: CHAT_TIMEOUT_MS }
  );
}

export async function postEnhanceDebug(sessionId: string) {
  return api.post<EnhanceDebugResponse>(
    "/assistant-enhance/debug",
    { session_id: sessionId },
    { timeout: CHAT_TIMEOUT_MS }
  );
}

export function extractAnswer(data: EnhanceChatResponse): string {
  const text = data.message || data.answer;
  return typeof text === "string" ? text : "";
}

export async function postEnhanceFeedback(sessionId: string, question: string, answer: string, feedback: 'thumbs_up' | 'thumbs_down') {
  return api.post(
    "/assistant-enhance/feedback",
    { session_id: sessionId, question, answer, feedback },
    { timeout: HEALTH_TIMEOUT_MS }
  );
}
