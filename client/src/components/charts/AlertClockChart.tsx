import { useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { CROWD_ALERT_TYPES, CROWD_ALERT_TYPE_META, type CrowdAlertType } from "../../lib/crowdAlertTypes";
import { pnp } from "../../lib/pnpTheme";

export type AlertClockSlot = {
  hour: number;
  total: number;
  byAlertType?: Record<CrowdAlertType, number>;
};

type Props = {
  slots: AlertClockSlot[];
  size?: number;
  emptyLabel?: string;
};

const VIEW = 216;
const CENTER = VIEW / 2;
const R_INNER = 38;
const R_OUTER = 90;
const GAP = 0.016;

type Segment = { type: CrowdAlertType; path: string };

type HourWedge = {
  hour: number;
  total: number;
  counts: Record<CrowdAlertType, number>;
  trackPath: string;
  segments: Segment[];
  isPeak: boolean;
};

function polar(angle: number, radius: number): [number, number] {
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius];
}

function wedgePath(a0: number, a1: number, ri: number, ro: number): string {
  const [x1, y1] = polar(a0, ri);
  const [x2, y2] = polar(a1, ri);
  const [x3, y3] = polar(a1, ro);
  const [x4, y4] = polar(a0, ro);
  return `M${x1},${y1} A${ri},${ri} 0 0 1 ${x2},${y2} L${x3},${y3} A${ro},${ro} 0 0 0 ${x4},${y4} Z`;
}

function hourRangeLabel(hour: number): string {
  const pad = (h: number) => String(h % 24).padStart(2, "0");
  return `${pad(hour)}:00 – ${pad(hour + 1)}:00`;
}

/**
 * Folds a whole reporting period onto one dial so the shape of a trading day
 * reads at a glance. The dial spans only the hours that actually saw alerts —
 * a fixed 24-hour clock would sit mostly empty for a venue that trades 08:00–18:00.
 */
