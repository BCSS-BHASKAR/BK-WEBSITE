import { Box, Chip, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import CircleIcon from "@mui/icons-material/Circle";
import { InferenceAnalyticsView } from "../components/dashboard/InferenceAnalyticsView";
import { pageLayoutSx } from "../lib/uiSurfaces";
import { api } from "../lib/api";
import { useAutoRefreshMs } from "../lib/useAppSettings";

// The dashboard is an analytical view over what the on-prem CV services
// actually capture (walk-ins, loitering, intrusion, after-hours), read from the
// inference tables.
//
// It previously rendered DashboardOperationalView, which queried the legacy
// ANPR tables - vehicle reads, plate analytics, traffic violations. Nothing
// writes to those at this site (the S3 bucket carries no vehicle data at all),
// so every tile and chart on it read zero. That component is left in the tree,
// unreferenced, rather than deleted, in case the vehicle module is ever
// commissioned here.

function IngestStatus() {
  const { data } = useQuery({
    queryKey: ["inference", "health"],
    queryFn: async () => (await api.get("/inference/health")).data,
    refetchInterval: 60_000,
  });
  const last = data?.ingest?.last_run_at ? new Date(data.ingest.last_run_at) : null;
  const stale = last ? Date.now() - last.getTime() > 20 * 60 * 1000 : true;
  const ok = Boolean(data?.s3?.reachable) && !stale;
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <CircleIcon sx={{ fontSize: 10, color: ok ? "success.main" : "warning.main" }} />
      <Typography variant="caption" color="text.secondary">
        {ok ? "Ingest healthy" : "Ingest stale"}
        {last
          ? ` · last sync ${last.toLocaleTimeString("en-GB", {
              timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
            })}`
          : " · never run"}
      </Typography>
    </Stack>
  );
}

export function DashboardPage() {
  const refreshSecs = Math.round(useAutoRefreshMs() / 1000);
  return (
    <Box sx={pageLayoutSx}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 0.5 }}
      >
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Operations Analytics</Typography>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <IngestStatus />
          <Chip size="small" variant="outlined" label={`Auto-refresh ${refreshSecs}s`} sx={{ height: 22, fontSize: 11 }} />
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Everything the cameras have detected — walk-ins, loitering, intrusion and after-hours
        presence — with activity trends, timing, camera coverage and the latest evidence.
      </Typography>

      <InferenceAnalyticsView />
    </Box>
  );
}
