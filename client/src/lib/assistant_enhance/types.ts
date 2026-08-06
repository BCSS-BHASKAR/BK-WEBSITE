export type EnhanceMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
};

export type EnhanceHealthStatus = "connecting" | "connected" | "unavailable";

export type EnhanceHealthResponse = {
  status?: string;
  llm?: boolean;
  redis?: boolean;
  database?: boolean;
  [key: string]: unknown;
};

export type EnhanceChatResponse = {
  session_id?: string;
  sessionId?: string;
  message?: string;
  answer?: string;
  cards?: unknown[];
  context?: Record<string, unknown>;
  [key: string]: unknown;
};

export type EnhanceDebugResponse = {
  session_id?: string;
  sessionId?: string;
  memory_key?: string;
  context_size?: number;
  loaded_context?: Record<string, unknown>;
  question?: string;
  normalized_question?: string;
  conversation_context?: string;
  intent?: string;
  entities?: unknown;
  entity_resolution?: unknown;
  confidence?: number;
  plan?: unknown;
  execution_plan?: unknown;
  sql?: string;
  execution_time_ms?: number;
  analytics?: unknown;
  analytics_output?: unknown;
  answer?: string;
  error?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
};
