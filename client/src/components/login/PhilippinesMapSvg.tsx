import { Box, Typography } from "@mui/material";
import { RodriguezOperationsMap } from "../maps/RodriguezOperationsMap";

export function PhilippinesMapSvg() {
  return (
    <Box sx={{ flex: 1, width: "100%", minHeight: 240, display: "flex", flexDirection: "column", gap: 0.75 }}>
      <Box>
        <Typography
          sx={{
            fontSize: "0.625rem",
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(226,232,240,0.95)",
          }}
        >
          Live Operations Map
        </Typography>
        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 600, color: "rgba(148,163,184,0.92)", mt: 0.2 }}>
          Rodriguez, Rizal
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 220, minWidth: 0 }}>
        <RodriguezOperationsMap minHeight={220} violationsByCamera={[]} />
      </Box>
    </Box>
  );
}
