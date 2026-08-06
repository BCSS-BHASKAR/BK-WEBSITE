import { Box, Stack, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { SITE_BRANDING } from "../../i18n/lang";

// "ISO 27001 Certified" was removed — it is a claim about an external audit that
// nothing here can back up. Restore it only if the certificate genuinely exists.
const COMPLIANCE = [
  { icon: <HttpsOutlinedIcon sx={{ fontSize: 14 }} />, label: "SSL Encrypted Connection" },
  { icon: <AccountBalanceOutlinedIcon sx={{ fontSize: 14 }} />, label: "Private Venue Network" },
];

const STATUS = [
  { icon: <DescriptionOutlinedIcon sx={{ fontSize: 14 }} />, label: "Audit Logging: Enabled", color: "#94A3B8" },
  { icon: <FiberManualRecordIcon sx={{ fontSize: 8 }} />, label: "Session Monitoring: Active", color: "#4ADE80", pulse: true },
  { icon: <CheckCircleOutlinedIcon sx={{ fontSize: 14 }} />, label: "System Status: All Systems Operational", color: "#4ADE80" },
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
        bgcolor: "rgba(30, 41, 59, 0.8)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        color: "rgba(203, 213, 225, 0.95)",
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
        bgcolor: "rgba(28, 5, 11, 0.96)",
        borderTop: "1px solid rgba(217, 174, 69, 0.18)",
        color: "rgba(226, 205, 175, 0.9)",
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <FooterIcon>
          <LockOutlinedIcon sx={{ fontSize: 14 }} />
        </FooterIcon>
        <Box>
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 700, lineHeight: 1.3, color: "#F5E8D6" }}>
            Authorized Staff Only
          </Typography>
          <Typography sx={{ fontSize: "0.5625rem", fontWeight: 500, color: "rgba(226,205,175,0.85)", lineHeight: 1.35 }}>
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
