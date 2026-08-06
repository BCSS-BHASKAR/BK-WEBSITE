
export const dash = {
  gap: { page: 2.5, section: 2, grid: 1.5, row: 1 },
  pad: { card: 2.25, cardSm: 2, tile: 1.25 },
  radius: { card: 2, tile: 1.5 },

  eyebrow: {
    fontWeight: 600,
    fontSize: "0.75rem",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    color: "text.secondary",
    lineHeight: 1.3,
  },

  cardTitle: {
    fontWeight: 700,
    fontSize: "1rem",
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
    color: "text.primary",
  },

  sectionTitle: {
    fontWeight: 700,
    fontSize: { xs: "1.25rem", sm: "1.375rem" },
    letterSpacing: "-0.02em",
    lineHeight: 1.25,
    color: "text.primary",
  },

  metric: {
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums" as const,
    fontFeatureSettings: '"tnum" 1',
    letterSpacing: "-0.02em",
    lineHeight: 1.15,
    color: "#0F172A",
  },

  metricHero: {
    fontWeight: 700,
    fontSize: { xs: "2.25rem", sm: "2.75rem" },
    fontVariantNumeric: "tabular-nums" as const,
    fontFeatureSettings: '"tnum" 1',
    letterSpacing: "-0.03em",
    lineHeight: 1,
    color: "#0F172A",
  },

  metricMd: {
    fontWeight: 700,
    fontSize: "1rem",
    fontVariantNumeric: "tabular-nums" as const,
    color: "text.primary",
  },

  hint: {
    fontWeight: 500,
    fontSize: "0.8125rem",
    color: "text.secondary",
    lineHeight: 1.45,
  },

  rowLabel: {
    fontWeight: 600,
    fontSize: "0.875rem",
    color: "text.primary",
  },
} as const;
