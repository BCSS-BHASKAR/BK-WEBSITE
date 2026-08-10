import { Box, Tooltip, Typography } from "@mui/material";

const LOGO_SRC = `${import.meta.env.BASE_URL}BcssLogo.png`;

type Variant = "sidebar" | "sidebarCollapsed" | "login" | "loginCompact" | "loginCard" | "footerCompact";

type Props = {
  variant?: Variant;
};

export function PoweredByBcss({ variant = "sidebar" }: Props) {
  if (variant === "sidebarCollapsed") {
    return (
      <Tooltip title="Powered by BCSS" placement="right" arrow>
        <Box
          sx={{
            width: "90%",
            maxWidth: 130,
            mx: "auto",
            p: "4%",
            borderRadius: 1.5,
            bgcolor: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 14px rgba(15,23,42,0.18)",
          }}
        >
          <Box
            component="img"
            src={LOGO_SRC}
            alt="BCSS"
            sx={{ width: "100%", height: "auto", maxHeight: "7.5vh", display: "block", objectFit: "contain" }}
          />
        </Box>
      </Tooltip>
    );
  }

  if (variant === "footerCompact") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 600, color: "rgba(203,213,225,0.75)" }}>Powered by</Typography>
        <Box
          sx={{
            width: "45%",
            maxWidth: 90,
            px: "3%",
            py: "1.5%",
            borderRadius: 1,
            bgcolor: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box component="img" src={LOGO_SRC} alt="BCSS" sx={{ width: "100%", height: "auto", maxHeight: "2.5vh", objectFit: "contain" }} />
        </Box>
      </Box>
    );
  }

  if (variant === "loginCard") {
    return (
      <Box
        sx={{
          mt: 1.5,
          pt: 1.25,
          borderTop: "1px dashed rgba(148, 163, 184, 0.25)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: "0.5625rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#64748B",
          }}
        >
          Powered by
        </Typography>
        <Box
          sx={{
            px: 2.5,
            py: 1,
            borderRadius: 2,
            bgcolor: "#FFFFFF",
            border: "1px solid rgba(203, 213, 225, 0.7)",
            boxShadow: "0 3px 10px rgba(15, 23, 42, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            maxWidth: "100%",
            transition: "all 0.2s ease",
            "&:hover": {
              transform: "translateY(-1px)",
              boxShadow: "0 5px 14px rgba(15, 23, 42, 0.1)",
            },
          }}
        >
          {/* The logo is a 803x162 wordmark, so height drives width at roughly
              5:1 - at the old 22px it came out ~110px wide and the company name
              inside it was unreadable. maxWidth guards the card on a narrow
              viewport, where height alone would let it overflow. */}
          <Box
            component="img"
            src={LOGO_SRC}
            alt="Blue Cloud Softtech"
            sx={{ height: 42, width: "auto", maxWidth: "100%", objectFit: "contain" }}
          />
        </Box>
      </Box>
    );
  }

  if (variant === "login") {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 1.25,
          px: 2,
          py: 0.85,
          borderRadius: 2.5,
          bgcolor: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(217, 174, 69, 0.25)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: "0.6875rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(242, 214, 138, 0.9)",
            whiteSpace: "nowrap",
          }}
        >
          Powered by
        </Typography>
        <Box
          sx={{
            px: 1.75,
            py: 0.55,
            borderRadius: 1.5,
            bgcolor: "#FFFFFF",
            boxShadow: "0 3px 12px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            component="img"
            src={LOGO_SRC}
            alt="Blue Cloud Softtech"
            sx={{ height: 22, width: "auto", objectFit: "contain" }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.75,
        width: "100%",
      }}
    >
      <Typography
        sx={{
          fontWeight: 600,
          fontSize: "0.625rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(241,245,249,0.68)",
          lineHeight: 1,
        }}
      >
        Powered by
      </Typography>
      <Box
        sx={{
          width: "80%",
          maxWidth: 210,
          px: "4%",
          py: "2.5%",
          borderRadius: 2,
          bgcolor: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 22px rgba(15,23,42,0.2)",
        }}
      >
        <Box
          component="img"
          src={LOGO_SRC}
          alt="BCSS"
          sx={{ width: "100%", height: "auto", maxHeight: "5.5vh", objectFit: "contain" }}
        />
      </Box>
    </Box>
  );
}
