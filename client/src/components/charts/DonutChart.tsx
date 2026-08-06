import { Box, Paper, Typography } from "@mui/material";
import type { VehicleReportAttr } from "../../lib/vehicleReportNav";

export type DonutItem = {
  label: string;
  value: number;
  color: string;
  filterAttr?: VehicleReportAttr;
};

type Props = {
  items: DonutItem[];
  size?: number;
  showLegend?: boolean;

  legendPosition?: "side" | "bottom";

  legendStyle?: "cards" | "compact";
  onFilterClick?: (attr: VehicleReportAttr) => void;
};

function LegendCard({
  it,
  pct,
  sum,
  onFilterClick,
}: {
  it: DonutItem;
  pct: number;
  sum: number;
  onFilterClick?: (attr: VehicleReportAttr) => void;
}) {
  const interactive = Boolean(onFilterClick && it.filterAttr && sum > 0);
  return (
    <Paper
      elevation={0}
      {...(interactive
        ? {
            component: "button" as const,
            type: "button" as const,
            onClick: () => onFilterClick!(it.filterAttr!),
          }
        : {})}
      sx={{
        p: 1.35,
        pr: 1.5,
        borderRadius: "10px",
        border: "1px solid rgba(15,23,42,0.08)",
        bgcolor: "rgba(255,255,255,0.92)",
        textAlign: "left",
        cursor: interactive ? "pointer" : "default",
        font: "inherit",
        width: "100%",
        transition: "box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease",
        boxShadow: "inset 3px 0 0 0 " + it.color,
        ...(interactive
          ? {
              "&:hover": {
                borderColor: "rgba(29,78,216,0.22)",
                boxShadow: `inset 3px 0 0 0 ${it.color}, 0 10px 26px rgba(2,6,23,0.08)`,
                transform: "translateY(-1px)",
              },
            }
          : {}),
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
        <Typography sx={{ fontWeight: 900, letterSpacing: -0.02, fontSize: "1rem", lineHeight: 1.25, minWidth: 0 }}>
          {it.label}
        </Typography>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography
            sx={{
              fontWeight: 950,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              fontSize: "1.05rem",
              color: "text.primary",
              lineHeight: 1.2,
            }}
          >
            {pct}%
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: "text.secondary",
              display: "block",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {it.value.toLocaleString()}
          </Typography>
        </Box>
      </Box>
      <Box
        sx={{
          mt: 1,
          height: 4,
          borderRadius: 999,
          bgcolor: "rgba(15,23,42,0.06)",
          overflow: "hidden",
        }}
      >
        <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: it.color, borderRadius: 999 }} />
      </Box>
    </Paper>
  );
}

function CompactLegend({ items, sum }: { items: DonutItem[]; sum: number }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%", minWidth: 0 }}>
      {items.map((it) => {
        const pct = sum > 0 ? Math.round((it.value / sum) * 100) : 0;
        return (
          <Box key={it.label} sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: it.color, flexShrink: 0 }} />
            <Typography sx={{ flex: 1, fontSize: "0.8125rem", fontWeight: 600, color: "text.primary", minWidth: 0 }} noWrap>
              {it.label}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
              {it.value}
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.secondary", width: 32, textAlign: "right" }}>
              {pct}%
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export function DonutChart({
  items,
  size = 140,
  showLegend,
  legendPosition = "side",
  legendStyle = "cards",
  onFilterClick,
}: Props) {
  const sum = items.reduce((a, i) => a + i.value, 0);
  const total = Math.max(1, sum);
  const r = 48;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const chart = (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <Box component="svg" viewBox="0 0 120 120" sx={{ width: size, height: size }}>
        <circle cx="60" cy="60" r={r} stroke="rgba(2,6,23,0.08)" strokeWidth="11" fill="none" />
        {items.map((it, idx) => {
          const frac = it.value / total;
          const len = frac * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={idx}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={it.color}
              strokeWidth="11"
              strokeLinecap="butt"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
              opacity={sum === 0 ? 0.35 : 0.98}
              style={onFilterClick && it.filterAttr && sum > 0 ? { cursor: "pointer" } : undefined}
              onClick={
                onFilterClick && it.filterAttr && sum > 0
                  ? () => {
                      onFilterClick(it.filterAttr!);
                    }
                  : undefined
              }
            />
          );
          offset += len;
          return el;
        })}
      </Box>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <Typography
          sx={{
            fontWeight: 950,
            letterSpacing: "-0.03em",
            fontSize: size >= 180 ? "1.35rem" : "1.15rem",
            lineHeight: 1,
            textAlign: "center",
          }}
        >
          {sum.toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );

  const legendCards =
    showLegend && legendStyle === "cards"
      ? items.map((it) => {
          const pct = sum > 0 ? Math.round((it.value / sum) * 1000) / 10 : 0;
          return <LegendCard key={it.label} it={it} pct={pct} sum={sum} onFilterClick={onFilterClick} />;
        })
      : null;

  const compactLegend = showLegend && legendStyle === "compact" ? <CompactLegend items={items} sum={sum} /> : null;

  if (legendPosition === "bottom") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          gap: 2,
        }}
      >
        {chart}
        {compactLegend}
        {legendCards ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              gap: 1.25,
              width: "100%",
              maxWidth: 420,
              "& > *": { flex: { sm: "1 1 0" }, minWidth: 0 },
            }}
          >
            {legendCards}
          </Box>
        ) : null}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: "center",
        justifyContent: "center",
        gap: { xs: 2, sm: 2 },
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      {chart}
      {compactLegend ? (
        <Box sx={{ flex: 1, minWidth: 0, maxWidth: "100%" }}>{compactLegend}</Box>
      ) : null}
      {legendCards ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, width: "100%", maxWidth: "100%", minWidth: 0, flex: 1 }}>
          {legendCards}
        </Box>
      ) : null}
    </Box>
  );
}
