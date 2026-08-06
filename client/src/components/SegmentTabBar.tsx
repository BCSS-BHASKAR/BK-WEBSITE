import type { ReactNode } from "react";
import { Box, type SxProps, type Theme } from "@mui/material";
import { pnp } from "../lib/pnpTheme";

export type SegmentTab<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
};

export function SegmentTabBar<T extends string>({
  active,
  onChange,
  tabs,
  ariaLabel,
  maxWidth = { xs: "100%", sm: 440 },
  sx,
}: {
  active: T;
  onChange: (tab: T) => void;
  tabs: SegmentTab<T>[];
  ariaLabel: string;
  maxWidth?: string | number | Record<string, string | number>;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", width: "100%", ...sx }}>
      <Box
        role="tablist"
        aria-label={ariaLabel}
        sx={{
          display: "flex",
          width: "100%",
          maxWidth,
          p: 0.35,
          borderRadius: "999px",
          border: "1px solid rgba(15, 23, 42, 0.12)",
          bgcolor: "#fff",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          overflow: "hidden",
          minHeight: 40,
        }}
      >
        {tabs.map((tab, index) => {
          const selected = active === tab.id;
          return (
            <Box key={tab.id} sx={{ display: "flex", flex: 1, minWidth: 0 }}>
              {index > 0 && (
                <Box
                  sx={{
                    width: "1px",
                    alignSelf: "stretch",
                    bgcolor: "rgba(15, 23, 42, 0.1)",
                    my: 0.45,
                    flexShrink: 0,
                  }}
                />
              )}
              <Box
                component="button"
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(tab.id)}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  cursor: "pointer",
                  font: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.6,
                  fontWeight: 700,
                  fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                  py: { xs: 0.55, sm: 0.65 },
                  px: { xs: 1.25, sm: 2.25 },
                  mx: 0.2,
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                  transition: "background-color 0.15s ease, color 0.15s ease",
                  bgcolor: selected ? pnp.primary : "transparent",
                  color: selected ? "#fff" : "text.secondary",
                  boxShadow: selected ? "0 1px 2px rgba(37, 99, 235, 0.25)" : "none",
                  "&:hover": {
                    bgcolor: selected ? pnp.primary : "rgba(15, 23, 42, 0.04)",
                  },
                  "&:focus-visible": {
                    outline: `2px solid ${pnp.primary}`,
                    outlineOffset: 2,
                  },
                }}
              >
                {tab.icon}
                {tab.label}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
