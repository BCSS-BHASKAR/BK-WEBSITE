import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import GppGoodOutlined from "@mui/icons-material/GppGoodOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import PsychologyOutlined from "@mui/icons-material/PsychologyOutlined";
import { bk } from "./bkTokens";

const ITEMS: { icon: ReactNode; title: string; blurb: string }[] = [
  { icon: <GppGoodOutlined />, title: "Better Security", blurb: "Real-time monitoring & alerts" },
  { icon: <InsightsOutlined />, title: "Smarter Decisions", blurb: "AI insights to optimize operations" },
  { icon: <TrendingUpOutlined />, title: "Improve Efficiency", blurb: "Track performance, save time" },
  { icon: <PsychologyOutlined />, title: "AI Accuracy", blurb: "Advanced AI with existing cameras" },
];

/**
 * The closing value-proposition strip. Static copy by design - it states what
 * the platform is for, so nothing here is or should be data-driven.
 */
export function BkValueProps() {
  return (
    <Box
      sx={{
        bgcolor: bk.cardMuted,
        border: `1px solid ${bk.line}`,
        borderRadius: `${bk.radius}px`,
        px: { xs: 2, md: 3 },
        py: 2,
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          lg: "repeat(4, minmax(0, 1fr))",
        },
        gap: { xs: 2, lg: 3 },
      }}
    >
      {ITEMS.map((it) => (
        <Box key={it.title} sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <Box
            aria-hidden
            sx={{
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: `${bk.radiusSm}px`,
              bgcolor: "rgba(23, 59, 33, 0.07)",
              color: bk.greenDeep,
              display: "grid",
              placeItems: "center",
              "& .MuiSvgIcon-root": { fontSize: 21 },
            }}
          >
            {it.icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: bk.ink, lineHeight: 1.35 }} noWrap>
              {it.title}
            </Typography>
            <Typography sx={{ fontSize: "0.71875rem", fontWeight: 500, color: bk.muted, lineHeight: 1.4 }} noWrap>
              {it.blurb}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
