import { Box, Typography } from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CancelRounded from "@mui/icons-material/CancelRounded";
import ErrorRounded from "@mui/icons-material/ErrorRounded";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { bk, bkCardSx } from "./bkTokens";

type Props = {
  online: number;
  offline: number;
  unreachable: number;
  /** Cameras producing HLS segments right now, i.e. actually being recorded. */
  recording: number;
  /**
   * Average storage utilisation. Null when no capacity figure is available -
   * the meter then reads "Not reported" rather than drawing an unmeasured bar.
   */
  storagePct: number | null;
  onViewHealth?: () => void;
};

function StatusItem({ icon, label, value, pct, colour }: {
  icon: React.ReactNode; label: string; value: number; pct: number; colour: string;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
      <Box sx={{ color: colour, display: "grid", placeItems: "center", "& .MuiSvgIcon-root": { fontSize: 22 } }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: bk.muted, lineHeight: 1.3 }} noWrap>
          {label}
        </Typography>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: bk.ink, lineHeight: 1.35 }} noWrap>
          {value}{" "}
          <Box component="span" sx={{ fontWeight: 500, color: bk.muted }}>({pct}%)</Box>
        </Typography>
      </Box>
    </Box>
  );
}

const dividerSx = {
  width: "1px",
  alignSelf: "stretch",
  bgcolor: bk.line,
  flexShrink: 0,
  display: { xs: "none", lg: "block" },
} as const;

export function BkCamerasHealth({ online, offline, unreachable, recording, storagePct, onViewHealth }: Props) {
  const total = online + offline + unreachable;
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const slices = [
    { name: "Online", value: online, colour: bk.green },
    { name: "Offline", value: offline, colour: bk.red },
    { name: "Unreachable", value: unreachable, colour: bk.amber },
  ].filter((s) => s.value > 0);

  return (
    <Box
      sx={{
        ...bkCardSx,
        p: 2,
        display: "flex",
        alignItems: "center",
        gap: { xs: 2, lg: 3 },
        flexWrap: { xs: "wrap", xl: "nowrap" },
      }}
    >
      {/* Fleet donut */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        <Box sx={{ position: "relative", width: 74, height: 74, flexShrink: 0 }}>
          {total ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="66%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={1}
                  stroke={bk.card}
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.colour} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ width: "100%", height: "100%", borderRadius: "50%", border: `8px solid ${bk.lineSoft}` }} />
          )}
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: "1.0625rem", fontWeight: 800, lineHeight: 1.1, color: bk.ink }}>
                {total}
              </Typography>
              <Typography sx={{ fontSize: "0.5625rem", fontWeight: 600, color: bk.muted, lineHeight: 1.2 }}>
                Cameras
              </Typography>
            </Box>
          </Box>
        </Box>
        <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700, color: bk.ink, letterSpacing: "-0.01em" }} noWrap>
          Cameras Health Overview
        </Typography>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 2, lg: 2.5 },
          flexWrap: "wrap",
          minWidth: 0,
          flex: 1,
        }}
      >
        <StatusItem icon={<CheckCircleRounded />} label="Online" value={online} pct={share(online)} colour={bk.green} />
        <StatusItem icon={<CancelRounded />} label="Offline" value={offline} pct={share(offline)} colour={bk.red} />
        <StatusItem icon={<ErrorRounded />} label="Unreachable" value={unreachable} pct={share(unreachable)} colour={bk.amber} />

        <Box sx={dividerSx} />

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: bk.muted, lineHeight: 1.3 }} noWrap>
            Recording Status
          </Typography>
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 800, color: bk.ink, lineHeight: 1.3 }} noWrap>
            {recording} / {total}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: recording > 0 ? bk.green : bk.faint }} />
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: bk.muted }} noWrap>
              {recording > 0 ? "Recording" : "Not recording"}
            </Typography>
          </Box>
        </Box>

        <Box sx={dividerSx} />

        <Box sx={{ minWidth: 140 }}>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: bk.muted, lineHeight: 1.3 }} noWrap>
            Storage Usage (Avg.)
          </Typography>
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 800, color: bk.ink, lineHeight: 1.3 }} noWrap>
            {storagePct == null ? "—" : `${storagePct}%`}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.375 }}>
            <Box
              sx={{
                width: 92,
                height: 7,
                borderRadius: "999px",
                bgcolor: "rgba(23,59,33,.10)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  width: `${Math.min(100, Math.max(0, storagePct ?? 0))}%`,
                  height: "100%",
                  borderRadius: "999px",
                  bgcolor: (storagePct ?? 0) >= 85 ? bk.red : (storagePct ?? 0) >= 70 ? bk.amber : bk.green,
                }}
              />
            </Box>
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: bk.muted }} noWrap>
              {storagePct == null ? "Not reported" : storagePct >= 85 ? "Critical" : storagePct >= 70 ? "High" : "Normal"}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box
        component="button"
        type="button"
        onClick={onViewHealth}
        sx={{
          flexShrink: 0,
          px: 2.5,
          py: 1.25,
          border: 0,
          borderRadius: `${bk.radiusSm}px`,
          bgcolor: bk.greenDeep,
          color: "#FFFFFF",
          fontFamily: "inherit",
          fontSize: "0.8125rem",
          fontWeight: 700,
          cursor: "pointer",
          transition: "background-color 160ms ease",
          "&:hover": { bgcolor: "#1F4A28" },
          "&:focus-visible": { outline: `2px solid ${bk.green}`, outlineOffset: 2 },
        }}
      >
        View Camera Health
      </Box>
    </Box>
  );
}
