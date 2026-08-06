import type { ReactNode } from "react";
import {
  Box,
  ButtonBase,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import { displayCameraName, locationDotColor } from "../../lib/cameraDisplay";
import { pnp, pnpFont } from "../../lib/pnpTheme";

export type TopPlateRow = {
  plate: string;
  total: number;
  last_camera?: string;
  last_camera_id?: string;
};

type Props = {
  rows: TopPlateRow[];
  pending?: boolean;
  reportPeriodLabel: string;
  onRowClick?: (plate: string) => void;
  onViewAll?: () => void;
};

const ACCENT_BLUE = "#0052CC";

const COLS = "2.25rem minmax(0, 1.35fr) minmax(0, 1fr) 6.5rem";

export function TopPlatesTable({ rows, pending, reportPeriodLabel, onRowClick, onViewAll }: Props) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: "12px",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        bgcolor: "#FFFFFF",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1.5,
          px: { xs: 1.75, sm: 2.25 },
          pt: { xs: 1.75, sm: 2 },
          pb: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.35, minWidth: 0 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: "#EFF6FF",
              color: "#1D4ED8",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <DirectionsCarFilledIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: pnp.text, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
              Most-Read Plates
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, mt: 0.4, lineHeight: 1.4 }}>
              Highest read counts in selected period
            </Typography>
          </Box>
        </Box>
        {onViewAll ? (
          <ButtonBase
            onClick={onViewAll}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.15,
              borderRadius: "6px",
              px: 0.5,
              py: 0.35,
              color: ACCENT_BLUE,
              fontSize: "0.8125rem",
              fontWeight: 600,
              flexShrink: 0,
              "&:hover": { bgcolor: "rgba(0, 82, 204, 0.06)" },
            }}
          >
            View all plates
            <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
          </ButtonBase>
        ) : null}
      </Box>

      <Box sx={{ px: { xs: 1.75, sm: 2.25 }, pb: { xs: 1.75, sm: 2 } }}>
        {pending ? (
          <StackLike spacing={1}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={52} sx={{ borderRadius: 1 }} />
            ))}
          </StackLike>
        ) : !rows.length ? (
          <Typography sx={{ ...pnpFont.cardSubtitle, py: 3, textAlign: "center" }}>No plate reads in period</Typography>
        ) : (
          <Box sx={{ minWidth: 0, borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(15, 23, 42, 0.06)" }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: COLS,
                gap: 1,
                alignItems: "center",
                px: 1.5,
                py: 1.1,
                bgcolor: pnp.navySidebar,
              }}
            >
              <HeaderCell>Rank</HeaderCell>
              <HeaderCell>Plate number</HeaderCell>
              <HeaderCell>Location</HeaderCell>
              <HeaderCell align="right">
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.35, justifyContent: "flex-end" }}>
                  Reads
                  <FilterListRoundedIcon sx={{ fontSize: 14, opacity: 0.85 }} />
                </Box>
              </HeaderCell>
            </Box>
            <StackLike spacing={0}>
              {rows.map((r, i) => (
                <ButtonBase
                  key={r.plate}
                  onClick={() => onRowClick?.(r.plate)}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: COLS,
                    gap: 1,
                    width: "100%",
                    textAlign: "left",
                    py: 1.35,
                    px: 1.5,
                    alignItems: "center",
                    bgcolor: "#FFFFFF",
                    borderBottom: i < rows.length - 1 ? "1px solid rgba(15, 23, 42, 0.06)" : "none",
                    "&:hover": { bgcolor: "rgba(37, 99, 235, 0.03)" },
                  }}
                >
                  <Typography sx={{ fontSize: "0.9375rem", fontWeight: 800, color: ACCENT_BLUE, lineHeight: 1 }}>
                    {i + 1}
                  </Typography>
                  <PhilippinePlateBadge plate={r.plate} />
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, maxWidth: "100%" }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: locationDotColor(r.last_camera, r.last_camera_id),
                        flexShrink: 0,
                      }}
                    />
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: pnp.text, flexShrink: 1, minWidth: 0 }} noWrap>
                      {displayCameraName(r.last_camera, r.last_camera_id) || "—"}
                    </Typography>
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        bgcolor: "#EFF6FF",
                        color: ACCENT_BLUE,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                        ml: 0.15,
                      }}
                    >
                      <PlaceRoundedIcon sx={{ fontSize: 13 }} />
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.65 }}>
                    <Box
                      sx={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        bgcolor: "#EFF6FF",
                        color: ACCENT_BLUE,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <BarChartRoundedIcon sx={{ fontSize: 15 }} />
                    </Box>
                    <Typography sx={{ fontSize: "0.9375rem", fontWeight: 800, color: ACCENT_BLUE, fontVariantNumeric: "tabular-nums" }}>
                      {r.total.toLocaleString()}
                    </Typography>
                  </Box>
                </ButtonBase>
              ))}
            </StackLike>
          </Box>
        )}

        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, mt: 1.75, px: 0.15 }}>
          <InfoOutlinedIcon sx={{ fontSize: 16, color: pnp.textMuted, mt: 0.1, flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, lineHeight: 1.45 }}>
            Data based on selected report period:{" "}
            <Box component="span" sx={{ fontWeight: 600, color: pnp.text }}>
              {reportPeriodLabel}
            </Box>
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

function PhilippinePlateBadge({ plate }: { plate: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.85, minWidth: 0, maxWidth: "100%" }}>
      <Box
        sx={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.2,
          py: 0.45,
          px: 0.45,
          borderRadius: "6px",
          border: "1px solid rgba(15, 23, 42, 0.1)",
          bgcolor: "#F8FAFC",
        }}
      >
        <Box
          sx={{
            width: 16,
            height: 11,
            borderRadius: "2px",
            overflow: "hidden",
            position: "relative",
            border: "1px solid rgba(15, 23, 42, 0.08)",
          }}
        >
          <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #0038A8 0%, #0038A8 50%, #CE1126 50%, #CE1126 100%)" }} />
          <Box
            sx={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              borderTop: "6px solid transparent",
              borderBottom: "6px solid transparent",
              borderLeft: "7px solid #FFFFFF",
            }}
          />
        </Box>
        <Typography sx={{ fontSize: "0.5rem", fontWeight: 800, color: pnp.textMuted, letterSpacing: "0.06em", lineHeight: 1 }}>
          PH
        </Typography>
      </Box>
      <Typography
        sx={{
          fontSize: "1.0625rem",
          fontWeight: 800,
          color: "#0F172A",
          letterSpacing: "0.04em",
          lineHeight: 1.1,
          minWidth: 0,
        }}
        noWrap
      >
        {plate}
      </Typography>
    </Box>
  );
}

function HeaderCell({ children, align }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <Typography
      sx={{
        fontSize: "0.625rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#FFFFFF",
        textAlign: align ?? "left",
        lineHeight: 1.2,
      }}
    >
      {children}
    </Typography>
  );
}

function StackLike({ children, spacing }: { children: ReactNode; spacing?: number }) {
  return <Box sx={{ display: "flex", flexDirection: "column", gap: spacing ?? 0 }}>{children}</Box>;
}
