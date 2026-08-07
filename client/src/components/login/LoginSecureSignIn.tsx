import { useState } from "react";
import { isAxiosError } from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import FingerprintOutlinedIcon from "@mui/icons-material/FingerprintOutlined";
import QrCodeScannerOutlinedIcon from "@mui/icons-material/QrCodeScannerOutlined";
import { useAuth } from "../../auth/AuthContext";
import { SITE_BRANDING, SITE_LABELS } from "../../i18n/lang";
import { PoweredByBcss } from "../PoweredByBcss";
import { LoginHeroBackdrop } from "./LoginHeroBackdrop";
import {
  loginFutureButtonSx,
  loginFutureControlSx,
  loginFutureLabelSx,
  loginFutureLinkSx,
  loginFutureMuted,
  loginGlassCard,
  loginHeroBackground,
} from "./loginTheme";

const SHOW_MFA_FIELD = false;

const ALT_METHODS = [
  { label: "Smart Card", icon: <CreditCardOutlinedIcon sx={{ fontSize: 18 }} /> },
  { label: "Biometric", icon: <FingerprintOutlinedIcon sx={{ fontSize: 18 }} /> },
  { label: "QR Login", icon: <QrCodeScannerOutlinedIcon sx={{ fontSize: 18 }} /> },
];

const fieldSx = {
  "& .MuiInputLabel-root": { fontWeight: 600, fontSize: "0.8125rem", color: "#334155" },
  "& .MuiOutlinedInput-root": {
    bgcolor: "rgba(255,255,255,0.96)",
    borderRadius: 1.5,
    "& fieldset": { borderColor: "rgba(148, 163, 184, 0.45)" },
    "&:hover fieldset": { borderColor: "#94A3B8" },
    "&.Mui-focused fieldset": { borderColor: "#B8860B", borderWidth: 2 },
  },
};

