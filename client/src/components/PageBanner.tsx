import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { pnp } from "../lib/pnpTheme";
import { contentCardSx } from "../lib/uiSurfaces";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;

  trailing?: ReactNode;

  variant?: "brand" | "light";
};

export function PageBanner({ title, subtitle, icon, trailing, variant = "light" }: Props) {
  const isBrand = variant === "brand";

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: { xs: 1.5, sm: 2 },
        px: { xs: 2, sm: 2.5 },
        py: { xs: 1.75, sm: 2 },
        borderRadius: 2,
        overflow: "hidden",
        ...(isBrand
          ? {
            color: "#FFFFFF",
            background: `linear-gradient(135deg, ${pnp.navy} 0%, ${pnp.navyMuted} 100%)`,
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 24px rgba(31, 74, 117, 0.18)",
            "&::after": {
              content: '""',
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(100% 80% at 100% 0%, rgba(255,255,255,0.14) 0%, transparent 55%)",
              pointerEvents: "none",
            },
          }
          : {
            ...contentCardSx,
            color: pnp.text,
            p: { xs: 2, sm: 2.25 },
          }),
      }}
    >
      {icon ? (
        <Box
          sx={{
            width: { xs: 48, sm: 52 },
            height: { xs: 48, sm: 52 },
            borderRadius: 1.5,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            position: "relative",
            zIndex: 1,
            ...(isBrand
              ? {
                bgcolor: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#FFFFFF",
              }
              : {
                bgcolor: pnp.primarySoft,
                border: "1px solid rgba(37, 99, 235, 0.2)",
                color: pnp.primary,
              }),
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Box sx={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          <Typography
            component="h1"
            sx={{
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              fontSize: { xs: "1.375rem", sm: "1.625rem", md: "1.75rem" },
              color: isBrand ? "#FFFFFF" : "text.primary",
            }}
          >
            {title}
          </Typography>
          {trailing ? (
            <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center", ml: { xs: 0, sm: "auto" } }}>{trailing}</Box>
          ) : null}
        </Box>
        {subtitle ? (
          <Typography
            sx={{
              mt: 0.5,
              fontWeight: 500,
              fontSize: { xs: "0.875rem", sm: "0.9375rem" },
              lineHeight: 1.5,
              maxWidth: 720,
              color: isBrand ? "rgba(255,255,255,0.9)" : "text.secondary",
            }}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
