import type { ReactNode } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { pnp } from "../lib/pnpTheme";

type SectionProps = {
  id: string;
  title: string;
  subtitle: string;
  defaultExpanded?: boolean;
  showLiveBadge?: boolean;
  children: ReactNode;
};

export function DashboardDetailsAccordion({
  id,
  title,
  subtitle,
  defaultExpanded,
  showLiveBadge,
  children,
}: SectionProps) {
  return (
    <Accordion
      id={id}
      defaultExpanded={defaultExpanded}
      elevation={0}
      disableGutters
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "12px !important",
        overflow: "hidden",
        bgcolor: "#FFFFFF",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
        "&:before": { display: "none" },
        "&.Mui-expanded": { margin: 0 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 26, color: pnp.textSecondary }} />}
        sx={{
          px: 2,
          py: 0.5,
          minHeight: 64,
          bgcolor: "#FFFFFF",
          borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
          "& .MuiAccordionSummary-content": { my: 1.25, alignItems: "center", flex: 1 },
          "& .MuiAccordionSummary-expandIconWrapper": { ml: 0.5 },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", color: pnp.text, letterSpacing: "-0.01em" }}>{title}</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, mt: 0.35, lineHeight: 1.4 }}>{subtitle}</Typography>
        </Box>
        {showLiveBadge ? (
          <Chip
            size="small"
            icon={<FiberManualRecordIcon sx={{ fontSize: "8px !important", color: `${pnp.success} !important` }} />}
            label="Live"
            sx={{
              height: 24,
              mr: 1,
              fontWeight: 700,
              fontSize: "0.6875rem",
              bgcolor: pnp.successSoft,
              color: pnp.success,
              border: "none",
              "& .MuiChip-icon": { ml: 0.75 },
            }}
          />
        ) : null}
      </AccordionSummary>
      <AccordionDetails sx={{ px: { xs: 1.5, sm: 2 }, pt: 1.5, pb: 2, bgcolor: "#F8FAFC", display: "flex", flexDirection: "column", gap: 0 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