export function LoginSecureSignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember] = useState(false);
  const mfa = "app";
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      const dest = loc.state?.from && loc.state.from !== "/login" ? loc.state.from : "/dashboard";
      navigate(dest, { replace: true });
    } catch (e: unknown) {
      if (isAxiosError(e)) {
        const msg =
          (e.response?.data as { message?: string })?.message ||
          (e.response?.data as { error?: string })?.error ||
          e.message;
        setErr(typeof msg === "string" ? msg : SITE_LABELS.signInFailed);
      } else {
        setErr(SITE_LABELS.signInFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: { xs: "100vh", lg: "calc(100vh - 56px)" },
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 1.5, lg: 2 },
        ...loginHeroBackground,
      }}
    >
      <LoginHeroBackdrop />

      <Box
        component="form"
        onSubmit={submit}
        sx={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: 420,
          borderRadius: "18px",
          p: { xs: 2.25, sm: 2.75 },
          ...loginGlassCard,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: 1.75 }}>
          <Box
            sx={{
              position: "relative",
              width: 60,
              height: 60,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              // Venue gold, not the old product's police blue.
              background: "linear-gradient(145deg, #D9AE45 0%, #B8860B 100%)",
              boxShadow: "0 0 32px rgba(217, 174, 69, 0.45), 0 10px 28px rgba(184, 134, 11, 0.35)",
              color: "#fff",
              mb: 1.5,
            }}
          >
            <ShieldOutlinedIcon sx={{ fontSize: 30 }} />
            <LockOutlinedIcon
              sx={{
                fontSize: 16,
                position: "absolute",
                bottom: 10,
                right: 10,
                bgcolor: "#946A08",
                borderRadius: "50%",
                p: 0.25,
              }}
            />
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: "1.25rem",
              letterSpacing: "0.06em",
              color: "#0F2744",
              textTransform: "uppercase",
            }}
          >
            {SITE_BRANDING.loginSecureTitle ?? "Secure sign in"}
          </Typography>
          <Typography
            sx={{
              mt: 0.5,
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#475569",
              textAlign: "center",
              lineHeight: 1.45,
              maxWidth: 320,
            }}
          >
            {SITE_BRANDING.signInSubtitle}
          </Typography>
        </Box>

        {err ? (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>
            {err}
          </Alert>
        ) : null}

        <Stack spacing={2}>
          <TextField
            label={SITE_BRANDING.loginEmailLabel ?? SITE_LABELS.officialEmail}
            type="email"
            autoComplete="username"
            placeholder={SITE_BRANDING.loginEmailPlaceholder ?? "name@pnp.gov.ph"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonOutlinedIcon sx={{ fontSize: 20, color: "#64748B" }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={fieldSx}
          />
          <TextField
            label={SITE_LABELS.password}
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            placeholder={SITE_BRANDING.loginPasswordPlaceholder ?? "Enter your password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon sx={{ fontSize: 20, color: "#64748B" }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      type="button"
                      aria-label={showPw ? "Hide password" : "Show password"}
                      onClick={() => setShowPw((v) => !v)}
                      edge="end"
                      size="small"
                    >
                      {showPw ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={fieldSx}
          />

          <FormControlLabel
            disabled
            sx={loginFutureControlSx}
            control={
              <Checkbox
                checked={remember}
                disabled
                size="small"
                sx={{ color: loginFutureMuted, "&.Mui-checked": { color: loginFutureMuted } }}
              />
            }
            label={
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, ...loginFutureLabelSx }}>
                {SITE_BRANDING.loginRememberDevice ?? "Remember this device"}
              </Typography>
            }
          />

          {/* MFA is not built yet, so the disabled "Coming soon" picker is hidden
              rather than shown as a dead control. Flip the flag to bring it back. */}
          {SHOW_MFA_FIELD ? (
            <Box aria-disabled>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, mb: 0.75, ...loginFutureLabelSx }}>
                {SITE_BRANDING.loginMfaLabel ?? "Multi-Factor Authentication (MFA)"}
                <Box component="span" sx={{ ml: 0.75, fontWeight: 600, fontSize: "0.6875rem", color: loginFutureMuted }}>
                  (Coming soon)
                </Box>
              </Typography>
              <FormControl fullWidth size="small" disabled sx={loginFutureControlSx}>
                <Select
                  value={mfa}
                  disabled
                  sx={{
                    fontWeight: 600,
                    borderRadius: 1.5,
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148, 163, 184, 0.4)" },
                  }}
                >
                  <MenuItem value="app">Authenticator App</MenuItem>
                  <MenuItem value="sms">SMS Code</MenuItem>
                  <MenuItem value="hardware">Hardware Token</MenuItem>
                </Select>
              </FormControl>
            </Box>
          ) : null}

          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={<LockOutlinedIcon />}
            sx={{
              py: 1.4,
              fontSize: "0.875rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderRadius: 2,
              bgcolor: "#0F2744",
              backgroundImage: "linear-gradient(180deg, #5E1A2B 0%, #3B0E1B 100%)",
              boxShadow: "0 10px 28px rgba(15, 39, 68, 0.5)",
              "&:hover": {
                bgcolor: "#0A1F38",
                backgroundImage: "linear-gradient(180deg, #4A1220 0%, #2B0810 100%)",
              },
            }}
          >
            {busy ? SITE_LABELS.signingIn : SITE_BRANDING.signInCta}
          </Button>

          <Box sx={{ display: "flex", justifyContent: "center", gap: 2.5, flexWrap: "wrap" }} aria-disabled>
            <Typography component="span" sx={loginFutureLinkSx}>
              {SITE_BRANDING.loginForgotPassword ?? "Forgot password?"}
            </Typography>
            <Typography component="span" sx={{ ...loginFutureLinkSx, fontWeight: 500 }}>
              {SITE_BRANDING.loginContactIt ?? "Contact IT Operations"}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.25 }} aria-disabled>
            <Divider sx={{ flex: 1, borderColor: "rgba(148,163,184,0.35)" }} />
            <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, letterSpacing: "0.14em", color: loginFutureMuted }}>
              {(SITE_BRANDING.loginAltSignIn ?? "Or sign in with").toUpperCase()}
            </Typography>
            <Divider sx={{ flex: 1, borderColor: "rgba(148,163,184,0.35)" }} />
          </Box>

          <Stack direction="row" spacing={1} aria-disabled>
            {ALT_METHODS.map((m) => (
              <Button
                key={m.label}
                type="button"
                variant="outlined"
                size="small"
                disabled
                startIcon={m.icon}
                sx={loginFutureButtonSx}
              >
                {m.label}
              </Button>
            ))}
          </Stack>

          <PoweredByBcss variant="loginCard" />
        </Stack>
      </Box>
    </Box>
  );
}
