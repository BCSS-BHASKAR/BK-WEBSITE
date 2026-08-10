import { Box, Typography } from "@mui/material";
import ImageNotSupportedRounded from "@mui/icons-material/ImageNotSupportedRounded";
import { bk, bkCardSx, bkFooterLinkSx, bkPanelTitleSx } from "./bkTokens";
import { DetectiveHatIcon } from "./bkIcons";

export type IntruderSeverity = "High" | "Medium" | "Low";

export type IntruderRow = {
  id: string;
  area: string;
  when: string;
  thumbUrl?: string;
  severity: IntruderSeverity;
};

const SEVERITY_STYLE: Record<IntruderSeverity, { fg: string; bg: string; border: string }> = {
  High: { fg: bk.red, bg: bk.redSoft, border: "rgba(192,57,43,.28)" },
  Medium: { fg: "#B47612", bg: bk.amberSoft, border: "rgba(224,160,58,.42)" },
  Low: { fg: bk.green, bg: bk.greenSoft, border: "rgba(47,125,62,.28)" },
};

type Props = {
  rows: IntruderRow[];
  loading?: boolean;
  onViewAll?: () => void;
  onOpen?: (index: number) => void;
};

export function BkIntruderPanel({ rows, loading, onViewAll, onOpen }: Props) {
  return (
    <Box sx={{ ...bkCardSx, p: 2, display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <DetectiveHatIcon sx={{ fontSize: 20, color: bk.red }} />
        <Typography sx={bkPanelTitleSx} noWrap>Intruder Detection</Typography>
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.25 }}>
        {rows.map((r, i) => {
          const sev = SEVERITY_STYLE[r.severity];
          const clickable = Boolean(onOpen);
          return (
            <Box
              key={r.id}
              component={clickable ? "button" : "div"}
              type={clickable ? "button" : undefined}
              onClick={clickable ? () => onOpen?.(i) : undefined}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                minWidth: 0,
                width: "100%",
                p: 0,
                border: 0,
                background: "none",
                font: "inherit",
                textAlign: "left",
                cursor: clickable ? "pointer" : "default",
                borderRadius: `${bk.radiusSm}px`,
                transition: "background-color 140ms ease",
                ...(clickable ? { "&:hover": { bgcolor: "rgba(23,59,33,.04)" } } : {}),
              }}
            >
              <Box
                sx={{
                  width: 56,
                  height: 42,
                  flexShrink: 0,
                  borderRadius: "6px",
                  overflow: "hidden",
                  bgcolor: "rgba(23,59,33,.07)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {r.thumbUrl ? (
                  <Box
                    component="img"
                    src={r.thumbUrl}
                    alt=""
                    loading="lazy"
                    sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                ) : (
                  <ImageNotSupportedRounded sx={{ fontSize: 18, color: bk.faint }} />
                )}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.625, minWidth: 0 }}>
                  <DetectiveHatIcon sx={{ fontSize: 15, color: bk.red, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: bk.ink }} noWrap>
                    {r.area}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: "0.71875rem", fontWeight: 500, color: bk.muted, mt: 0.15 }} noWrap>
                  {r.when}
                </Typography>
              </Box>

              <Box
                sx={{
                  flexShrink: 0,
                  px: 1,
                  py: 0.375,
                  borderRadius: "6px",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: sev.fg,
                  bgcolor: sev.bg,
                  border: `1px solid ${sev.border}`,
                  lineHeight: 1.4,
                }}
              >
                {r.severity}
              </Box>
            </Box>
          );
        })}

        {!rows.length ? (
          <Box
            sx={{
              flex: 1,
              minHeight: 120,
              display: "grid",
              placeItems: "center",
              border: `1px dashed ${bk.line}`,
              borderRadius: `${bk.radiusSm}px`,
            }}
          >
            <Typography sx={{ fontSize: "0.8125rem", color: bk.faint, fontWeight: 600 }}>
              {loading ? "Loading intrusions…" : "No intrusions in this period"}
            </Typography>
          </Box>
        ) : null}
      </Box>

      <Box component="button" type="button" onClick={onViewAll} sx={{ ...bkFooterLinkSx, mt: 1.75 }}>
        View All Intruder Events
      </Box>
    </Box>
  );
}
