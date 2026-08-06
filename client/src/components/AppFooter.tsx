import { Box, Stack, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import { useLocation } from "react-router-dom";
import { PoweredByAccessGenie } from "./PoweredByAccessGenie";
import { pnp } from "../lib/pnpTheme";

const BADGES = [
  { icon: <LockOutlinedIcon sx={{ fontSize: 14 }} />, label: "Secure Venue System" },
  { icon: <HttpsOutlinedIcon sx={{ fontSize: 14 }} />, label: "ISO 27001 Certified" },
  { icon: <AccountBalanceOutlinedIcon sx={{ fontSize: 14 }} />, label: "Biryani Katha · Authorized Staff Only" },
  { icon: <VerifiedOutlinedIcon sx={{ fontSize: 14 }} />, label: "Audit Logging Enabled" },
  { icon: <MonitorHeartOutlinedIcon sx={{ fontSize: 14 }} />, label: "Real-time Monitoring 24/7 Active" },
];

export function AppFooter() {
  const loc = useLocation();
  const isDarkPage = loc.pathname === "/assistant" || loc.pathname.startsWith("/assistant_enhance");

  return (
    <Box
      component="footer"
      sx={{
        mt: "auto",
        flexShrink: 0,
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        px: { xs: 2, md: 2.5 },
        py: { xs: 0.5, md: 0.65 },
        bgcolor: isDarkPage ? "#0B1220" : pnp.footerBg,
        borderTop: "1px solid rgba(148, 163, 184, 0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        flexWrap: "nowrap",
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          flexWrap: "nowrap",
          alignItems: "center",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {BADGES.map((b, idx) => (
          <Box
            key={b.label}
            sx={{

              display: idx >= 2 ? { xs: "none", md: "flex" } : "flex",
              alignItems: "center",
              gap: 0.5,
              color: "rgba(203, 213, 225, 0.9)",
              minWidth: 0,
            }}
          >
            <Box sx={{ "& .MuiSvgIcon-root": { fontSize: 12 } }}>{b.icon}</Box>
            <Typography
              noWrap
              sx={{
                display: { xs: "none", sm: "block" },
                fontSize: "0.53125rem",
                fontWeight: 600,
                letterSpacing: "0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: { sm: 160, md: 220 },
              }}
            >
              {b.label}
            </Typography>
          </Box>
        ))}
      </Stack>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <PoweredByAccessGenie variant="footerCompact" />
      </Box>
    </Box>
  );
}
