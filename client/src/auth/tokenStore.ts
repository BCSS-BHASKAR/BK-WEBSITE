const AT = "anpr_access";
const RT = "anpr_refresh";

function read(key: string): string | null {
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal) return fromLocal;
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) {
      localStorage.setItem(key, fromSession);
      return fromSession;
    }
    return null;
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    sessionStorage.removeItem(key);
  } catch {

  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {

  }
}

export function getAccessToken(): string | null {
  return read(AT);
}

export function getRefreshToken(): string | null {
  return read(RT);
}

export function setTokens(access: string, refresh: string) {
  write(AT, access);
  write(RT, refresh);
}

export function clearTokens() {
  remove(AT);
  remove(RT);
}
