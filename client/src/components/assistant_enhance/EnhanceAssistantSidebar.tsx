import { useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import SoupKitchenOutlinedIcon from "@mui/icons-material/SoupKitchenOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import type { ReactNode } from "react";
import { chatUi } from "../../lib/chatAssistantTheme";
import { useCameras } from "../../hooks/useCameras";
import { CROWD_ALERT_TYPES, CROWD_ALERT_TYPE_META } from "../../lib/crowdAlertTypes";

type PromptItem = { label: string; message: string; icon: ReactNode; color: string };

const GROUPS: { heading: string; color: string; prompts: PromptItem[] }[] = [
  {
    heading: "WALK-INS",
    color: "#A78BFA",
    prompts: [
      { label: "Walk-ins Today",      message: "How many walk-ins were recorded today?",            icon: <PeopleAltOutlinedIcon  sx={{ fontSize: 18 }} />, color: "#A78BFA" },
      { label: "Walk-ins This Week",  message: "How many walk-ins were recorded this week?",        icon: <PeopleAltOutlinedIcon  sx={{ fontSize: 18 }} />, color: "#A78BFA" },
      { label: "Peak Entry Hour",     message: "What was the peak walk-in hour today?",             icon: <TrendingUpOutlinedIcon sx={{ fontSize: 18 }} />, color: "#34D399" },
      { label: "Top Entrance Camera", message: "Which entrance had the most walk-ins today?",       icon: <VideocamOutlinedIcon   sx={{ fontSize: 18 }} />, color: "#F97316" },
    ],
  },
  {
    heading: "ACTIVE ALERTS",
    color: "#EF4444",
    prompts: [
      { label: "Alerts Today",      message: "Show me all alerts today.",                              icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18 }} />, color: "#EF4444" },
      { label: "Alerts This Week",  message: "Show me all alerts this week.",                          icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18 }} />, color: "#EF4444" },
      { label: "Most Common Type",  message: "Which alert type was most frequent this week?",          icon: <GroupsOutlinedIcon       sx={{ fontSize: 18 }} />, color: "#F97316" },
      { label: "Alerts This Month", message: "Show me all alerts this month.",                         icon: <TrendingUpOutlinedIcon   sx={{ fontSize: 18 }} />, color: "#06B6D4" },
    ],
  },
  {
    heading: "KITCHEN UNATTENDED",
    color: chatUi.success,
    prompts: [
      { label: "Unattended Today",     message: "How many times was the kitchen unattended today?",          icon: <SoupKitchenOutlinedIcon sx={{ fontSize: 18 }} />, color: chatUi.success },
      { label: "Unattended This Week", message: "How many times was the kitchen unattended this week?",       icon: <BarChartOutlinedIcon    sx={{ fontSize: 18 }} />, color: "#06B6D4" },
      { label: "Worst Day",            message: "Which day had the most unattended kitchen records?",         icon: <TrendingUpOutlinedIcon  sx={{ fontSize: 18 }} />, color: chatUi.warning },
      { label: "Understaffed Count",   message: "How many understaffed kitchen alerts were raised this week?", icon: <PeopleAltOutlinedIcon   sx={{ fontSize: 18 }} />, color: "#A78BFA" },
    ],
  },
  {
    heading: "DAILY REPORTS",
    color: "#38BDF8",
    prompts: [
      { label: "Walk-ins Report — Today",  message: "Show me the walk-ins summary for today.",       icon: <PeopleAltOutlinedIcon    sx={{ fontSize: 18 }} />, color: "#A78BFA" },
      { label: "Alerts Report — Today",    message: "Show me the alert summary for today.",           icon: <WarningAmberOutlinedIcon sx={{ fontSize: 18 }} />, color: "#EF4444" },
      { label: "Kitchen Report — Today",   message: "Show me the kitchen staffing summary for today.", icon: <SoupKitchenOutlinedIcon  sx={{ fontSize: 18 }} />, color: chatUi.success },
    ],
  },
];

