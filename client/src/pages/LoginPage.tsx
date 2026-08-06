import { Box } from "@mui/material";
import { LoginOperationalDashboard } from "../components/login/LoginOperationalDashboard";
import { LoginSecureSignIn } from "../components/login/LoginSecureSignIn";
import { LoginStatusFooter } from "../components/login/LoginStatusFooter";
import { loginNavy } from "../components/login/loginTheme";

export function LoginPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        height: "100vh",
        maxWidth: "100vw",
        overflow: { xs: "auto", lg: "hidden" },
        display: "flex",
        flexDirection: "column",
        bgcolor: loginNavy,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.62fr 1fr" },
          minHeight: 0,
        }}
      >
        <LoginOperationalDashboard />
        <LoginSecureSignIn />
      </Box>
      <LoginStatusFooter />
    </Box>
  );
}
