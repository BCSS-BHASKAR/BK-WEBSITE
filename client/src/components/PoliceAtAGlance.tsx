import type { ReactNode } from "react";
import { Box, ButtonBase, Paper, Skeleton, Typography } from "@mui/material";
import PolicyIcon from "@mui/icons-material/Policy";
import VideocamIcon from "@mui/icons-material/Videocam";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import { SITE_LABELS } from "../i18n/lang";
import { summaryCardSx } from "../lib/uiSurfaces";

type GlanceCardProps = {
  title: string;
  value: ReactNode;
  explanation: string;
  icon: ReactNode;
  accent: string;
  alert?: boolean;
  pending?: boolean;
  onClick?: () => void;
};

function GlanceCard({ title, value, explanation, icon, accent, alert, pending, onClick }: GlanceCardProps) {
  const inner = (
    <Paper
      elevation={0}
      sx={{
        ...summaryCardSx,
        borderLeft: `4px solid ${accent}`,
        ...(alert
          ? {
              bgcolor: "rgba(254, 242, 242, 0.5)",
              borderColor: "rgba(220, 38, 38, 0.2)",
              borderLeftColor: accent,
            }
          : {}),
        ...(onClick
          ? {
              cursor: "pointer",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: "0 10px 28px rgba(31, 74, 117, 0.14)",
              },
            }
          : {}),
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 1.5,
            display: "grid",
            placeItems: "center",
            bgcolor: `${accent}20`,
            color: accent,
            border: `1px solid ${accent}35`,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem", color: "text.secondary", letterSpacing: "0.02em" }}>
            {title}
          </Typography>
          {pending ? (
            <Skeleton width={80} height={40} sx={{ mt: 0.5 }} />
          ) : (
            <Typography
              sx={{
                mt: 0.25,
                fontWeight: 800,
                fontSize: { xs: "1.75rem", sm: "2rem" },
                lineHeight: 1.1,
                color: alert ? "#B91C1C" : "#0F2A44",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {value}
            </Typography>
          )}
        </Box>
      </Box>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.4, fontWeight: 500 }}>
        {explanation}
      </Typography>
    </Paper>
  );

  if (!onClick) return inner;
  return (
    <ButtonBase onClick={onClick} sx={{ display: "block", width: "100%", height: "100%", textAlign: "left", borderRadius: 2.5 }}>
      {inner}
    </ButtonBase>
  );
}

type Props = {
  violations: number;
  platesScanned: number;
  watchlistMatches: number;
  camerasOnline: number;
  camerasTotal: number;
  pending?: boolean;
  onOpenViolations: () => void;
  onOpenVehicleRecords: () => void;
  onOpenWatchlist: () => void;
  onOpenLiveCameras: () => void;
};

export function PoliceAtAGlance({
  violations,
  platesScanned,
  watchlistMatches,
  camerasOnline,
  camerasTotal,
  pending,
  onOpenViolations,
  onOpenVehicleRecords,
  onOpenWatchlist,
  onOpenLiveCameras,
}: Props) {
  const camerasOffline = Math.max(0, camerasTotal - camerasOnline);
  const allOnline = camerasTotal > 0 && camerasOffline === 0;

  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        <GlanceCard
          title={SITE_LABELS.violationsDetected}
          value={violations.toLocaleString()}
          explanation={SITE_LABELS.violationsDetectedHint}
          icon={<PolicyIcon sx={{ fontSize: 28 }} />}
          accent="#2F5F8A"
          alert={violations > 0}
          pending={pending}
          onClick={onOpenViolations}
        />
        <GlanceCard
          title={SITE_LABELS.platesScanned}
          value={platesScanned.toLocaleString()}
          explanation={SITE_LABELS.platesScannedHint}
          icon={<DirectionsCarFilledIcon sx={{ fontSize: 28 }} />}
          accent="#2563EB"
          pending={pending}
          onClick={onOpenVehicleRecords}
        />
        <GlanceCard
          title={SITE_LABELS.watchlistAlerts}
          value={watchlistMatches.toLocaleString()}
          explanation={SITE_LABELS.watchlistAlertsHint}
          icon={<WarningAmberRoundedIcon sx={{ fontSize: 28 }} />}
          accent="#7C3AED"
          alert={watchlistMatches > 0}
          pending={pending}
          onClick={onOpenWatchlist}
        />
        <GlanceCard
          title={SITE_LABELS.camerasWorking}
          value={camerasTotal > 0 ? `${camerasOnline} / ${camerasTotal}` : "—"}
          explanation={
            allOnline
              ? SITE_LABELS.allCamerasOnline
              : camerasTotal > 0
                ? SITE_LABELS.camerasOffline.replace("{count}", String(camerasOffline))
                : SITE_LABELS.camerasWorkingHint
          }
          icon={<VideocamIcon sx={{ fontSize: 28 }} />}
          accent={allOnline ? "#059669" : "#DC2626"}
          alert={!allOnline && camerasTotal > 0}
          pending={pending}
          onClick={onOpenLiveCameras}
        />
      </Box>
    </Box>
  );
}
