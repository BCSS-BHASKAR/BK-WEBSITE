import React, { useState } from "react";
import { Avatar, Badge, Box, Button, IconButton, Typography, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import MailOutlineOutlinedIcon from "@mui/icons-material/MailOutlineOutlined";
import { SITE_LABELS } from "../i18n/lang";
import { useShellHeader } from "../context/ShellHeaderContext";
import { pnp, pnpFont } from "../lib/pnpTheme";

type Props = {
  pageTitle: string;
  pageSubtitle?: string;
  userEmail?: string | null;
  onSignOut: () => void;
};

function initialsFromEmail(email?: string | null): string {
  if (!email) return "OP";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function displayName(email?: string | null): string {
  if (!email) return "Venue Operations";
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppMasthead({ pageTitle, pageSubtitle, userEmail, onSignOut }: Props) {
  const { rightSlot, leftSlot } = useShellHeader();
  const subtitle = pageSubtitle?.trim() || undefined;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const handleProfileClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleProfileClose = () => {
    setAnchorEl(null);
  };

  return (
    <Box
      sx={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        px: { xs: 1.5, sm: 2.5 },
        py: { xs: 1, sm: 1.25 },
        minHeight: { xs: 64, sm: 72 },
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: { xs: 1, md: 2 },
        flexWrap: "nowrap",
      }}
    >
      {/* Left section: Title & Subtitle */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          minWidth: 0,
          flex: "1 1 auto",
          overflow: "hidden",
        }}
      >
        {leftSlot}
        <Box sx={{ minWidth: 0, overflow: "hidden" }}>
          <Typography sx={{ ...pnpFont.pageTitle, fontSize: { xs: "1.125rem", md: "1.5rem" } }} noWrap>
            {pageTitle}
          </Typography>
          {subtitle ? (
            <Typography sx={{ ...pnpFont.pageSubtitle, mt: 0.35, fontSize: { xs: "0.75rem", md: "0.875rem" } }} noWrap>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>

      {/* Right section: Actions & Profile */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 0.5, sm: 1 },
          flexShrink: 0,
          flexWrap: "nowrap",
        }}
      >
        {/* Hide rightSlot (like site time/report period) on mobile to save space */}
        <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}>
          {rightSlot}
        </Box>

        {/* Action Icons: Hide on very small screens, show on sm and up */}
        <Box sx={{ display: { xs: "none", sm: "flex" }, gap: { xs: 0.5, sm: 1 } }}>
          <IconButton
            size="small"
            aria-label="Notifications"
            sx={{ border: pnp.cardBorder, borderRadius: "8px", width: 36, height: 36, flexShrink: 0 }}
          >
            <Badge badgeContent={3} color="error">
              <NotificationsNoneOutlinedIcon sx={{ fontSize: 20, color: pnp.text }} />
            </Badge>
          </IconButton>
          <IconButton
            size="small"
            aria-label="Messages"
            sx={{
              border: pnp.cardBorder,
              borderRadius: "8px",
              width: 36,
              height: 36,
              flexShrink: 0,
            }}
          >
            <Badge badgeContent={2} color="error">
              <MailOutlineOutlinedIcon sx={{ fontSize: 20, color: pnp.text }} />
            </Badge>
          </IconButton>
        </Box>

        {/* Profile Section */}
        <Box
          onClick={handleProfileClick}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            pl: { xs: 0, sm: 0.5 },
            cursor: "pointer",
            borderRadius: 1,
            p: 0.5,
            "&:hover": { bgcolor: "rgba(0,0,0,0.04)" },
            flexShrink: 0,
            minWidth: 0,
          }}
        >
          <Avatar sx={{ width: 36, height: 36, bgcolor: pnp.primary, fontSize: "0.8125rem", fontWeight: 700, flexShrink: 0 }}>
            {initialsFromEmail(userEmail)}
          </Avatar>
          <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0, maxWidth: 160 }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: pnp.text, lineHeight: 1.2 }} noWrap>
              {displayName(userEmail)}
            </Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: pnp.textSecondary }} noWrap>
              Venue Operations
            </Typography>
          </Box>
        </Box>

        <Button
          size="small"
          variant="outlined"
          startIcon={<LogoutIcon sx={{ fontSize: 18 }} />}
          onClick={onSignOut}
          sx={{
            fontWeight: 600,
            fontSize: "0.8125rem",
            borderColor: "rgba(15, 23, 42, 0.12)",
            color: pnp.text,
            borderRadius: "8px",
            textTransform: "none",
            flexShrink: 0,
            display: { xs: "none", xl: "inline-flex" },
            ml: 1,
          }}
        >
          {SITE_LABELS.signOut}
        </Button>
      </Box>

      {/* Profile Menu for small screens */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileClose}
        slotProps={{
          paper: {
            elevation: 3,
            sx: { mt: 1, minWidth: 180, borderRadius: 2 },
          },
        }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <Box sx={{ px: 2, py: 1, display: { xs: "block", md: "none" } }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>{displayName(userEmail)}</Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Venue Operations</Typography>
        </Box>
        <MenuItem
          onClick={() => {
            handleProfileClose();
            onSignOut();
          }}
          sx={{ color: "error.main", mt: { xs: 1, md: 0 } }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" sx={{ color: "error.main" }} />
          </ListItemIcon>
          <ListItemText primary={<Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "error.main" }}>Sign Out</Typography>} />
        </MenuItem>
      </Menu>
    </Box>
  );
}
