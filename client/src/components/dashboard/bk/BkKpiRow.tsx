import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import HealthAndSafetyRounded from "@mui/icons-material/HealthAndSafetyRounded";
import { bk, bkCardSx, BK_GAP } from "./bkTokens";
import { ChefHatIcon, DetectiveHatIcon, StandingPersonIcon } from "./bkIcons";

/**
 * A day-over-day change.
 *
 * `pct` is null when the comparison cannot be made - the range holds fewer than
 * two days, or the earlier day was zero so the change is undefined rather than
 * infinite. The tile prints the reason instead of a number in that case; it
 * never shows a "0%" it did not measure.
 */
export type Delta = { pct: number | null; label: string };

type BaseTile = {
  label: string;
  icon: ReactNode;
  tint: string;
  iconColour: string;
  onClick?: () => void;
};

function TileShell({ label, icon, tint, iconColour, onClick, children }: BaseTile & { children: ReactNode }) {
  const interactive = Boolean(onClick);
  return (
    <Box
      component={interactive ? "button" : "div"}
      type={interactive ? "button" : undefined}
      onClick={onClick}
      sx={{
        ...bkCardSx,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 2,
        width: "100%",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        cursor: interactive ? "pointer" : "default",
        transition: "box-shadow 160ms ease, transform 160ms ease",
        ...(interactive
          ? {
              "&:hover": {
                boxShadow: "0 2px 6px rgba(22,53,28,.08), 0 10px 24px rgba(22,53,28,.09)",
                transform: "translateY(-1px)",
              },
              "&:focus-visible": { outline: `2px solid ${bk.green}`, outlineOffset: 2 },
            }
          : {}),
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 56,
          height: 56,
          flexShrink: 0,
          borderRadius: "50%",
          bgcolor: tint,
          color: iconColour,
          display: "grid",
          placeItems: "center",
          "& .MuiSvgIcon-root": { fontSize: 30 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: bk.muted, lineHeight: 1.35 }}>
          {label}
        </Typography>
        {children}
      </Box>
    </Box>
  );
}

function DeltaLine({ delta }: { delta: Delta }) {
  if (delta.pct == null) {
    return (
      <Typography sx={{ mt: 0.35, fontSize: "0.75rem", fontWeight: 600, color: bk.faint }}>
        {delta.label}
      </Typography>
    );
  }
  const rising = delta.pct >= 0;
  const Arrow = rising ? ArrowUpwardRoundedIcon : ArrowDownwardRoundedIcon;
  return (
    <Box sx={{ mt: 0.35, display: "flex", alignItems: "center", gap: 0.25, minWidth: 0 }}>
      <Arrow sx={{ fontSize: 14, color: rising ? bk.up : bk.down }} />
      <Typography
        sx={{ fontSize: "0.75rem", fontWeight: 700, color: rising ? bk.up : bk.down, lineHeight: 1.3 }}
      >
        {Math.abs(delta.pct)}% {delta.label}
      </Typography>
    </Box>
  );
}

const valueSx = {
  fontSize: "1.75rem",
  fontWeight: 800,
  lineHeight: 1.15,
  letterSpacing: "-0.03em",
  color: bk.ink,
} as const;

export type BkKpiRowProps = {
  walkins: number;
  walkinsDelta: Delta;
  intrusions: number;
  intrusionsDelta: Delta;
  chef: number;
  nonChef: number;
  loitering: number;
  loiteringDelta: Delta;
  totalAlerts: number;
  onWalkins?: () => void;
  onIntrusions?: () => void;
  onChef?: () => void;
  onLoitering?: () => void;
  onAlerts?: () => void;
};

export function BkKpiRow(p: BkKpiRowProps) {
  const kitchenTotal = p.chef + p.nonChef;
  return (
    <Box
      sx={{
        display: "grid",
        // Five equal columns on a desktop, folding to two then one. minmax(0,1fr)
        // rather than 1fr so a long value cannot push a column past its share.
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          md: "repeat(3, minmax(0, 1fr))",
          lg: "repeat(5, minmax(0, 1fr))",
        },
        gap: BK_GAP,
      }}
    >
      <TileShell
        label="Total Walk-ins"
        icon={<GroupsRounded />}
        tint={bk.greenSoft}
        iconColour={bk.green}
        onClick={p.onWalkins}
      >
        <Typography sx={valueSx}>{p.walkins.toLocaleString()}</Typography>
        <DeltaLine delta={p.walkinsDelta} />
      </TileShell>

      <TileShell
        label="Intruder Detections"
        icon={<DetectiveHatIcon />}
        tint={bk.redSoft}
        iconColour={bk.red}
        onClick={p.onIntrusions}
      >
        <Typography sx={valueSx}>{p.intrusions.toLocaleString()}</Typography>
        <DeltaLine delta={p.intrusionsDelta} />
      </TileShell>

      {/* Two figures, so no headline number and no delta - the split IS the
          reading, and a single "50" would bury it. */}
      <TileShell
        label="Chef / Non-Chef"
        icon={<ChefHatIcon />}
        tint={bk.purpleSoft}
        iconColour={bk.purple}
        onClick={p.onChef}
      >
        <Typography sx={{ ...valueSx, fontSize: "1.0625rem", mt: 0.15 }}>
          Chef: {p.chef.toLocaleString()}
        </Typography>
        <Typography sx={{ ...valueSx, fontSize: "1.0625rem" }}>
          Non-Chef: {p.nonChef.toLocaleString()}
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: "0.75rem", fontWeight: 600, color: bk.muted }}>
          Total in Kitchen: {kitchenTotal.toLocaleString()}
        </Typography>
      </TileShell>

      <TileShell
        label="Loitering Alerts"
        icon={<StandingPersonIcon />}
        tint={bk.orangeSoft}
        iconColour={bk.orange}
        onClick={p.onLoitering}
      >
        <Typography sx={valueSx}>{p.loitering.toLocaleString()}</Typography>
        <DeltaLine delta={p.loiteringDelta} />
      </TileShell>

      <TileShell
        label="Total Alerts"
        icon={<HealthAndSafetyRounded />}
        tint={bk.redSoft}
        iconColour={bk.red}
      >
        <Typography sx={valueSx}>{p.totalAlerts.toLocaleString()}</Typography>
        <Box
          component="button"
          type="button"
          onClick={p.onAlerts}
          sx={{
            mt: 0.35,
            p: 0,
            border: 0,
            background: "none",
            font: "inherit",
            cursor: "pointer",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: bk.red,
            "&:hover": { textDecoration: "underline" },
          }}
        >
          View all alerts
        </Box>
      </TileShell>
    </Box>
  );
}
