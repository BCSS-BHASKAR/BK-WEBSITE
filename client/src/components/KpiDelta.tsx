import { Box, Typography } from "@mui/material";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import type { RangeDelta } from "../lib/rangeCompare";

/**
 * The period-over-period line under a KPI number.
 *
 * Rendered by every KPI card in the console so a rise looks the same everywhere.
 * Green up / red down is the requested colour coding, but the arrow carries the
 * same information: colour alone would leave the direction invisible to a
 * red-green colour-blind reader, and there are enough of them among operators to
 * matter.
 *
 * Direction is NOT judged for severity. A rise in walk-ins is good and a rise in
 * intrusions is not, but the card only reports which way the number moved -
 * deciding that more intrusions should be "red for bad" would mean each caller
 * declaring a polarity, and getting one wrong would actively mislead.
 */
const UP = "#15803D";
const DOWN = "#C0392B";
const FLAT = "#7A6455";

export function KpiDelta({ delta, size = "sm" }: { delta: RangeDelta; size?: "sm" | "md" }) {
  const fontSize = size === "md" ? "0.8125rem" : "0.75rem";

  if (delta.pct == null) {
    return (
      <Typography sx={{ fontSize, fontWeight: 600, color: FLAT, lineHeight: 1.35 }} noWrap>
        {delta.label}
      </Typography>
    );
  }

  const colour = delta.direction === "up" ? UP : delta.direction === "down" ? DOWN : FLAT;
  const Arrow =
    delta.direction === "up" ? ArrowUpwardRoundedIcon
    : delta.direction === "down" ? ArrowDownwardRoundedIcon
    : RemoveRoundedIcon;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, minWidth: 0 }}>
      <Arrow sx={{ fontSize: size === "md" ? 15 : 13, color: colour, flexShrink: 0 }} />
      <Typography sx={{ fontSize, fontWeight: 700, color: colour, lineHeight: 1.35 }} noWrap>
        {Math.abs(delta.pct)}%{" "}
        <Box component="span" sx={{ fontWeight: 500, color: FLAT }}>
          {delta.label}
        </Box>
      </Typography>
    </Box>
  );
}
