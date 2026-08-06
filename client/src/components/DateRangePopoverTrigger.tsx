import { useState } from "react";
import { Box, ButtonBase, Popover, Typography } from "@mui/material";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { DashboardAnalysisWindow } from "./DashboardAnalysisWindow";
import type { DatePreset } from "../lib/dashboardRange";
import { formatRangeTitle, daysInclusive } from "../lib/dashboardRange";
import { SITE_LABELS } from "../i18n/lang";
import { pnp } from "../lib/pnpTheme";

type Props = {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  resolvedFrom: string | null;
  resolvedTo: string | null;
  onResetToToday: () => void;
  emptyRangeLabel?: string;

  compact?: boolean;
};

const PRESET_LABEL: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  week: "This week",
  month: "This month",
  custom: "Custom range",
};

export function DateRangePopoverTrigger({ compact, ...props }: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const spanDays = daysInclusive(props.resolvedFrom, props.resolvedTo);
  const summary = formatRangeTitle(props.resolvedFrom, props.resolvedTo, props.emptyRangeLabel);
  const presetLabel = PRESET_LABEL[props.preset] ?? "Date range";

  return (
    <>
      <ButtonBase
        focusRipple
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexShrink: 1,
          minWidth: 0,
          ...(compact
            ? {
                px: 1.25,
                py: 0.65,
                borderRadius: "8px",
                border: "1px solid rgba(15, 23, 42, 0.1)",
                bgcolor: "#FFFFFF",
                flexShrink: 0,
                width: { xs: 148, sm: 168 },
                maxWidth: 168,
                boxShadow: open ? "0 0 0 3px rgba(37, 99, 235, 0.15)" : "0 1px 2px rgba(15, 23, 42, 0.04)",
              }
            : {
                width: "100%",
                minWidth: { xs: "100%", sm: 280 },
                maxWidth: { xs: "100%", sm: 340 },
                px: 1.5,
                py: 1.1,
                borderRadius: 2,
                border: "1px solid rgba(23,38,56,0.08)",
                bgcolor: "#FFFFFF",
                boxShadow: open
                  ? "0 0 0 3px rgba(95,141,184,0.16)"
                  : "0 1px 2px rgba(23,38,56,0.04)",
              }),
          transition: "box-shadow 0.18s ease",
        }}
      >
        <Box
          sx={{
            width: compact ? 30 : 34,
            height: compact ? 30 : 34,
            borderRadius: 1.5,
            display: "grid",
            placeItems: "center",
            bgcolor: pnp.primarySoft,
            color: pnp.primary,
            flexShrink: 0,
          }}
        >
          <CalendarMonthRoundedIcon sx={{ fontSize: compact ? 18 : 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: compact ? "0.625rem" : "0.75rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "text.secondary",
              lineHeight: 1,
              mb: 0.25,
            }}
          >
            {SITE_LABELS.dateRange}
          </Typography>
          <Typography
            sx={{
              fontWeight: 700,
              color: "text.primary",
              fontSize: compact ? "0.8125rem" : "0.9375rem",
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {presetLabel}
          </Typography>
          {!compact ? (
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: "text.secondary",
                display: "block",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {summary}
              {spanDays > 1 ? ` · ${spanDays}d` : ""}
            </Typography>
          ) : null}
        </Box>
        <KeyboardArrowDownRoundedIcon
          sx={{
            color: "text.secondary",
            fontSize: compact ? 20 : 24,
            transition: "transform 0.18s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </ButtonBase>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: 360,
              maxWidth: "calc(100vw - 32px)",
              borderRadius: 3,
              boxShadow: "0 18px 48px rgba(2, 6, 23, 0.18)",
              overflow: "visible",
            },
          },
        }}
      >
        <DashboardAnalysisWindow {...props} />
      </Popover>
    </>
  );
}
