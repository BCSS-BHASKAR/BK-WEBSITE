import {
  Box,
  Button,
  Divider,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import BoltIcon from "@mui/icons-material/Bolt";
import { dashboardCustomDatePickerSlotProps } from "../lib/filterRowControls";
import { jumpToTodayButtonSx } from "../lib/jumpToTodayButton";
import type { DatePreset } from "../lib/dashboardRange";
import { daysInclusive, formatRangeTitle } from "../lib/dashboardRange";
import { SITE_LABELS } from "../lib/siteLabels";
import { pnp } from "../lib/pnpTheme";
import { SITE_TIMEZONE, dayjsInSite, formatChartDayTick, ymdSite, ymdSiteYesterday } from "../lib/siteTimeZone";

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
};

const PRESETS: { id: DatePreset; label: string; title?: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "7 days", title: "Last 7 days including today" },
  { id: "last30", label: "30 days", title: "Last 30 days including today" },
  { id: "week", label: "This week", title: "ISO week (Mon–Sun) in site timezone" },
  { id: "month", label: "This month", title: "Calendar month in site timezone" },
  { id: "custom", label: "Custom" },
];

export function DashboardAnalysisWindow({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  resolvedFrom,
  resolvedTo,
  onResetToToday,
  emptyRangeLabel,
}: Props) {
  const today = ymdSite();
  const yesterdayYmd = ymdSiteYesterday();
  const alreadyToday = preset === "today" && resolvedFrom === today && resolvedTo === today;
  const spanDays = daysInclusive(resolvedFrom, resolvedTo);
  const singleDay = resolvedFrom === resolvedTo;
  const headline = formatRangeTitle(resolvedFrom, resolvedTo, emptyRangeLabel);
  const dayTick = resolvedFrom ? formatChartDayTick(resolvedFrom) : "";
  const weekdayShort = singleDay && resolvedFrom ? dayjsInSite(resolvedFrom).format("ddd") : "";
  const sublineRedundant = singleDay && headline === dayTick;
  const compactTodayYesterday =
    singleDay && resolvedFrom && (resolvedFrom === today || resolvedFrom === yesterdayYmd);

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.35, sm: 1.5 },
        borderRadius: `${pnp.cardRadius}px`,
        alignSelf: "flex-start",
        width: "100%",
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        bgcolor: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 14px 36px rgba(2, 6, 23, 0.07), inset 0 1px 0 rgba(255,255,255,0.95)",
        backgroundImage:
          "linear-gradient(165deg, rgba(255,255,255,0.99) 0%, rgba(248,250,252,0.96) 50%, rgba(239,246,255,0.9) 100%)",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          borderRadius: `${pnp.cardRadius}px 0 0 ${pnp.cardRadius}px`,
          background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 55%, #1e3a8a 100%)",
        },
      }}
    >
      <Box sx={{ pl: 0.35, display: "flex", flexDirection: "column", gap: 1.15 }}>
        <Box sx={{ display: "flex", flexDirection: "row", gap: 1, alignItems: "center" }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              bgcolor: "rgba(37, 99, 235, 0.11)",
              color: "primary.main",
              border: "1px solid rgba(37, 99, 235, 0.16)",
            }}
          >
            <CalendarMonthRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1.2,
                fontSize: "1rem",
              }}
            >
              {SITE_LABELS.dateRange}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", display: "block", mt: 0.15 }}>
              {SITE_TIMEZONE}
            </Typography>
          </Box>
        </Box>

        <ToggleButtonGroup
          exclusive
          value={preset}
          onChange={(_, v: DatePreset | null) => {
            if (v) onPresetChange(v);
          }}
          size="small"
          sx={{
            width: "100%",
            flexWrap: "wrap",
            gap: 0.35,
            "& .MuiToggleButtonGroup-grouped": {
              border: "1px solid rgba(15, 23, 42, 0.1) !important",
              borderRadius: "8px !important",
              px: 0.65,
              py: 0.35,
              flex: "1 1 auto",
              minWidth: "calc(33.333% - 3px)",
              maxWidth: "100%",
              fontWeight: 800,
              fontSize: "0.74rem",
              textTransform: "none",
              color: "text.secondary",
              bgcolor: "rgba(255,255,255,0.6)",
              "&.Mui-selected": {
                bgcolor: "rgba(37, 99, 235, 0.14)",
                color: "primary.dark",
                borderColor: "rgba(37, 99, 235, 0.45) !important",
                fontWeight: 900,
                "&:hover": { bgcolor: "rgba(37, 99, 235, 0.2)" },
              },
              "&:hover": { bgcolor: "rgba(15, 23, 42, 0.04)" },
            },
          }}
        >
          {PRESETS.map((p) => (
            <ToggleButton key={p.id} value={p.id} title={p.title}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {preset === "custom" ? (
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              borderRadius: "10px",
              borderColor: "rgba(15, 23, 42, 0.1)",
              bgcolor: "rgba(15, 23, 42, 0.02)",
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr auto 1fr" },
                gap: { xs: 0.75, sm: 0.75 },
                alignItems: "center",
              }}
            >
              <DatePicker
                label="Start"
                format="YYYY-MM-DD"
                value={dayjsInSite(customFrom)}
                onChange={(v) => {
                  if (v?.isValid()) onCustomFromChange(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
                }}
                slotProps={dashboardCustomDatePickerSlotProps}
              />
              <Typography
                variant="body2"
                sx={{
                  display: { xs: "none", sm: "block" },
                  fontWeight: 900,
                  color: "text.disabled",
                  px: 0.35,
                  textAlign: "center",
                }}
              >
                →
              </Typography>
              <DatePicker
                label="End"
                format="YYYY-MM-DD"
                value={dayjsInSite(customTo)}
                onChange={(v) => {
                  if (v?.isValid()) onCustomToChange(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
                }}
                slotProps={dashboardCustomDatePickerSlotProps}
              />
            </Box>
          </Paper>
        ) : null}

        <Divider sx={{ borderColor: "rgba(15, 23, 42, 0.07)" }} />

        <Box
          sx={{
            px: 1.1,
            py: 1,
            borderRadius: "10px",
            border: "1px solid rgba(37, 99, 235, 0.12)",
            bgcolor: "rgba(37, 99, 235, 0.05)",
          }}
        >
          {!singleDay ? (
            <Box
              title={`${resolvedFrom} → ${resolvedTo}`}
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 0.75,
                flexWrap: "wrap",
              }}
            >
              <Typography
                component="div"
                sx={{
                  fontWeight: 800,
                  color: "text.primary",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.35,
                  fontSize: "0.84rem",
                  minWidth: 0,
                }}
              >
                {headline}
              </Typography>
              <Box
                component="span"
                sx={{
                  px: 0.85,
                  py: 0.2,
                  borderRadius: "999px",
                  fontSize: "0.7rem",
                  fontWeight: 900,
                  bgcolor: "rgba(255,255,255,0.92)",
                  color: "primary.main",
                  border: "1px solid rgba(37, 99, 235, 0.2)",
                  flexShrink: 0,
                }}
              >
                {spanDays} days
              </Box>
            </Box>
          ) : compactTodayYesterday ? (
            <Box
              title={resolvedFrom}
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 0.75,
                flexWrap: "wrap",
              }}
            >
              <Typography
                component="div"
                sx={{
                  fontWeight: 800,
                  color: "text.primary",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.35,
                  fontSize: "0.84rem",
                  minWidth: 0,
                }}
              >
                {dayTick}
              </Typography>
              <Box
                component="span"
                sx={{
                  px: 0.85,
                  py: 0.2,
                  borderRadius: "999px",
                  fontSize: "0.7rem",
                  fontWeight: 900,
                  flexShrink: 0,
                  ...(resolvedFrom === today
                    ? {
                        bgcolor: "rgba(255,255,255,0.92)",
                        color: "primary.main",
                        border: "1px solid rgba(37, 99, 235, 0.2)",
                      }
                    : {
                        bgcolor: "rgba(255,255,255,0.92)",
                        color: "text.secondary",
                        border: "1px solid rgba(15, 23, 42, 0.1)",
                      }),
                }}
              >
                {resolvedFrom === today ? "Today" : "Yesterday"}
              </Box>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 0.75,
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  component="div"
                  sx={{
                    fontWeight: 900,
                    color: "text.primary",
                    letterSpacing: "-0.03em",
                    lineHeight: 1.2,
                    fontSize: { xs: "1.02rem", sm: "1.08rem" },
                  }}
                >
                  {headline}
                </Typography>
                <Box
                  component="span"
                  sx={{
                    px: 0.85,
                    py: 0.2,
                    borderRadius: "999px",
                    fontSize: "0.65rem",
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    bgcolor: "rgba(255,255,255,0.92)",
                    color: "text.secondary",
                    border: "1px solid rgba(15, 23, 42, 0.1)",
                    flexShrink: 0,
                  }}
                >
                  {weekdayShort}
                </Box>
              </Box>
              <Typography
                component="div"
                sx={{
                  mt: 0.55,
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  letterSpacing: "-0.01em",
                  color: "text.secondary",
                  lineHeight: 1.45,
                }}
              >
                {sublineRedundant ? (
                  <Box
                    component="span"
                    sx={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "text.disabled",
                    }}
                  >
                    {resolvedFrom}
                  </Box>
                ) : (
                  <>
                    <Box component="span" sx={{ color: "text.primary", fontWeight: 800 }}>
                      {dayTick}
                    </Box>
                    <Typography
                      component="span"
                      sx={{
                        ml: 0.85,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        color: "text.disabled",
                      }}
                    >
                      {resolvedFrom}
                    </Typography>
                  </>
                )}
              </Typography>
            </>
          )}
        </Box>

        <Button
          fullWidth
          size="small"
          variant="contained"
          disableElevation
          disabled={alreadyToday}
          onClick={onResetToToday}
          startIcon={<BoltIcon sx={{ fontSize: 20 }} />}
          sx={{
            ...jumpToTodayButtonSx(alreadyToday),
            py: 0.85,
            fontSize: "0.82rem",
            minHeight: undefined,
          }}
        >
          {SITE_LABELS.jumpToToday}
        </Button>
      </Box>
    </Paper>
  );
}
