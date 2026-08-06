import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { SITE_LABELS } from "../i18n/lang";
import { SITE_CONFIG } from "../config/siteConfig";
import { SITE_TIMEZONE } from "../lib/siteTimeZone";
import { pnp } from "../lib/pnpTheme";

dayjs.extend(utc);
dayjs.extend(timezone);

type Props = {

  compact?: boolean;
};

export function ManilaSiteClock({ compact }: Props) {
  const [now, setNow] = useState(() => dayjs().tz(SITE_TIMEZONE));

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(dayjs().tz(SITE_TIMEZONE));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (compact) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.25,
          py: 0.65,
          borderRadius: "8px",
          border: "1px solid rgba(15, 23, 42, 0.1)",
          bgcolor: "#FFFFFF",
          flexShrink: 0,
          minWidth: 0,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <AccessTimeOutlinedIcon sx={{ fontSize: 18, color: pnp.primary, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "0.5625rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: pnp.textSecondary,
              lineHeight: 1,
            }}
          >
            {SITE_LABELS.siteWallClock}
          </Typography>
          <Typography
            sx={{
              fontWeight: 800,
              color: pnp.text,
              fontSize: "1rem",
              lineHeight: 1.15,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {now.format("HH:mm:ss")}
          </Typography>
        </Box>
        <Typography
          sx={{
            fontWeight: 600,
            color: pnp.textSecondary,
            fontSize: "0.6875rem",
            whiteSpace: "nowrap",
            display: { xs: "none", sm: "block" },
            pl: 0.5,
            borderLeft: "1px solid rgba(15, 23, 42, 0.08)",
            ml: 0.25,
          }}
        >
          {now.format("D MMM YYYY")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flexShrink: 0,
        minWidth: { xs: "100%", sm: 260 },
        maxWidth: { sm: 300 },
        borderRadius: "8px",
        border: "1px solid rgba(15, 23, 42, 0.1)",
        bgcolor: "#FFFFFF",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        px: 1.5,
        py: 0.9,
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: "0.625rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: pnp.textSecondary,
            lineHeight: 1,
          }}
        >
          {SITE_LABELS.siteWallClock}
        </Typography>
        <Typography
          sx={{
            fontWeight: 800,
            color: pnp.text,
            fontSize: { xs: "1.375rem", sm: "1.5rem" },
            lineHeight: 1,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {now.format("HH:mm:ss")}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mt: 0.25 }}>
        <Typography sx={{ fontWeight: 700, color: pnp.text, fontSize: "0.85rem" }}>
          {SITE_CONFIG.region.label}
        </Typography>
        <Typography sx={{ fontWeight: 600, color: pnp.textSecondary, fontSize: "0.72rem" }}>
          {now.format("D MMM YYYY")}
        </Typography>
      </Box>
    </Box>
  );
}
