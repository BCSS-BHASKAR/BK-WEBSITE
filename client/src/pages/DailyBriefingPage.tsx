import { useCallback, useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { api } from "../lib/api";
import { useShellHeader } from "../context/ShellHeaderContext";
import { MastheadDashboardToolbar } from "../components/MastheadDashboardToolbar";
import {
  type DatePreset,
  defaultTodayRange,
  datedRangeFromPreset,
} from "../lib/dashboardRange";
import { downloadDailyBriefingPdf } from "../lib/dailyBriefingPdf";
import { crowdAlertTypeColor } from "../lib/crowdAlertTypes";
import { SITE_BRANDING } from "../i18n/lang";
import { pnp } from "../lib/pnpTheme";

export type DailyBriefingData = {
  meta: {
    from: string;
    to: string;
    spanDays: number;
    generatedAt: string;
    generatedAtLabel: string;
    comparisonWindowLabel?: string;
    generatedBy: string;
    reportDateLabel: string;
    preparedFor: string;
  };
  report: {
    operationalStatus: string;
    operationalStatusLabel: string;
    aiConfidenceScore: number;
    executiveSummary: string;
    aiNarrative: string;
    comparisonPeriodLabel?: string;
    /** Same as comparisonPeriodLabel but with the article, for full sentences. */
    comparisonProseLabel?: string;
    comparisonWindowLabel?: string;
    keyFindings: {
      id: string;
      title: string;
      value: string;
      detail: string;
      badge: string;
      badgeTone: "danger" | "warning" | "success" | "info" | "neutral";
      changeDirection?: "up" | "down" | "flat";
      changePct?: number;
      changeLabel?: string;
      priorValue?: number;
      currentValue?: number;
    }[];
    /** One row per monitored camera area, ranked by alert volume. */
    areaRanking: {
      rank: number;
      name: string;
      cameraId: string;
      alerts: number;
      walkins: number;
      alertSharePct: number;
      riskLevel: string;
      trend: string;
      trendPct?: number;
      changeLabel?: string;
    }[];
    alertBreakdown: {
      code: string;
      label: string;
      count: number;
      priorCount?: number;
      changePct?: number;
      changeDirection?: "up" | "down" | "flat";
      changeLabel?: string;
      sharePct: number;
    }[];
    recommendations: {
      priority: number;
      label: string;
      title: string;
      body: string;
      tone: "danger" | "warning" | "info" | "success";
    }[];
    archive: {
      from: string;
      to: string;
      dateLabel: string;
      reportType: string;
      generatedAtLabel?: string | null;
      isCurrent: boolean;
    }[];
    genderMix: { male: number; female: number; unknown: number };
    totalWalkins: number;
    totalAlerts: number;
  };
};

const reportPaperSx = {
  borderRadius: "12px",
  border: pnp.cardBorder,
  bgcolor: pnp.cardBg,
  boxShadow: pnp.cardShadow,
  overflow: "hidden",
} as const;

function badgeSx(tone: string) {
  const map: Record<string, { bg: string; color: string }> = {
    danger: { bg: pnp.dangerSoft, color: pnp.danger },
    warning: { bg: pnp.warningSoft, color: pnp.warning },
    success: { bg: pnp.successSoft, color: pnp.success },
    info: { bg: pnp.primarySoft, color: pnp.primaryDark },
    neutral: { bg: "rgba(74,18,32,0.07)", color: pnp.textSecondary },
  };
  const c = map[tone] || map.neutral;
  return { fontWeight: 800, bgcolor: c.bg, color: c.color };
}

function riskSx(level: string) {
  const l = level.toLowerCase();
  if (l === "high") return { bgcolor: pnp.dangerSoft, color: pnp.danger };
  if (l === "medium") return { bgcolor: pnp.warningSoft, color: pnp.warning };
  return { bgcolor: pnp.successSoft, color: pnp.success };
}

function TrendGlyph({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUpIcon sx={{ fontSize: 18, color: pnp.danger }} />;
  if (trend === "down") return <TrendingDownIcon sx={{ fontSize: 18, color: pnp.success }} />;
  return <TrendingFlatIcon sx={{ fontSize: 18, color: pnp.textSecondary }} />;
}

function changeLabelColor(direction?: string) {
  if (direction === "up") return pnp.danger;
  if (direction === "down") return pnp.success;
  return pnp.textSecondary;
}

function MetaItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", minWidth: 0 }}>
      <Box sx={{ color: pnp.primary, mt: 0.15 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, color: pnp.textSecondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, color: pnp.text, lineHeight: 1.35 }}>{value}</Typography>
      </Box>
    </Box>
  );
}

