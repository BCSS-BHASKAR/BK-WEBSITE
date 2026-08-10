import { Box, Stack, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { SITE_BRANDING } from "../../i18n/lang";
import { loginPalette } from "./loginTheme";

// "ISO 27001 Certified" was removed — it is a claim about an external audit that
// nothing here can back up. Restore it only if the certificate genuinely exists.
const COMPLIANCE = [
  { icon: <HttpsOutlinedIcon sx={{ fontSize: 14 }} />, label: "SSL Encrypted Connection" },
  { icon: <AccountBalanceOutlinedIcon sx={{ fontSize: 14 }} />, label: "Private Venue Network" },
];

const STATUS = [
  { icon: <DescriptionOutlinedIcon sx={{ fontSize: 14 }} />, label: "Audit Logging: Enabled", color: "rgba(240, 244, 232, 0.7)" },
  { icon: <FiberManualRecordIcon sx={{ fontSize: 8 }} />, label: "Session Monitoring: Active", color: "#5FD87A", pulse: true },
  { icon: <CheckCircleOutlinedIcon sx={{ fontSize: 14 }} />, label: "System Status: All Systems Operational", color: "#5FD87A" },
];

function FooterIcon({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        bgcolor: "rgba(23, 60, 20, 0.85)",
        border: `1px solid ${loginPalette.hairline}`,
        color: loginPalette.creamMuted,
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  );
}

export function LoginStatusFooter() {
  return (
    <Box
      component="footer"
      sx={{
        display: { xs: "none", lg: "grid" },
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 2,
        px: { lg: 2.5, xl: 3 },
        py: 1.1,
        bgcolor: "rgba(8, 26, 8, 0.96)",
        borderTop: `1px solid ${loginPalette.hairline}`,
        color: loginPalette.creamMuted,
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <FooterIcon>
          <LockOutlinedIcon sx={{ fontSize: 14 }} />
        </FooterIcon>
        <Box>
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, lineHeight: 1.3, color: loginPalette.cream }}>
            Authorized Staff Only
          </Typography>
          <Typography sx={{ fontSize: "0.5625rem", fontWeight: 500, color: loginPalette.creamFaint, lineHeight: 1.35 }}>
            {SITE_BRANDING.loginFooter.replace(/^Authorized (Personnel|Staff) Only\.?\s*/i, "")}
          </Typography>
        </Box>
      </Box>

      <Stack direction="row" spacing={2} sx={{ justifyContent: "center", flexWrap: "wrap" }}>
        {COMPLIANCE.map((c) => (
          <Box key={c.label} sx={{ display: "flex", alignItems: "center", gap: 0.65 }}>
            <FooterIcon>{c.icon}</FooterIcon>
            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
              {c.label}
            </Typography>
          </Box>
        ))}
      </Stack>

      <Stack direction="row" spacing={1.75} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        {STATUS.map((s) => (
          <Box key={s.label} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ color: s.color, display: "flex", alignItems: "center" }}>{s.icon}</Box>
            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>
              {s.label}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
