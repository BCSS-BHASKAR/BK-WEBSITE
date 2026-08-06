import { Box, Tooltip } from "@mui/material";

const LOGO_SRC = `${import.meta.env.BASE_URL}AccessGenieLogo.svg`;

type Variant = "sidebar" | "sidebarCollapsed" | "login" | "loginCompact" | "loginCard" | "footerCompact";

type Props = {
  variant?: Variant;
};

export function PoweredByAccessGenie({ variant = "sidebar" }: Props) {
  if (variant === "sidebarCollapsed") {
    return (
      <Tooltip title="Access Genie" placement="right" arrow>
        <Box
          component="img"
          src={LOGO_SRC}
          alt="Access Genie"
          sx={{ height: 24, width: "auto", display: "block", objectFit: "contain", mx: "auto" }}
        />
      </Tooltip>
    );
  }

  if (variant === "footerCompact") {
    return (
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Box component="img" src={LOGO_SRC} alt="Access Genie" sx={{ height: 18, width: "auto", objectFit: "contain" }} />
      </Box>
    );
  }

  if (variant === "loginCard") {
    return (
      <Box sx={{ mt: 2, pt: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Box component="img" src={LOGO_SRC} alt="Access Genie" sx={{ height: 28, width: "auto", objectFit: "contain" }} />
      </Box>
    );
  }

  if (variant === "loginCompact") {
    return (
      <Box sx={{ mt: 3, pt: 2.5, borderTop: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Box component="img" src={LOGO_SRC} alt="Access Genie" sx={{ height: 32, width: "auto", objectFit: "contain" }} />
      </Box>
    );
  }

  if (variant === "login") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <Box component="img" src={LOGO_SRC} alt="Access Genie" sx={{ height: 40, width: "auto", objectFit: "contain" }} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <Box component="img" src={LOGO_SRC} alt="Access Genie" sx={{ height: 32, width: "auto", objectFit: "contain" }} />
    </Box>
  );
}