export function AlertClockChart({ slots, size = 216, emptyLabel = "No alerts in this period" }: Props) {
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const model = useMemo(() => {
    const active = slots.filter((s) => s.total > 0);
    if (!active.length) return null;

    // Pad the window by an hour each side so the busiest wedge is not flush
    // against the edge of the dial.
    const first = Math.max(0, Math.min(...active.map((s) => s.hour)) - 1);
    const last = Math.min(23, Math.max(...active.map((s) => s.hour)) + 1);
    const span = last - first + 1;
    const peak = Math.max(...active.map((s) => s.total));
    const byHour = new Map(slots.map((s) => [s.hour, s]));

    const angleOf = (h: number) => ((h - first) / span) * 2 * Math.PI - Math.PI / 2;

    const hours: HourWedge[] = [];
    const ticks: { key: number; line: string; label: string; x: number; y: number }[] = [];
    let peakMarker: { x: number; y: number } | null = null;

    for (let h = first; h <= last; h += 1) {
      const a0 = angleOf(h) + GAP;
      const a1 = angleOf(h + 1) - GAP;
      const slot = byHour.get(h);
      const total = slot?.total ?? 0;

      const counts = {} as Record<CrowdAlertType, number>;
      for (const type of CROWD_ALERT_TYPES) counts[type] = slot?.byAlertType?.[type] ?? 0;

      const segments: Segment[] = [];
      if (total > 0) {
        const reach = (total / peak) * (R_OUTER - R_INNER);
        let ri = R_INNER;
        for (const type of CROWD_ALERT_TYPES) {
          const v = counts[type];
          if (!v) continue;
          const ro = ri + (v / total) * reach;
          segments.push({ type, path: wedgePath(a0, a1, ri, ro) });
          ri = ro;
        }
        if (total === peak && !peakMarker) {
          const [px, py] = polar((a0 + a1) / 2, R_OUTER + 6);
          peakMarker = { x: px, y: py };
        }
      }

      hours.push({
        hour: h,
        total,
        counts,
        // Full-height track doubles as the hover hit area, so quiet hours are
        // hoverable too.
        trackPath: wedgePath(a0, a1, R_INNER, R_OUTER),
        segments,
        isPeak: total > 0 && total === peak,
      });

      if ((h - first) % 2 === 0) {
        const a = angleOf(h);
        const [lx1, ly1] = polar(a, R_INNER - 5);
        const [lx2, ly2] = polar(a, R_OUTER + 5);
        const [tx, ty] = polar(a, R_OUTER + 15);
        ticks.push({
          key: h,
          line: `M${lx1},${ly1} L${lx2},${ly2}`,
          label: String(h).padStart(2, "0"),
          x: tx,
          y: ty + 3.4,
        });
      }
    }

    const total = active.reduce((sum, s) => sum + s.total, 0);
    return { hours, ticks, peakMarker, total };
  }, [slots]);

  if (!model) {
    return (
      <Box
        sx={{
          height: size,
          display: "grid",
          placeItems: "center",
          borderRadius: 2,
          bgcolor: "rgba(74,18,32,0.03)",
          color: pnp.textSecondary,
          fontSize: "0.8125rem",
          fontWeight: 700,
          textAlign: "center",
          px: 2,
        }}
      >
        {emptyLabel}
      </Box>
    );
  }

  const hovered = hoverHour == null ? null : model.hours.find((h) => h.hour === hoverHour) ?? null;

  return (
    <Box>
      <Box sx={{ position: "relative", maxWidth: size, mx: "auto" }}>
        <Box
          component="svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          role="img"
          aria-label={`${model.total} alerts by hour of day`}
          onMouseLeave={() => setHoverHour(null)}
          sx={{ width: "100%", height: "auto", display: "block" }}
        >
          <circle cx={CENTER} cy={CENTER} r={R_INNER - 5} fill="none" stroke="rgba(74,18,32,0.07)" strokeWidth={1} />
          {model.ticks.map((t) => (
            <path key={`l-${t.key}`} d={t.line} stroke="rgba(74,18,32,0.1)" strokeWidth={1} />
          ))}

          {model.hours.map((h) => (
            <g
              key={h.hour}
              onMouseEnter={() => setHoverHour(h.hour)}
              style={{ cursor: h.total > 0 ? "pointer" : "default" }}
            >
              <path d={h.trackPath} fill="rgba(74,18,32,0.05)" />
              {h.segments.map((s) => (
                <path
                  key={s.type}
                  d={s.path}
                  fill={CROWD_ALERT_TYPE_META[s.type].color}
                  opacity={hoverHour != null && hoverHour !== h.hour ? 0.42 : 1}
                />
              ))}
              {/* Transparent hit area on top so gaps between segments still hover. */}
              <path d={h.trackPath} fill="transparent" />
            </g>
          ))}

          {model.ticks.map((t) => (
            <text
              key={`x-${t.key}`}
              x={t.x}
              y={t.y}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={800}
              fill={pnp.textMuted}
              style={{ pointerEvents: "none" }}
            >
              {t.label}
            </text>
          ))}
          {model.peakMarker ? (
            <circle cx={model.peakMarker.x} cy={model.peakMarker.y} r={3.6} fill={pnp.text} style={{ pointerEvents: "none" }} />
          ) : null}

          <g style={{ pointerEvents: "none" }}>
            <text x={CENTER} y={CENTER - 1} textAnchor="middle" fontSize={25} fontWeight={800} fill={pnp.text}>
              {(hovered ? hovered.total : model.total).toLocaleString()}
            </text>
            <text
              x={CENTER}
              y={CENTER + 12}
              textAnchor="middle"
              fontSize={7}
              fontWeight={800}
              letterSpacing="0.16"
              fill={pnp.textMuted}
            >
              {hovered ? hourRangeLabel(hovered.hour) : "ALERTS"}
            </text>
          </g>
        </Box>

        {hovered && hovered.total > 0 ? (
          <Box
            sx={{
              position: "absolute",
              left: "50%",
              bottom: "100%",
              transform: "translate(-50%, -6px)",
              zIndex: 2,
              pointerEvents: "none",
              bgcolor: "background.paper",
              border: "1px solid rgba(74,18,32,0.12)",
              borderRadius: 1.5,
              boxShadow: "0 8px 24px rgba(59,14,27,0.14)",
              px: 1.25,
              py: 0.85,
              minWidth: 150,
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 900, color: pnp.textSecondary, mb: 0.5 }}>
              {hourRangeLabel(hovered.hour)} · {hovered.total.toLocaleString()} alert{hovered.total === 1 ? "" : "s"}
            </Typography>
            {CROWD_ALERT_TYPES.filter((t) => hovered.counts[t] > 0).map((t) => (
              <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: CROWD_ALERT_TYPE_META[t].color,
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: pnp.text }}>
                  {CROWD_ALERT_TYPE_META[t].shortLabel}: {hovered.counts[t]}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>

      {/* All labels on a single row, sized to fit the narrow dial column. */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "nowrap",
          gap: 0.5,
          justifyContent: "center",
          alignItems: "center",
          pt: 1,
        }}
      >
        {CROWD_ALERT_TYPES.map((t) => (
          <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.3, flexShrink: 0 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: CROWD_ALERT_TYPE_META[t].color,
                flexShrink: 0,
              }}
            />
            <Typography
              noWrap
              sx={{ fontSize: "0.5rem", fontWeight: 700, color: pnp.textSecondary, letterSpacing: "-0.01em" }}
            >
              {CROWD_ALERT_TYPE_META[t].shortLabel}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
