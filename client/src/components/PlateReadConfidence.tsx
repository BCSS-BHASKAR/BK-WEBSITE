import { useState } from "react";
import {
  Box,
  Chip,
  Collapse,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import {
  buildPlateReadSummary,
  trustChipColors,
  type PlateReadFields,
  type PlateReadSummary,
  type PlateReadTrust,
} from "../lib/plateReadSummary";

function TrustIcon({ trust }: { trust: PlateReadTrust | null }) {
  const sx = { fontSize: 15, mr: 0.35 };
  if (trust === "high") return <VerifiedUserOutlinedIcon sx={sx} />;
  if (trust === "medium") return <WarningAmberOutlinedIcon sx={sx} />;
  if (trust === "low") return <ErrorOutlineOutlinedIcon sx={sx} />;
  return null;
}

function TrustChip({ summary, size = "small" }: { summary: PlateReadSummary; size?: "small" | "medium" }) {
  const colors = trustChipColors(summary.trust);
  return (
    <Chip
      size={size}
      icon={<TrustIcon trust={summary.trust} />}
      label={summary.trustLabel}
      sx={{
        height: size === "small" ? 24 : 28,
        fontWeight: 800,
        fontSize: size === "small" ? "0.6875rem" : "0.75rem",
        letterSpacing: "0.01em",
        bgcolor: colors.bgcolor,
        color: colors.color,
        border: "1px solid",
        borderColor: colors.borderColor,
        "& .MuiChip-icon": { color: "inherit", ml: 0.5 },
      }}
    />
  );
}

function ConfidenceDetail({ summary }: { summary: PlateReadSummary }) {
  return (
    <Stack spacing={1.25} sx={{ maxWidth: 320 }}>
      <TrustChip summary={summary} size="medium" />
      {summary.expectedAccuracy ? (
        <Typography variant="body2" sx={{ fontWeight: 700, color: "text.secondary", lineHeight: 1.4 }}>
          {summary.expectedAccuracy}
        </Typography>
      ) : null}
      {summary.riskChips.length > 0 ? (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
          {summary.riskChips.map((c) => (
            <Chip
              key={c.code}
              size="small"
              label={c.label}
              sx={{
                height: 22,
                fontSize: "0.65rem",
                fontWeight: 800,
                bgcolor: "rgba(245, 158, 11, 0.12)",
                color: "#92400e",
                border: "1px solid rgba(245, 158, 11, 0.28)",
              }}
            />
          ))}
        </Stack>
      ) : null}
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
        {summary.ocrPct != null ? (
          <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary" }}>
            OCR score: {summary.ocrPct}%
          </Typography>
        ) : null}
        <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
          {summary.photoLabel}
        </Typography>
      </Stack>
      {summary.reasons.length > 0 ? (
        <Box component="ul" sx={{ m: 0, pl: 2.25, "& li": { mb: 0.5 } }}>
          {summary.reasons.map((line) => (
            <Typography key={line} component="li" variant="caption" sx={{ fontWeight: 650, color: "text.primary", lineHeight: 1.45 }}>
              {line}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Stack>
  );
}

export function PlateReadConfidenceInline({ row }: { row: PlateReadFields }) {
  const summary = buildPlateReadSummary(row);
  if (!summary) {
    return (
      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.disabled" }}>
        —
      </Typography>
    );
  }

  const subtitle = [
    summary.ocrPct != null ? `OCR ${summary.ocrPct}%` : null,
    summary.trust !== "high" && summary.photoLabel.includes("Hard") ? "Hard to read" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Tooltip
      title={<ConfidenceDetail summary={summary} />}
      placement="left"
      arrow
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "rgba(255,255,255,0.98)",
            color: "text.primary",
            boxShadow: "0 12px 40px rgba(2,6,23,0.14)",
            border: "1px solid rgba(15,23,42,0.08)",
            borderRadius: "10px",
            p: 1.5,
            maxWidth: 360,
          },
        },
      }}
    >
      <Box sx={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 0.35, cursor: "help" }}>
        <TrustChip summary={summary} />
        {subtitle ? (
          <Typography variant="caption" sx={{ fontWeight: 750, color: "text.secondary", fontSize: "0.65rem", lineHeight: 1.2 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Tooltip>
  );
}

export function PlateReadConfidenceCard({ row }: { row: PlateReadFields }) {
  const summary = buildPlateReadSummary(row);
  const [open, setOpen] = useState(() => summary?.trust === "low");

  if (!summary) return null;

  const canExpand = summary.showWhy;

  return (
    <Box
      sx={{
        mt: 1.25,
        pt: 1.25,
        borderTop: "1px solid rgba(15,23,42,0.07)",
        borderRadius: "8px",
        bgcolor:
          summary.trust === "low"
            ? "rgba(254, 242, 242, 0.65)"
            : summary.trust === "medium"
              ? "rgba(255, 251, 235, 0.7)"
              : "rgba(240, 253, 244, 0.55)",
        px: 1.25,
        py: 1,
        border: "1px solid",
        borderColor:
          summary.trust === "low"
            ? "rgba(220, 38, 38, 0.12)"
            : summary.trust === "medium"
              ? "rgba(245, 158, 11, 0.18)"
              : "rgba(22, 163, 74, 0.15)",
      }}
    >
      <Stack spacing={0.75}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <TrustChip summary={summary} />
          {summary.riskChips.map((c) => (
            <Chip
              key={c.code}
              size="small"
              label={c.label}
              sx={{
                height: 22,
                fontSize: "0.625rem",
                fontWeight: 800,
                bgcolor: "rgba(255,255,255,0.85)",
                color: "#92400e",
                border: "1px solid rgba(245, 158, 11, 0.25)",
              }}
            />
          ))}
        </Box>

        {summary.expectedAccuracy ? (
          <Typography variant="caption" sx={{ fontWeight: 750, color: "text.secondary", display: "block", lineHeight: 1.35 }}>
            {summary.expectedAccuracy}
          </Typography>
        ) : null}

        <Stack direction="row" spacing={1.5} sx={{ pt: 0.25, flexWrap: "wrap" }}>
          {summary.ocrPct != null ? (
            <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary" }}>
              OCR {summary.ocrPct}%
            </Typography>
          ) : null}
          <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
            {summary.photoLabel.replace("Plate photo: ", "")}
          </Typography>
        </Stack>

        {canExpand ? (
          <>
            <Box
              component="button"
              type="button"
              onClick={() => setOpen((v) => !v)}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.25,
                mt: 0.25,
                p: 0,
                border: "none",
                bgcolor: "transparent",
                cursor: "pointer",
                color: "primary.main",
                fontWeight: 800,
                fontSize: "0.6875rem",
                fontFamily: "inherit",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              <ExpandMoreIcon
                sx={{
                  fontSize: 18,
                  transition: "transform 0.2s",
                  transform: open ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
              {open ? "Hide details" : "Why we're not sure"}
            </Box>
            <Collapse in={open}>
              <Box component="ul" sx={{ m: 0, pl: 2, pt: 0.5, "& li": { mb: 0.6 } }}>
                {summary.reasons.map((line) => (
                  <Typography
                    key={line}
                    component="li"
                    variant="caption"
                    sx={{ fontWeight: 650, color: "text.primary", lineHeight: 1.45 }}
                  >
                    {line}
                  </Typography>
                ))}
              </Box>
            </Collapse>
          </>
        ) : summary.trust === "high" && summary.reasons[0] ? (
          <Typography variant="caption" sx={{ fontWeight: 650, color: "text.secondary", lineHeight: 1.4 }}>
            {summary.reasons[0]}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}
