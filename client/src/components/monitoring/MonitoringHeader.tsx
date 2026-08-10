import { Box, Button, Typography } from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import DirectionsWalkOutlinedIcon from "@mui/icons-material/DirectionsWalkOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import NightsStayOutlinedIcon from "@mui/icons-material/NightsStayOutlined";
import SoupKitchenOutlinedIcon from "@mui/icons-material/SoupKitchenOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import type { InferenceModule, InferenceModuleKey } from "../../lib/inferenceModules";
import { contentCardSx } from "../../lib/uiSurfaces";
import { tintOf } from "./monitoringTokens";

const MODULE_ICON: Record<InferenceModuleKey, React.ReactNode> = {
  walkins: <DirectionsWalkOutlinedIcon />,
  loitering: <TimerOutlinedIcon />,
  intrusion: <ReportGmailerrorredOutlinedIcon />,
  after_hours: <NightsStayOutlinedIcon />,
  kitchen_unattended: <SoupKitchenOutlinedIcon />,
  chef_absence: <SoupKitchenOutlinedIcon />,
};

const SITE_TZ = "Asia/Kolkata";

function fmtUpdated(ms?: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    timeZone: SITE_TZ, day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

/**
 * Page header for a Monitoring module.
 *
 * Carries the module's own hue and icon, so the five pages are recognisably the
 * same template without looking identical. "Last updated" is the moment the KPI
 * query last resolved rather than the clock: on a page that refetches on an
 * interval, the useful question is how stale the figures are, and a live clock
 * would answer a different one while looking like it answered this.
 */
export function MonitoringHeader({
  module, updatedAt, refreshing, onRefresh,
}: {
  module: InferenceModule;
  updatedAt?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const hue = module.colour;
  return (
    <Box
      sx={{
        ...contentCardSx,
        p: { xs: 2, md: 2.25 },
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        justifyContent: "space-between",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.75, minWidth: 0 }}>
        <Box
          aria-hidden
          sx={{
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: "12px",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            background: `linear-gradient(145deg, ${hue} 0%, ${hue}CC 100%)`,
            boxShadow: `0 6px 16px ${tintOf(hue, 0.35)}`,
            "& .MuiSvgIcon-root": { fontSize: 24 },
          }}
        >
          {MODULE_ICON[module.key] ?? <ShieldOutlinedIcon />}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: "1.125rem", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
            {module.label} Monitoring Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {module.blurb}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
        <Typography variant="caption" color="text.secondary">
          Last updated: {fmtUpdated(updatedAt)}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <RefreshRoundedIcon
              sx={{
                fontSize: 18,
                ...(refreshing
                  ? { animation: "bkSpin 900ms linear infinite", "@keyframes bkSpin": { to: { transform: "rotate(360deg)" } } }
                  : {}),
              }}
            />
          }
          onClick={onRefresh}
          disabled={refreshing}
          sx={{ borderColor: "rgba(15,23,42,.16)", color: "text.primary", borderRadius: "8px", flexShrink: 0 }}
        >
          Refresh
        </Button>
      </Box>
    </Box>
  );
}
