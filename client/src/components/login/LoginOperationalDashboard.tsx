import { Box, Stack, Typography } from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DirectionsWalkOutlinedIcon from "@mui/icons-material/DirectionsWalkOutlined";
import SoupKitchenOutlinedIcon from "@mui/icons-material/SoupKitchenOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import FaceRetouchingNaturalOutlinedIcon from "@mui/icons-material/FaceRetouchingNaturalOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { SITE_BRANDING } from "../../i18n/lang";
import { loginPalette, loginPanelBg } from "./loginTheme";
import { PnpBadge } from "../PnpBadge";

/**
 * The sign-in hero.
 *
 * This panel deliberately shows no figures. Nobody is signed in yet, so any
 * number here would have to be invented — the previous version displayed a
 * fabricated occupancy board, guest counts and covers served, none of which the
 * product actually tracks. It now lists the modules that really exist, matching
 * the labels and icons in AppShell's sidebar.
 */

const MODULES = [
  {
    icon: <DirectionsWalkOutlinedIcon />,
    title: "Walk-ins",
    body: "Every person entering through the door, with peak hours by day.",
  },
  {
    icon: <SoupKitchenOutlinedIcon />,
    title: "Kitchen Unattended",
    body: "A record each time the cameras find no staff in the kitchen.",
  },
  {
    icon: <WarningAmberRoundedIcon />,
    title: "Active Alerts",
    body: "Intrusion, unauthorized access, camera tampering and kitchen staffing.",
  },
  {
    icon: <VideocamRoundedIcon />,
    title: "Cameras Online",
    body: "Live status of every camera across the venue.",
  },
  {
    icon: <FaceRetouchingNaturalOutlinedIcon />,
    title: "Known Faces",
    body: "Enrolled staff and visitors recognised on the live feeds.",
  },
  {
    icon: <AutoAwesomeOutlinedIcon />,
    title: "AI Daily Briefing",
    body: "A written summary of the day, with recommendations to act on.",
  },
];

const TRUST_BADGES = [
  { icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 13 }} />, label: "Secure venue system" },
  { icon: <SmartToyOutlinedIcon sx={{ fontSize: 13 }} />, label: "AI powered by AccessGenie" },
  { icon: <ScheduleOutlinedIcon sx={{ fontSize: 13 }} />, label: "24/7 monitoring" },
];

function ModuleRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1.6, alignItems: "flex-start", minWidth: 0 }}>
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: 2,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          bgcolor: loginPalette.tint,
          border: `1px solid ${loginPalette.hairline}`,
          color: loginPalette.goldBright,
          "& svg": { fontSize: 20 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, pt: 0.15 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: loginPalette.cream, lineHeight: 1.3 }}>
          {title}
        </Typography>
        <Typography
          sx={{ mt: 0.3, fontSize: "0.75rem", color: loginPalette.creamMuted, lineHeight: 1.5 }}
        >
          {body}
        </Typography>
      </Box>
    </Box>
  );
}

export function LoginOperationalDashboard() {
  return (
    <Box
      sx={{
        display: { xs: "none", lg: "flex" },
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "100%",
        background: loginPanelBg,
        color: loginPalette.cream,
        overflow: "hidden",
        position: "relative",
        px: { lg: 5, xl: 8 },
        py: 5,
      }}
    >
      <Box sx={{ maxWidth: 660, width: "100%", mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2.5 }}>
          <PnpBadge size={104} sx={{ flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { lg: "1.375rem", xl: "1.5rem" },
                letterSpacing: "0.04em",
                lineHeight: 1.15,
                textTransform: "uppercase",
              }}
            >
              {SITE_BRANDING.productName}
            </Typography>
            {/* The brand line, not a product descriptor — what the system does
                is covered by the tagline and the module list below. */}
            <Typography
              sx={{
                fontWeight: 500,
                fontStyle: "italic",
                fontSize: { lg: "1rem", xl: "1.0625rem" },
                letterSpacing: "0.015em",
                color: loginPalette.gold,
                mt: 0.6,
                lineHeight: 1.35,
              }}
            >
              {SITE_BRANDING.brandLine}
            </Typography>
          </Box>
        </Box>

        <Typography
          sx={{
            mt: 3,
            fontSize: { lg: "0.9375rem", xl: "1rem" },
            color: loginPalette.creamMuted,
            lineHeight: 1.65,
            maxWidth: 560,
          }}
        >
          {SITE_BRANDING.loginTagline}
        </Typography>

        <Box
          sx={{
            mt: 4,
            display: "grid",
            gridTemplateColumns: { lg: "1fr", xl: "repeat(2, minmax(0, 1fr))" },
            columnGap: 4,
            rowGap: 2.5,
          }}
        >
          {MODULES.map((m) => (
            <ModuleRow key={m.title} {...m} />
          ))}
        </Box>

        <Stack direction="row" spacing={1} sx={{ mt: 4.5, flexWrap: "wrap", gap: 1 }}>
          {TRUST_BADGES.map((b) => (
            <Box
              key={b.label}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.7,
                px: 1.25,
                py: 0.55,
                borderRadius: 10,
                bgcolor: "rgba(11, 34, 10, 0.55)",
                border: `1px solid ${loginPalette.hairline}`,
                color: loginPalette.gold,
              }}
            >
              {b.icon}
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.01em" }}>
                {b.label}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
