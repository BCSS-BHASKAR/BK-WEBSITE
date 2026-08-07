import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Navigate } from "react-router-dom";
import { api } from "./api";
import { contentCardSx, pageLayoutSx } from "./uiSurfaces";

// Client-side half of RBAC.
//
// This governs what a user SEES - hidden nav entries and blocked routes. It is
// deliberately not the security boundary: the API enforces the same grants
// independently (server/src/middleware/requirePageAccess.js), so a user who
// types a URL or calls the endpoint directly is still refused.

export type PageKey =
  | "dashboard" | "daily_briefing"
  | "monitoring_walkins" | "monitoring_loitering" | "monitoring_intrusion"
  | "monitoring_after_hours" | "monitoring_kitchen" | "monitoring_chef_absence"
  | "active_alerts" | "cameras_online" | "known_faces"
  | "inference_viewer" | "settings" | "access_control";

type PermissionsValue = {
  role: string;
  pages: Set<string>;
  isAdmin: boolean;
  isLoading: boolean;
  can: (page: PageKey) => boolean;
};

const Ctx = createContext<PermissionsValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["rbac", "me"],
    queryFn: async () => (await api.get("/rbac/me")).data as {
      role: string; pages: string[]; isAdmin: boolean;
    },
    staleTime: 60_000,
    retry: 1,
  });

  const value = useMemo<PermissionsValue>(() => {
    const pages = new Set(data?.pages ?? []);
    return {
      role: data?.role ?? "",
      pages,
      isAdmin: Boolean(data?.isAdmin),
      isLoading,
      // Unknown role or failed lookup grants nothing, never everything.
      can: (p: PageKey) => pages.has(p),
    };
  }, [data, isLoading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePermissions(): PermissionsValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Rendered outside the provider (e.g. the login screen) - deny everything.
    return { role: "", pages: new Set(), isAdmin: false, isLoading: false, can: () => false };
  }
  return ctx;
}

function NoAccess({ label }: { label?: string }) {
  return (
    <Box sx={pageLayoutSx}>
      <Paper sx={{ ...contentCardSx, p: 5, textAlign: "center" }}>
        <LockOutlinedIcon sx={{ fontSize: 44, opacity: 0.35 }} />
        <Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>Access restricted</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Your role does not have access to {label || "this page"}. Ask an administrator
          to grant it under Settings → Roles &amp; Access.
        </Typography>
      </Paper>
    </Box>
  );
}

/**
 * Route guard. Renders the page when granted, an explanatory panel when not.
 *
 * It shows a message rather than redirecting so a user who follows a link
 * understands why nothing happened, instead of being silently bounced.
 */
export function RequirePage({
  page, label, children,
}: { page: PageKey; label?: string; children: ReactNode }) {
  const { can, isLoading, role } = usePermissions();
  if (isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}><CircularProgress /></Box>;
  }
  if (!role) return <Navigate to="/login" replace />;
  return can(page) ? <>{children}</> : <NoAccess label={label} />;
}