function alertBarColor(code: string) {
  return crowdAlertTypeColor(code).color;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ textAlign: { xs: "left", md: "right" } }}>
      <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, color: pnp.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "1.375rem", fontWeight: 900, color: pnp.text, lineHeight: 1.15 }}>{value}</Typography>
    </Box>
  );
}

export function DailyBriefingPage() {
  const { setRightSlot } = useShellHeader();
  const initial = defaultTodayRange();
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState(initial.from);
  const [customTo, setCustomTo] = useState(initial.to);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const { from: resolvedFrom, to: resolvedTo } = datedRangeFromPreset(preset, customFrom, customTo);

  const briefingQ = useQuery({
    queryKey: ["daily-briefing", resolvedFrom, resolvedTo],
    queryFn: async ({ signal }) =>
      (await api.get<DailyBriefingData>("/dashboard/daily-briefing", { params: { from: resolvedFrom, to: resolvedTo }, signal }))
        .data,
    placeholderData: keepPreviousData,
  });

  const data = briefingQ.data;
  const report = data?.report;

  const resetToToday = useCallback(() => {
    const t = defaultTodayRange();
    setPreset("today");
    setCustomFrom(t.from);
    setCustomTo(t.to);
  }, []);

  useEffect(() => {
    setRightSlot(
      <MastheadDashboardToolbar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        resolvedFrom={resolvedFrom}
        resolvedTo={resolvedTo}
        onResetToToday={resetToToday}
      />
    );
    return () => setRightSlot(null);
  }, [preset, customFrom, customTo, resolvedFrom, resolvedTo, resetToToday, setRightSlot]);

  const handleEmail = async () => {
    setEmailMsg(null);
    try {
      const { data: res } = await api.post<{ ok: boolean; message?: string }>("/dashboard/daily-briefing/email", {
        from: resolvedFrom,
        to: resolvedTo,
      });
      setEmailMsg(res.message || "Brief queued for email.");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Email is not configured. Download the PDF instead.";
      setEmailMsg(msg);
    }
  };

  const downloadArchive = async (archiveFrom: string, archiveTo: string) => {
    setPdfBusy(true);
    try {
      const { data: archiveData } = await api.get<DailyBriefingData>("/dashboard/daily-briefing", {
        params: { from: archiveFrom, to: archiveTo },
      });
      downloadDailyBriefingPdf(archiveData, "full");
    } finally {
      setPdfBusy(false);
    }
  };

  const maxAlertCount = Math.max(1, ...(report?.alertBreakdown.map((v) => v.count) || [1]));

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", pb: 4 }}>
      {emailMsg ? (
        <Alert severity="info" onClose={() => setEmailMsg(null)} sx={{ mb: 2 }}>
          {emailMsg}
        </Alert>
      ) : null}
      {briefingQ.isError ? <Alert severity="error" sx={{ mb: 2 }}>Failed to load the daily brief.</Alert> : null}

      {}
      <Paper sx={{ ...reportPaperSx, mb: 2.5 }}>
        <Box
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2.5,
            background: `linear-gradient(180deg, ${pnp.primarySoft} 0%, rgba(255,255,255,0) 100%)`,
            borderBottom: "1px solid rgba(74,18,32,0.07)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 2 }}>
            <InsightsOutlinedIcon sx={{ color: pnp.navy, fontSize: 28 }} />
            <Typography
              sx={{
                fontWeight: 900,
                fontSize: { xs: "0.95rem", sm: "1.05rem" },
                letterSpacing: "0.14em",
                color: pnp.navy,
                textAlign: "center",
              }}
            >
              INTELLIGENCE BRIEF
            </Typography>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, minmax(0, 1fr))" },
              gap: 2,
            }}
          >
            <MetaItem icon={<CalendarTodayOutlinedIcon fontSize="small" />} label="Report Date" value={data?.meta.reportDateLabel || "—"} />
            <MetaItem icon={<AccessTimeOutlinedIcon fontSize="small" />} label="Generated At" value={data?.meta.generatedAtLabel || "—"} />
            <MetaItem
              icon={<GroupsOutlinedIcon fontSize="small" />}
              label="Prepared For"
              value={data?.meta.preparedFor || `${SITE_BRANDING.productName} — Venue Operations`}
            />
            <MetaItem
              icon={<VerifiedUserOutlinedIcon fontSize="small" />}
              label="Operational Status"
              value={report?.operationalStatusLabel || "—"}
            />
            <MetaItem
              icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
              label="AI Confidence"
              value={report ? `${report.aiConfidenceScore}%` : "—"}
            />
          </Box>
          {report ? (
            <Box sx={{ mt: 1.5, display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" }, gap: 1, flexWrap: "wrap" }}>
              <Chip
                size="small"
                label={report.operationalStatusLabel}
                sx={{
                  ...(report.operationalStatus === "NORMAL"
                    ? badgeSx("success")
                    : report.operationalStatus === "ELEVATED"
                      ? badgeSx("warning")
                      : badgeSx("danger")),
                  fontWeight: 900,
                }}
              />
              <Chip size="small" label="High Confidence" sx={{ ...badgeSx("info"), fontWeight: 800 }} />
            </Box>
          ) : null}
        </Box>
      </Paper>

      {}
      <Paper sx={{ ...reportPaperSx, p: { xs: 2, sm: 2.5 }, mb: 2.5 }}>
        <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: pnp.text, mb: 1.5 }}>Executive Summary</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr auto" }, gap: 2, alignItems: "center" }}>
          <Typography sx={{ fontSize: "0.9375rem", lineHeight: 1.75, color: pnp.textSecondary, fontWeight: 500 }}>
            {report?.executiveSummary ||
              (briefingQ.isLoading ? "Generating the venue summary from live data…" : "No summary available for this period.")}
          </Typography>
          <Box
            sx={{
              minWidth: { md: 150 },
              borderRadius: 2,
              bgcolor: pnp.primarySoft,
              border: `1px solid rgba(184,134,11,0.22)`,
              px: 2,
              py: 1.75,
              display: "grid",
              gap: 1.25,
            }}
          >
            {/* The entrance camera counts everyone who walks in — customers,
                staff, delivery riders — so this is "entries", not "guests". */}
            <SummaryStat label="Entries" value={(report?.totalWalkins ?? 0).toLocaleString()} />
            <SummaryStat label="Alerts" value={(report?.totalAlerts ?? 0).toLocaleString()} />
          </Box>
        </Box>
      </Paper>

      {}
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, mb: 1.25, flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: pnp.text }}>Key Findings</Typography>
        {report?.comparisonPeriodLabel ? (
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: pnp.textSecondary }}>
            Compared with {report.comparisonProseLabel ?? report.comparisonPeriodLabel}
            {report.comparisonWindowLabel ? ` (${report.comparisonWindowLabel})` : ""}
          </Typography>
        ) : null}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(5, minmax(0, 1fr))" },
          gap: 1.25,
          mb: 2.5,
        }}
      >
        {(report?.keyFindings || []).map((f) => (
          <Paper key={f.id} sx={{ ...reportPaperSx, p: 1.5 }}>
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, color: pnp.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {f.title}
            </Typography>
            <Typography sx={{ mt: 0.75, fontWeight: 900, fontSize: "1.05rem", color: pnp.text, lineHeight: 1.2 }}>{f.value}</Typography>
            {f.changeLabel ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                <TrendGlyph trend={f.changeDirection === "flat" ? "stable" : f.changeDirection || "stable"} />
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: changeLabelColor(f.changeDirection) }}>
                  {f.changeLabel}
                </Typography>
              </Box>
            ) : null}
            <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: pnp.textSecondary, fontWeight: 600, lineHeight: 1.35 }}>{f.detail}</Typography>
            <Chip size="small" label={f.badge} sx={{ mt: 1.25, ...badgeSx(f.badgeTone), fontWeight: 800 }} />
          </Paper>
        ))}
      </Box>

      {}
      <Paper sx={{ ...reportPaperSx, p: { xs: 2, sm: 2.5 }, mb: 2.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr auto" }, gap: 2, alignItems: "center" }}>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: pnp.text }}>AI Narrative</Typography>
              <Chip size="small" label="Beta" sx={{ ...badgeSx("info"), fontWeight: 800 }} />
            </Box>
            <Typography sx={{ fontSize: "0.9375rem", lineHeight: 1.8, color: pnp.textSecondary, fontWeight: 500 }}>
              {report?.aiNarrative ||
                (briefingQ.isLoading ? "Composing the venue narrative…" : "No narrative available.")}
            </Typography>
          </Box>
          <PsychologyOutlinedIcon sx={{ fontSize: 72, color: pnp.purpleSoft, justifySelf: "center" }} />
        </Box>
      </Paper>

      {}
      <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: pnp.text, mb: 1.25 }}>Venue Data</Typography>
      {/* alignItems:start so each card keeps its natural height instead of the
          shorter one stretching to match. */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.2fr 0.8fr" }, gap: 2, mb: 2.5, alignItems: "start" }}>
        <Paper sx={{ ...reportPaperSx, p: 2 }}>
          <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", mb: 1.5 }}>Monitored Area Ranking</Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    "Rank",
                    "Monitored Area",
                    "Alerts",
                    "Entries",
                    "Risk Level",
                    report?.comparisonPeriodLabel ? `vs ${report.comparisonPeriodLabel}` : "Trend",
                  ].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 900, fontSize: "0.6875rem", color: pnp.textSecondary, whiteSpace: "nowrap" }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {(report?.areaRanking || []).slice(0, 10).map((s) => (
                  <TableRow key={s.cameraId} hover>
                    <TableCell sx={{ fontWeight: 900 }}>{s.rank}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{s.name}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{s.alerts}</TableCell>
                    <TableCell>{s.walkins.toLocaleString()}</TableCell>
                    <TableCell>
                      <Chip size="small" label={s.riskLevel} sx={{ fontWeight: 800, ...riskSx(s.riskLevel) }} />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <TrendGlyph trend={s.trend} />
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: changeLabelColor(s.trend) }}>
                          {s.changeLabel || "—"}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {!(report?.areaRanking || []).length ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ color: pnp.textSecondary, fontWeight: 600, textAlign: "center", py: 3 }}>
                      No entries or alerts recorded in this period.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Box>
        </Paper>

        <Paper sx={{ ...reportPaperSx, p: 2 }}>
          <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", mb: 1.5 }}>Alert Breakdown</Typography>
          <Stack spacing={1.5}>
            {(report?.alertBreakdown || []).map((v) => (
              <Box key={v.code}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5, gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{v.label}</Typography>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: pnp.textSecondary }}>
                      {v.count} ({v.sharePct}%)
                    </Typography>
                    {v.changeLabel ? (
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.35 }}>
                        <TrendGlyph trend={v.changeDirection === "flat" ? "stable" : v.changeDirection || "stable"} />
                        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, color: changeLabelColor(v.changeDirection) }}>
                          {v.changeLabel}
                        </Typography>
                      </Box>
                    ) : null}
                  </Box>
                </Box>
                <Box sx={{ height: 10, borderRadius: 1, bgcolor: "rgba(74,18,32,0.06)", overflow: "hidden" }}>
                  <Box
                    sx={{
                      height: "100%",
                      width: `${(v.count / maxAlertCount) * 100}%`,
                      bgcolor: alertBarColor(v.code),
                      borderRadius: 1,
                    }}
                  />
                </Box>
              </Box>
            ))}
            {!(report?.alertBreakdown || []).length ? (
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: pnp.textSecondary, py: 2, textAlign: "center" }}>
                No alerts raised in this period.
              </Typography>
            ) : null}
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ textAlign: "right", fontWeight: 900, fontSize: "1.1rem", color: pnp.text }}>
            Total Alerts: {(report?.totalAlerts ?? 0).toLocaleString()}
          </Typography>
        </Paper>
      </Box>

      {}
      <Typography sx={{ fontWeight: 900, fontSize: "1rem", color: pnp.text, mb: 1.25 }}>Operational Recommendations</Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, minmax(0, 1fr))" },
          gap: 1.25,
          mb: 2.5,
        }}
      >
        {(report?.recommendations || []).map((r) => (
          <Paper
            key={r.priority}
            sx={{
              ...reportPaperSx,
              p: 1.75,
              borderLeft: `4px solid ${
                r.tone === "danger" ? pnp.danger : r.tone === "warning" ? pnp.warning : r.tone === "info" ? pnp.primary : pnp.success
              }`,
            }}
          >
            <Chip size="small" label={r.label} sx={{ mb: 1, ...badgeSx(r.tone), fontWeight: 800 }} />
            <Typography sx={{ fontWeight: 900, fontSize: "0.875rem", mb: 0.75, lineHeight: 1.35 }}>{r.title}</Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, lineHeight: 1.55, fontWeight: 500 }}>{r.body}</Typography>
          </Paper>
        ))}
      </Box>

      {}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, mb: 2, alignItems: "start" }}>
        <Paper sx={{ ...reportPaperSx, p: 2 }}>
          <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", mb: 1.5 }}>Daily Briefing Archive</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                {["Date", "Report Type", "Generated", ""].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 900, fontSize: "0.6875rem", color: pnp.textSecondary }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {(report?.archive || []).map((a) => (
                <TableRow key={a.from} selected={a.isCurrent}>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>{a.dateLabel}</TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem" }}>{a.reportType}</TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", color: pnp.textSecondary }}>{a.generatedAtLabel || "—"}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="text"
                      disabled={pdfBusy}
                      onClick={() => void downloadArchive(a.from, a.to)}
                      sx={{ fontWeight: 800, textTransform: "none" }}
                    >
                      Download PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ ...reportPaperSx, p: 2 }}>
          <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem", mb: 0.5 }}>Export Daily Brief</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, mb: 2 }}>
            Download or share today&apos;s venue report with the management team.
          </Typography>
          <Stack spacing={1}>
            <Button
              variant="contained"
              fullWidth
              size="large"
              startIcon={<DownloadOutlinedIcon />}
              disabled={!data || pdfBusy}
              onClick={() => data && downloadDailyBriefingPdf(data, "full")}
              sx={{ fontWeight: 900, py: 1.35, borderRadius: 2 }}
            >
              Download Daily Venue Brief (PDF)
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<DownloadOutlinedIcon />}
              disabled={!data || pdfBusy}
              onClick={() => data && downloadDailyBriefingPdf(data, "executive")}
              sx={{ fontWeight: 800, borderRadius: 2 }}
            >
              Download Executive Summary (PDF)
            </Button>
            <Button variant="outlined" fullWidth startIcon={<EmailOutlinedIcon />} disabled={!data} onClick={() => void handleEmail()} sx={{ fontWeight: 800, borderRadius: 2 }}>
              Email Daily Brief
            </Button>
            <Button variant="outlined" fullWidth startIcon={<ScheduleOutlinedIcon />} disabled sx={{ fontWeight: 800, borderRadius: 2 }}>
              Schedule Daily Brief
            </Button>
          </Stack>
        </Paper>
      </Box>

      <Typography sx={{ textAlign: "center", fontSize: "0.75rem", color: pnp.textMuted, fontWeight: 600 }}>
        {SITE_BRANDING.productName} — Authorized staff only · AI generated report · Data as of{" "}
        {data?.meta.generatedAtLabel || "—"}, {data?.meta.reportDateLabel || "—"}
      </Typography>
    </Box>
  );
}