const ALERT_TYPE_SUMMARY = CROWD_ALERT_TYPES.map((t) => CROWD_ALERT_TYPE_META[t].shortLabel).join(", ");

function dataItems(cameraNames: string[]): { title: string; subtitle: string; icon: ReactNode; bg: string }[] {
  return [
    { title: "Guest Footfall",  subtitle: "Walk-in counts, peak hours and gender mix",       icon: <PeopleAltOutlinedIcon />,   bg: "rgba(167, 139, 250, 0.2)" },
    { title: "Active Alerts",   subtitle: ALERT_TYPE_SUMMARY,                                 icon: <WarningAmberOutlinedIcon />, bg: "rgba(239, 68, 68, 0.2)" },
    { title: "Kitchen Unattended", subtitle: "Records where no staff was detected in the kitchen", icon: <SoupKitchenOutlinedIcon />, bg: "rgba(34, 197, 94, 0.2)" },
    { title: "Trends",          subtitle: "Daily and hourly patterns across the venue",       icon: <BarChartOutlinedIcon />,    bg: "rgba(59, 130, 246, 0.2)" },
    {
      title: "Camera Areas",
      subtitle: cameraNames.length ? cameraNames.join(", ") : "Loading…",
      icon: <VideocamOutlinedIcon />,
      bg: "rgba(249, 115, 22, 0.2)",
    },
  ];
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ borderRadius: chatUi.radius, border: chatUi.border, bgcolor: chatUi.surface, p: 2, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Box sx={{ color: chatUi.primary, display: "flex" }}>{icon}</Box>
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: chatUi.text }}>{title}</Typography>
      </Box>
      {children}
    </Box>
  );
}

export function EnhanceAssistantSidebar({
  onPrompt,
  disabled = false,
}: {
  onPrompt: (message: string) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState<string>(GROUPS[0].heading);
  // Camera names come from the live registry so this list never drifts from the
  // names shown on Live View.
  const camerasQ = useCameras();
  const DATA_ITEMS = dataItems((camerasQ.data?.cameras ?? []).map((c) => c.name));

  return (
    <Box sx={{ width: { xs: "100%", lg: 300 }, flexShrink: 0, display: "flex", flexDirection: "column", gap: 0 }}>
      <Panel title="Quick Questions" icon={<AutoAwesomeIcon sx={{ fontSize: 18 }} />}>
        {GROUPS.map((group) => (
          <Accordion
            key={group.heading}
            expanded={expanded === group.heading}
            onChange={() => setExpanded(expanded === group.heading ? "" : group.heading)}
            disableGutters
            elevation={0}
            sx={{
              bgcolor: "transparent",
              boxShadow: "none",
              "&:before": { display: "none" },
              "&.Mui-expanded": { margin: 0 },
              borderBottom: `1px solid rgba(148, 163, 184, 0.08)`,
              "&:last-child": { borderBottom: "none" },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ fontSize: 16, color: group.color }} />}
              sx={{
                minHeight: 0,
                px: 1,
                py: 0.75,
                "&.Mui-expanded": { minHeight: 0 },
                "& .MuiAccordionSummary-content": { margin: 0 },
                "& .MuiAccordionSummary-content.Mui-expanded": { margin: 0 },
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: group.color,
                }}
              >
                {group.heading}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, pb: 0.5 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                {group.prompts.map((p) => (
                  <Box
                    key={p.label}
                    component="button"
                    type="button"
                    onClick={() => !disabled && onPrompt(p.message)}
                    disabled={disabled}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.5 : 1,
                      borderRadius: chatUi.radiusSm,
                      py: 0.875,
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
                  </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
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
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: chatUi.text, lineHeight: 1.3 }}>{d.title}</Typography>
                <Typography sx={{ fontSize: "0.6875rem", color: chatUi.textSecondary, lineHeight: 1.4, mt: 0.25 }}>{d.subtitle}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Panel>
    </Box>
  );
}
