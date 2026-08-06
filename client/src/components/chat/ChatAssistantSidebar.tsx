import { Box, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import type { ReactNode } from "react";
import { chatUi } from "../../lib/chatAssistantTheme";
import { listKnownSiteNames } from "../../lib/chatSites";

const PROMPTS: { label: string; message: string; icon: ReactNode; color: string }[] = [
  { label: "Situation today", message: "situation today", icon: <BoltOutlinedIcon sx={{ fontSize: 18 }} />, color: chatUi.primary },
  { label: "Violations at Highway", message: "violations at Highway today", icon: <PolicyOutlinedIcon sx={{ fontSize: 18 }} />, color: chatUi.warning },
  { label: "Wrong parking today", message: "wrong parking today", icon: <PolicyOutlinedIcon sx={{ fontSize: 18 }} />, color: chatUi.success },
  { label: "Top violations this month", message: "top violations this month", icon: <TrendingUpOutlinedIcon sx={{ fontSize: 18 }} />, color: "#EAB308" },
  { label: "Camera status overview", message: "list cameras", icon: <VideocamOutlinedIcon sx={{ fontSize: 18 }} />, color: "#A78BFA" },
];

const DATA_ITEMS: { title: string; subtitle: string; icon: ReactNode; bg: string }[] = [
  { title: "Plate Reads (ANPR)", subtitle: "Search and analytics", icon: <DirectionsCarOutlinedIcon />, bg: "rgba(59, 130, 246, 0.2)" },
  { title: "Traffic Volumes", subtitle: "Vehicle counts and trends", icon: <BarChartOutlinedIcon />, bg: "rgba(34, 197, 94, 0.2)" },
  { title: "Watchlist Hits", subtitle: "Matches and alerts", icon: <GroupsOutlinedIcon />, bg: "rgba(167, 139, 250, 0.2)" },
  {
    title: "Violations",
    subtitle: "Wrong route, no helmet, triple riding, wrong parking",
    icon: <PolicyOutlinedIcon />,
    bg: "rgba(239, 68, 68, 0.2)",
  },
  {
    title: "Camera Sites",
    subtitle: listKnownSiteNames().join(", "),
    icon: <VideocamOutlinedIcon />,
    bg: "rgba(249, 115, 22, 0.2)",
  },
];

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Box
      sx={{
        borderRadius: chatUi.radius,
        border: chatUi.border,
        bgcolor: chatUi.surface,
        p: 2,
        mb: 2,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Box sx={{ color: chatUi.primary, display: "flex" }}>{icon}</Box>
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: chatUi.text }}>{title}</Typography>
      </Box>
      {children}
    </Box>
  );
}

export function ChatAssistantSidebar({ onPrompt }: { onPrompt: (message: string) => void }) {
  return (
    <Box
      sx={{
        width: { xs: "100%", lg: 300 },
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      <Panel title="Suggested Prompts" icon={<AutoAwesomeIcon sx={{ fontSize: 18 }} />}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {PROMPTS.map((p) => (
            <Box
              key={p.label}
              component="button"
              type="button"
              onClick={() => onPrompt(p.message)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                width: "100%",
                textAlign: "left",
                border: "none",
                cursor: "pointer",
                borderRadius: chatUi.radiusSm,
                py: 1,
                px: 1,
                bgcolor: "transparent",
                color: chatUi.text,
                transition: "background 0.15s",
                "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: `${p.color}22`,
                  color: p.color,
                  flexShrink: 0,
                }}
              >
                {p.icon}
              </Box>
              <Typography sx={{ flex: 1, fontSize: "0.8125rem", fontWeight: 500 }}>{p.label}</Typography>
              <ChevronRightIcon sx={{ fontSize: 18, color: chatUi.textMuted }} />
            </Box>
          ))}
        </Box>
      </Panel>

      <Panel title="Data I Can Help With" icon={<BarChartOutlinedIcon sx={{ fontSize: 18 }} />}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {DATA_ITEMS.map((d) => (
            <Box key={d.title} sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "8px",
                  bgcolor: d.bg,
                  color: chatUi.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  "& .MuiSvgIcon-root": { fontSize: 20 },
                }}
              >
                {d.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: chatUi.text, lineHeight: 1.3 }}>
                  {d.title}
                </Typography>
                <Typography sx={{ fontSize: "0.6875rem", color: chatUi.textSecondary, lineHeight: 1.4, mt: 0.25 }}>
                  {d.subtitle}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Panel>
    </Box>
  );
}
