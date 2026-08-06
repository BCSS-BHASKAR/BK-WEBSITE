const SESSION_KEY = "anpr-enhance-session-id";

export function loadSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
  } catch {

  }
  const id = crypto.randomUUID();
  persistSessionId(id);
  return id;
}

export function persistSessionId(id: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {

  }
}

export function resetSessionId(): string {
  const id = crypto.randomUUID();
  persistSessionId(id);
  return id;
}
