import { Box, ButtonBase, Chip, Skeleton, Typography } from "@mui/material";
import { SITE_LABELS } from "../i18n/lang";
import { displayCameraName } from "../lib/cameraDisplay";
import { formatDbNaiveInDisplay } from "../lib/siteTimeZone";
import { VIOLATION_TYPE_META, violationTypeLabel } from "../lib/violationTypes";

export type SimpleViolationRow = {
  id: number;
  violationType: string;
  plate: string | null;
  cameraName: string;
  detectedAt: string;
};

type Props = {
  rows: SimpleViolationRow[];
  pending?: boolean;
  onRowClick: (row: SimpleViolationRow) => void;
};

export function SimpleViolationList({ rows, pending, onRowClick }: Props) {
  if (pending) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={72} sx={{ borderRadius: 1.5 }} />
        ))}
      </Box>
    );
  }

  if (!rows.length) {
    return (
      <Typography sx={{ py: 2, fontWeight: 500, color: "text.secondary", fontSize: "0.9375rem" }}>
        {SITE_LABELS.noViolationsYet}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {rows.map((r) => {
        const meta = VIOLATION_TYPE_META[r.violationType as keyof typeof VIOLATION_TYPE_META];
        return (
          <ButtonBase
            key={r.id}
            onClick={() => onRowClick(r)}
            sx={{
              display: "block",
              width: "100%",
              textAlign: "left",
              p: 1.5,
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "#FFFFFF",
              "&:hover": { bgcolor: "rgba(95, 141, 184, 0.06)" },
            }}
          >
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 0.75 }}>
              <Chip
                label={violationTypeLabel(r.violationType)}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                  bgcolor: meta?.softBg ?? "rgba(15,23,42,0.06)",
                  color: meta?.color ?? "text.primary",
                }}
              />
              <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", color: "text.primary" }}>
                {r.plate?.trim() || SITE_LABELS.plateNumberPending}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", fontWeight: 500 }}>
              {displayCameraName(r.cameraName)} · {formatDbNaiveInDisplay(r.detectedAt, "D MMM YYYY, h:mm A")}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
