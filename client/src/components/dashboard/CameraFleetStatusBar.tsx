import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { pnp } from "../../lib/pnpTheme";

type Props = {
  uptimePercent?: number;
  camerasOnline: number;
  camerasTotal: number;
  pending?: boolean;
};

export function CameraFleetStatusBar({ uptimePercent, camerasOnline, camerasTotal, pending }: Props) {
  const uptime = pending ? null : Math.max(0, Math.min(100, uptimePercent ?? 0));
  const allOnline = camerasTotal > 0 && camerasOnline === camerasTotal;

  return (
    <Box sx={{ display: "flex", gap: 1, mt: 1.25, flexShrink: 0 }}>
      <StatBox
        icon={<VideocamOutlinedIcon sx={{ fontSize: 20, color: pnp.success }} />}
        label="Camera uptime"
        value={pending ? "—" : `${uptime}%`}
        valueColor={pnp.success}
      />
      <StatBox
        icon={<VideocamOutlinedIcon sx={{ fontSize: 20, color: allOnline ? pnp.success : pnp.danger }} />}
        label="Cameras online"
        value={camerasTotal > 0 ? `${camerasOnline} / ${camerasTotal}` : "—"}
        valueColor={allOnline ? pnp.success : pnp.danger}
      />
    </Box>
  );
}

function StatBox({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 0.85,
        px: 1.25,
        py: 1,
        borderRadius: "8px",
        bgcolor: "#FFFFFF",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        minWidth: 0,
      }}
    >
      {icon}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.625rem", fontWeight: 600, color: pnp.textMuted, lineHeight: 1.2 }}>{label}</Typography>
        <Typography sx={{ fontSize: "0.9375rem", fontWeight: 800, color: valueColor, lineHeight: 1.2 }}>{value}</Typography>
      </Box>
    </Box>
  );
}
