import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { pnpFont } from "../lib/pnpTheme";

type Props = {
  children: ReactNode;
  subtitle?: ReactNode;
};

export function PageTitle({ children, subtitle }: Props) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h2" sx={{ ...pnpFont.pageTitle, fontSize: "1.125rem" }}>
        {children}
      </Typography>
      {subtitle ? (
        <Typography sx={{ ...pnpFont.pageSubtitle, mt: 0.35, maxWidth: 720 }}>
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}
