import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../auth/tokenStore";

const envRaw = import.meta.env?.VITE_API_BASE;
const fromEnv = typeof envRaw === "string" ? envRaw.trim() : "";

export const apiBase = (
  fromEnv ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}/api`
    : "http://127.0.0.1:4000/api")
).replace(/\/+$/, "");

export const api = axios.create({
  baseURL: apiBase,
});

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post<{ accessToken: string; refreshToken: string }>(`${apiBase}/auth/refresh`, { refreshToken: rt })
      .then((res) => {
        setTokens(res.data.accessToken, res.data.refreshToken);
        return res.data.accessToken;
      })
      .catch(() => {
        clearTokens();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }
    const url = String(original.url || "");
    if (url.includes("/auth/login") || url.includes("/auth/refresh")) {
      return Promise.reject(error);
    }
    original._retry = true;
    const next = await refreshAccessToken();
    if (!next) {
      return Promise.reject(error);
    }
    original.headers.Authorization = `Bearer ${next}`;
    return api(original);
  }
);
