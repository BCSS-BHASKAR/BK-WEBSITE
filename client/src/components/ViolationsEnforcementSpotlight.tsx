import {
  Box,
  Button,
  ButtonBase,
  LinearProgress,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import PolicyIcon from "@mui/icons-material/Policy";
import { useAnimatedCount } from "../hooks/useAnimatedCount";
import { SITE_LABELS } from "../i18n/lang";
import { VIOLATION_TYPE_META, violationTypeLabel, violationTypesByCount } from "../lib/violationTypes";
import { pnp } from "../lib/pnpTheme";
import { statTileSx } from "../lib/uiSurfaces";

export type RecidivismPlate = {
  plate: string;
  violationCount: number;
  typeCount: number;
  latestType: string;
  latestDetectedAt: string;
};

type Props = {
  total: number;
  byType: Record<string, number>;
  pending?: boolean;
  onOpenAll: () => void;
  onOpenType: (type: string) => void;
};

export function ViolationsEnforcementSpotlight({ total, byType, pending, onOpenAll, onOpenType }: Props) {
  const anim = !pending;
  const totalDisp = useAnimatedCount(total, anim);
  const typesByCount = violationTypesByCount(byType);
  const topEntry = typesByCount.map((t) => ({ type: t, count: byType[t] ?? 0 }))[0];

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2.5,
        overflow: "hidden",
        border: "1px solid rgba(23,38,56,0.09)",
        boxShadow: "0 8px 32px rgba(31, 74, 117, 0.12)",
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: { xs: 1.5, sm: 2 },
          color: "#FFFFFF",
          background: `linear-gradient(135deg, ${pnp.navy} 0%, ${pnp.navyMuted} 100%)`,
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: "1.125rem" }}>{SITE_LABELS.sectionViolations}</Typography>
        <Typography sx={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.88)", mt: 0.35, lineHeight: 1.45 }}>
          {SITE_LABELS.sectionViolationsHint}
        </Typography>
      </Box>

      <Box sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: "#FFFFFF" }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: 2.5,
            alignItems: { md: "flex-start" },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {pending ? (
              <Skeleton width={120} height={56} />
            ) : (
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "2.5rem", sm: "3rem" },
                  color: total > 0 ? "#B91C1C" : "#0F2A44",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {totalDisp.toLocaleString()}
              </Typography>
            )}
            <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mt: 0.75, fontWeight: 500 }}>
              {total === 0 ? SITE_LABELS.noViolationsGood : SITE_LABELS.violationsDetectedHint}
            </Typography>

            {topEntry && topEntry.count > 0 ? (
              <Typography sx={{ mt: 1, fontSize: "0.875rem", color: "text.primary", fontWeight: 600 }}>
                {SITE_LABELS.mostCommonViolation}: {violationTypeLabel(topEntry.type)} — {topEntry.count}{" "}
                {SITE_LABELS.cases}
              </Typography>
            ) : null}

            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={<PolicyIcon />}
              onClick={onOpenAll}
              sx={{ mt: 2, px: 3, py: 1.25, fontWeight: 700, textTransform: "none", borderRadius: 2 }}
            >
              {SITE_LABELS.reviewAllViolations}
            </Button>
          </Box>

          <Box
            sx={{
              width: { xs: "100%", md: 400 },
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
            }}
          >
            {typesByCount.map((type) => {
              const meta = VIOLATION_TYPE_META[type];
              const count = byType[type] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const Icon = meta.Icon;
              return (
                <ButtonBase
                  key={type}
                  onClick={() => onOpenType(type)}
                  sx={{
                    ...statTileSx,
                    p: 1.25,
                    textAlign: "left",
                    alignItems: "stretch",
                    flexDirection: "column",
                    color: "inherit",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 1,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: meta.softBg,
                        color: meta.color,
                      }}
                    >
                      <Icon sx={{ fontSize: 18 }} />
                    </Box>
                    <Typography sx={{ fontWeight: 800, fontSize: "1.125rem" }}>
                      {pending ? "—" : count.toLocaleString()}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem", lineHeight: 1.25 }}>{meta.label}</Typography>
                  {!pending && total > 0 ? (
                    <>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          mt: 0.75,
                          height: 5,
                          borderRadius: 99,
                          bgcolor: "rgba(15, 23, 42, 0.06)",
                          "& .MuiLinearProgress-bar": { bgcolor: meta.color, borderRadius: 99 },
                        }}
                      />
                      <Typography sx={{ mt: 0.35, fontSize: "0.6875rem", color: "text.secondary", fontWeight: 600 }}>
                        {SITE_LABELS.percentOfTotal.replace("{pct}", String(pct))}
                      </Typography>
                    </>
                  ) : null}
                </ButtonBase>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
