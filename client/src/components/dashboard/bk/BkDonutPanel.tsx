import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { bk, bkCardSx, bkFooterLinkSx, bkPanelTitleSx } from "./bkTokens";

export type DonutSlice = { name: string; value: number; colour: string };

type Props = {
  title: string;
  icon: ReactNode;
  slices: DonutSlice[];
  /** Big number in the hole. */
  centerValue: number | string;
  /** Caption under it - "Total Alerts", "Total". */
  centerLabel: string;
  footerLabel: string;
  onFooter?: () => void;
  /** Diameter of the donut column. The design draws the chef donut larger. */
  size?: number;
  emptyLabel?: string;
  loading?: boolean;
};

/**
 * Donut plus a value legend.
 *
 * The legend is not decoration: several of these hues sit under 3:1 against a
 * white card, so identity can never rest on colour alone. Every slice is named
 * with its exact count and share beside its swatch, which is also what makes the
 * card readable to a colour-blind operator and in a greyscale print.
 */
export function BkDonutPanel({
  title, icon, slices, centerValue, centerLabel, footerLabel, onFooter,
  size = 132, emptyLabel = "Nothing recorded in this period", loading,
}: Props) {
  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <Box sx={{ ...bkCardSx, p: 2, display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        {icon}
        <Typography sx={bkPanelTitleSx}>{title}</Typography>
      </Box>

      {total > 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: { xs: "wrap", sm: "nowrap" },
          }}
        >
          <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0, mx: { xs: "auto", sm: 0 } }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="63%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  // The 2px white stroke IS the gap between adjacent fills;
                  // paddingAngle only nudges equal neighbours apart so they still
                  // read as two arcs.
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
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
                textAlign: "center",
              }}
            >
              <Box>
                <Typography
                  sx={{ fontSize: "1.625rem", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: bk.ink }}
                >
                  {typeof centerValue === "number" ? centerValue.toLocaleString() : centerValue}
                </Typography>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: bk.muted, lineHeight: 1.3 }}>
                  {centerLabel}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box
            component="ul"
            sx={{
              flex: 1,
              minWidth: 0,
              m: 0,
              p: 0,
              listStyle: "none",
              display: "grid",
              // name | count | share, so the numbers line up down the column
              // instead of drifting with the length of each name.
              gridTemplateColumns: "minmax(0, 1fr) auto auto",
              alignItems: "center",
              columnGap: 1,
              rowGap: 1.125,
            }}
          >
            {slices.map((s) => {
              const pct = Math.round((s.value / total) * 100);
              return (
                <Box key={s.name} component="li" sx={{ display: "contents" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.875, minWidth: 0 }}>
                    <Box
                      aria-hidden
                      sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: s.colour, flexShrink: 0 }}
                    />
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: bk.ink, overflowWrap: "anywhere" }}>
                      {s.name}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: bk.ink, whiteSpace: "nowrap" }}>
                    {s.value.toLocaleString()}
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, color: bk.muted, whiteSpace: "nowrap" }}>
                    ({pct}%)
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: size,
            display: "grid",
            placeItems: "center",
            border: `1px dashed ${bk.line}`,
            borderRadius: `${bk.radiusSm}px`,
          }}
        >
          <Typography sx={{ fontSize: "0.8125rem", color: bk.faint, fontWeight: 600, textAlign: "center", px: 2 }}>
            {loading ? "Loading…" : emptyLabel}
          </Typography>
        </Box>
      )}

      <Box component="button" type="button" onClick={onFooter} sx={{ ...bkFooterLinkSx, mt: 1.75 }}>
        {footerLabel}
      </Box>
    </Box>
  );
}
