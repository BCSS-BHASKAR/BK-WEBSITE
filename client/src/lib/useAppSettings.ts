import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

// General application settings, read once and shared across pages via the
// react-query cache.
//
// This exists so the Settings screen's controls actually do something. The
// auto-refresh field claimed to govern Monitoring refresh while every page used
// a hardcoded 60s; useAutoRefreshMs() is what makes that true.

export type GeneralSettings = {
  siteName?: string;
  timezone?: string;
  defaultReportDays?: number;
  dateFormat?: string;
  timeFormat?: string;
  autoRefreshSeconds?: number;
  notifyEmail?: string;
};

const DEFAULTS: Required<Pick<GeneralSettings, "autoRefreshSeconds" | "defaultReportDays" | "timezone">> = {
  autoRefreshSeconds: 60,
  defaultReportDays: 7,
  timezone: "Asia/Kolkata",
};

export function useAppSettings() {
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get("/settings")).data as {
      settings: Record<string, { value: GeneralSettings }>;
    },
    // Settings change rarely; don't refetch them on every page mount.
    staleTime: 5 * 60 * 1000,
  });
  const general: GeneralSettings = q.data?.settings?.general?.value ?? {};
  return {
    general,
    timezone: general.timezone || DEFAULTS.timezone,
    defaultReportDays: Number(general.defaultReportDays) || DEFAULTS.defaultReportDays,
    isLoading: q.isLoading,
  };
}

/**
 * Refetch interval in milliseconds for live views.
 *
 * Clamped to the same 10s-3600s window the server validates, so a bad stored
 * value cannot turn into a request storm.
 */
export function useAutoRefreshMs(): number {
  const { general } = useAppSettings();
  const secs = Number(general.autoRefreshSeconds);
  if (!Number.isFinite(secs)) return DEFAULTS.autoRefreshSeconds * 1000;
  return Math.min(3600, Math.max(10, secs)) * 1000;
}
