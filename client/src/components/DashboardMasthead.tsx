import { Box, Paper, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import type { DashboardInsight } from "../lib/dashboardInsights";

export function DashboardMasthead({ insights }: { insights: DashboardInsight[] }) {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: "grid",
        width: "100%",
        gridTemplateColumns: { xs: "repeat(4, minmax(160px, 1fr))", sm: "repeat(4, minmax(0, 1fr))" },
        gap: { xs: 1.25, sm: 1.5 },
        alignItems: "stretch",
        overflowX: { xs: "auto", sm: "visible" },
        pb: { xs: 0.25, sm: 0 },
        WebkitOverflowScrolling: "touch",
        scrollbarGutter: { xs: "stable", sm: "auto" },
      }}
    >
      {insights.map((row) => {
        const accent = row.accent ?? "#1B66D9";
        return (
          <Paper
            key={row.title}
            className="dashboard-masthead-tile"
            component={row.to ? "button" : "div"}
            type={row.to ? "button" : undefined}
            onClick={row.to ? () => navigate(row.to!) : undefined}
            elevation={0}
            sx={{
              p: 1.5,
              pl: 1.75,
              borderRadius: 2,
              textAlign: "left",
              border: "1px solid rgba(10,31,61,0.07)",
              borderLeft: "3px solid",
              borderLeftColor: accent,
              bgcolor: "#FFFFFF",
              cursor: row.to ? "pointer" : "default",
              font: "inherit",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              transition: "box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, transform 0.18s ease",
              ...(row.to
                ? {
                    "&:hover": {
                      boxShadow: "0 4px 12px rgba(10,31,61,0.08)",
                      borderColor: "rgba(27, 102, 217, 0.25)",
                      bgcolor: "rgba(248, 251, 254, 1)",
                      transform: "translateY(-1px)",
                    },
                  }
                : {}),
            }}
          >
            <Typography
              variant="overline"
              sx={{
                fontWeight: 600,
                color: "text.secondary",
                letterSpacing: "0.08em",
                lineHeight: 1.2,
                textTransform: "uppercase",
              }}
            >
              {row.title}
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                mt: 0.35,
                lineHeight: 1.25,
                fontSize: "1.05rem",
                color: "text.primary",
              }}
            >
              {row.value}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 500, color: "text.secondary", display: "block", mt: 0.65, lineHeight: 1.35 }}>
              {row.hint}
            </Typography>
            {null}
          </Paper>
        );
      })}
    </Box>
  );
}
