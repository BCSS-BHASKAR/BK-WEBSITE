import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PolicyIcon from "@mui/icons-material/Policy";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import SoupKitchenOutlinedIcon from "@mui/icons-material/SoupKitchenOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import DirectionsWalkOutlinedIcon from "@mui/icons-material/DirectionsWalkOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";

import MenuIcon from "@mui/icons-material/Menu";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ShellHeaderProvider, useShellHeader } from "../context/ShellHeaderContext";
import { AppMasthead } from "./AppMasthead";
import { SITE_BRANDING, SITE_LABELS } from "../i18n/lang";
import { PoweredByBcss } from "./PoweredByBcss";
import { PnpBadge } from "./PnpBadge";
import { pnp, pnpNavItemSx, pnpSidebarBg } from "../lib/pnpTheme";
import { ui } from "../lib/uiSurfaces";
import { AppFooter } from "./AppFooter";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import FaceRetouchingNaturalOutlinedIcon from "@mui/icons-material/FaceRetouchingNaturalOutlined";
import CameraOutdoorOutlinedIcon from "@mui/icons-material/CameraOutdoorOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import NightsStayOutlinedIcon from "@mui/icons-material/NightsStayOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import { usePermissions } from "../lib/permissions";

const SHOW_SIDEBAR_STATUS_AND_PROFILE = false;

// This deployment is a hospitality venue, so the traffic-enforcement and ANPR
// modules are hidden from navigation. Routes stay registered in App.tsx — flip
// this to false to bring the entries back.
const HIDE_VEHICLE_MODULES = true;

const DRAWER_WIDTH = 240;
const DRAWER_COLLAPSED = 140;
const SIDEBAR_STORAGE_KEY = "enterprise-sidebar-collapsed";
const MASTHEAD_HEIGHT = { xs: 72, sm: 76 };

const nav: {
  label: string;
  path: string | null;
  /** RBAC key; entries without one are always shown. */
  page?: string;
  icon: ReactNode;
  openInNewTab?: boolean;
  vehicleModule?: boolean;
  // Kept routable (the dashboard still links here) but dropped from the menu.
  hiddenFromMenu?: boolean;
  /** Renders a small caption above this item, starting a visual group. */
  sectionLabel?: string;
  /** Indented as a child of the section above it. */
  child?: boolean;
}[] = [
  { label: SITE_LABELS.operationalDashboardsNavShort, path: "/dashboard", icon: <DashboardIcon />, page: "dashboard" },
  { label: "AI Daily Briefing", path: "/daily-briefing", icon: <AutoAwesomeOutlinedIcon />, page: "daily_briefing" },

  // One Monitoring page template serves all five inference types; each entry
  // differs only by its route slug. See lib/inferenceModules.ts.
  { label: "Walk-ins", path: "/monitoring/walkins", icon: <DirectionsWalkOutlinedIcon />, sectionLabel: "Monitoring", child: true, page: "monitoring_walkins" },
  { label: "Loitering", path: "/monitoring/loitering", icon: <TimerOutlinedIcon />, child: true, page: "monitoring_loitering" },
  { label: "Intrusion", path: "/monitoring/intrusion", icon: <ReportGmailerrorredOutlinedIcon />, child: true, page: "monitoring_intrusion" },
  { label: "After Hours", path: "/monitoring/after-hours", icon: <NightsStayOutlinedIcon />, child: true, page: "monitoring_after_hours" },
  { label: "Kitchen Unattended", path: "/monitoring/kitchen-unattended", icon: <SoupKitchenOutlinedIcon />, child: true, page: "monitoring_kitchen" },

  { label: "Active Alerts", path: "/crowds-report", icon: <WarningAmberRoundedIcon />, page: "active_alerts" },
  { label: SITE_LABELS.liveView, path: "/live-view", icon: <VideocamRoundedIcon />, page: "cameras_online" },
  { label: "Inference Viewer", path: "/inference", icon: <CameraOutdoorOutlinedIcon />, hiddenFromMenu: true },
  { label: "Known Faces", path: "/known-faces", icon: <FaceRetouchingNaturalOutlinedIcon />, page: "known_faces" },
  { label: "Settings", path: "/settings", icon: <SettingsOutlinedIcon />, page: "settings" },
  { label: "Users & Access", path: "/settings/access", icon: <AdminPanelSettingsOutlinedIcon />, page: "access_control" },

  // Parked until the Python assistant services are deployed — drop
  // hiddenFromMenu to put it back in the sidebar.
  { label: "Data Assistant", path: "/assistant", icon: <SmartToyOutlinedIcon />, hiddenFromMenu: true },
  { label: "Alert Trace", path: "/vehicle-journey", icon: <RouteOutlinedIcon />, hiddenFromMenu: true },
  { label: SITE_LABELS.trafficViolations, path: "/violations", icon: <PolicyIcon />, vehicleModule: true },
  { label: "Violation Ticket Issuance", path: "/challan-email", icon: <ReceiptLongOutlinedIcon />, vehicleModule: true },
  { label: "Plate Read Analytics", path: "/vehicle-report", icon: <ListAltIcon />, vehicleModule: true },

  { label: "Offenders", path: null, icon: <PeopleOutlinedIcon />, vehicleModule: true },
  { label: "Vehicles", path: null, icon: <DirectionsCarOutlinedIcon />, vehicleModule: true },

];

const baseNav = nav.filter((n) => !n.hiddenFromMenu && !(HIDE_VEHICLE_MODULES && n.vehicleModule));

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function isNavActive(path: string | null, pathname: string) {
  if (path == null) return false;
  if (path === "/challan-email") return pathname === path || pathname.startsWith("/challan-email");
  return pathname === path;
}

function navItemSx(selected: boolean, sidebarExpanded: boolean) {
  return {
    ...pnpNavItemSx(selected),
    justifyContent: sidebarExpanded ? ("flex-start" as const) : ("center" as const),
    px: sidebarExpanded ? 1.5 : 1.25,
    py: sidebarExpanded ? 0.65 : 0.5,
    mb: 0.35,
    minHeight: 36,
    opacity: 1,
  };
}

const navPageTitle: Record<string, string> = {
  "/daily-briefing": "AI Daily Briefing",
  "/dashboard": SITE_LABELS.operationalDashboards,
  "/violations": SITE_LABELS.trafficViolations,
  "/vehicle-report": SITE_LABELS.anprRecords,
  "/walkins-report": "Walk-ins",
  "/crowds-report": "Active Alerts",
  "/vehicle-journey": "Alert Trace",
  "/live-view": SITE_LABELS.liveView,
  "/watchlists": "Kitchen Unattended",
  "/watchlists/rules": "Kitchen Unattended Rules",
  "/known-faces": "Known Faces",
  "/assistant": "Data Assistant",
  "/challan-email": "Ticket & Email Management",
};

const navPageSubtitle: Record<string, string> = {
  "/daily-briefing": "Executive brief \u2014 narrative insights and recommendations for venue management.",
  "/dashboard": SITE_LABELS.operationalDashboardsSubtitle,
  "/violations": SITE_LABELS.violationEventGrid,
  "/vehicle-report": SITE_LABELS.anprRecordsPageSubtitle,
  "/walkins-report": SITE_LABELS.walkinsRecordsPageSubtitle,
  "/crowds-report": SITE_LABELS.crowdsRecordsPageSubtitle,
  "/vehicle-journey": "Trace a single subject's alerts across the venue's camera areas.",
  "/watchlists": "Records created every time the cameras detect no staff in the kitchen.",
  "/watchlists/rules": "Manage presence rules and camera scope for kitchen staff alerts.",
  "/known-faces": "Enroll guests and staff by name so they can be recognized on live camera feeds.",
  "/assistant": "Ask about guest footfall, kitchen staffing, and alerts — answers come from your database only.",
  "/challan-email": "Generate tickets and send violation notices to vehicle owners.",
};

function AppShellInner() {
  // Hide nav entries this role cannot open. Entries without a `page` key (none
  // today) stay visible. The API enforces the same grants independently, so
  // this is presentation, not the security boundary.
  const { can, isLoading: permsLoading } = usePermissions();
  const visibleNav = useMemo(
    () => baseNav.filter((n) => !n.page || permsLoading || can(n.page as never)),
    [can, permsLoading]
  );

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { setLeftSlot } = useShellHeader();

  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarExpanded = isMobile ? true : !collapsed;
  const drawerWidth = isMobile ? DRAWER_WIDTH : sidebarExpanded ? DRAWER_WIDTH : DRAWER_COLLAPSED;

  const pageTitle = useMemo(() => navPageTitle[loc.pathname] ?? SITE_BRANDING.productShort, [loc.pathname]);
  const pageSubtitle = useMemo(() => navPageSubtitle[loc.pathname], [loc.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {

    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  }, [isMobile]);

  useEffect(() => {
    setLeftSlot(
      <IconButton
        aria-label="Toggle navigation menu"
        onClick={toggleSidebar}
        sx={{
          border: "1px solid rgba(15, 23, 42, 0.1)",
          borderRadius: "8px",
          width: 36,
          height: 36,
          color: pnp.text,
        }}
      >
        <MenuIcon sx={{ fontSize: 20 }} />
      </IconButton>
    );
    return () => setLeftSlot(null);
  }, [setLeftSlot, toggleSidebar]);

  const drawerPaperSx = {
    width: drawerWidth,
    boxSizing: "border-box" as const,
    borderRight: "1px solid rgba(255,255,255,0.08)",
    color: "#F8FAFC",
    bgcolor: pnpSidebarBg,
    overflowX: "hidden" as const,
    overflowY: "auto" as const,
    scrollbarWidth: "none" as const,
    msOverflowStyle: "none" as const,
    "&::-webkit-scrollbar": {
      display: "none",
    },
    transition: theme.transitions.create("width", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  };

  const drawerBody = (
    <Box
      sx={{
        p: sidebarExpanded ? 1.5 : 1,
        pt: sidebarExpanded ? 1.5 : 1,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {sidebarExpanded ? (
        <Box sx={{ px: 0.5, mb: 1, textAlign: "center", overflow: "visible" }}>
          {/* The badge artwork already carries the wordmark, so only the console
              label is repeated here. */}
          <PnpBadge size={80} sx={{ mx: "auto" }} />
          <Typography
            sx={{
              display: "block",
              fontSize: "0.6875rem",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(242, 214, 138, 0.92)",
            }}
          >
          </Typography>
        </Box>
      ) : (
        <Tooltip title={SITE_BRANDING.productName} placement="right" arrow>
          <Box sx={{ display: "flex", justifyContent: "center", mb: 1, overflow: "visible" }}>
            <PnpBadge size={72} />
          </Box>
        </Tooltip>
      )}

      <List dense sx={{ mt: 0, flex: 1, py: 0 }}>
        {visibleNav.map((n) => {
          const selected = isNavActive(n.path, loc.pathname);
          const sectionCaption =
            n.sectionLabel && sidebarExpanded ? (
              <Typography
                key={`sec-${n.sectionLabel}`}
                sx={{
                  px: 2, pt: 1.5, pb: 0.5, fontSize: 10, fontWeight: 800,
                  letterSpacing: "0.09em", textTransform: "uppercase",
                  color: "rgba(248,250,252,0.45)",
                }}
              >
                {n.sectionLabel}
              </Typography>
            ) : null;
          const disabled = n.path == null;
          
          const linkProps: any = !disabled && n.path
            ? { 
                component: Link, 
                to: n.path,
                ...(n.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})
              }
            : { component: "div" };

          const item = (
            <ListItemButton
              key={n.label}
              {...linkProps}
              selected={selected}
              disabled={disabled}
              aria-current={selected ? "page" : undefined}
              sx={{
                ...navItemSx(selected, sidebarExpanded),
                ...(n.child && sidebarExpanded ? { pl: 3.25 } : {}),
                ...(disabled
                  ? {
                      opacity: 0.45,
                      cursor: "default",
                      "&.Mui-disabled": { opacity: 0.45, color: pnp.navText },
                    }
                  : {}),
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: sidebarExpanded ? 40 : 0,
                  justifyContent: "center",
                  color: selected ? "#FFFFFF" : "rgba(248,250,252,0.75)",
                  "& .MuiSvgIcon-root": { fontSize: 22 },
                }}
              >
                {n.icon}
              </ListItemIcon>
              {sidebarExpanded ? (
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontWeight: selected ? 600 : 500,
                          fontSize: "0.875rem",
                          color: selected ? "#FFFFFF" : "rgba(248,250,252,0.9)",
                        }}
                        noWrap
                      >
                        {n.label}
                      </Typography>
                      {n.openInNewTab ? (
                        <OpenInNewIcon sx={{ fontSize: 14, opacity: 0.65, flexShrink: 0 }} />
                      ) : null}
                    </Box>
                  }
                />
              ) : null}
            </ListItemButton>
          );

          const rendered = sidebarExpanded ? (
            item
          ) : (
            <Tooltip key={n.label} title={n.label} placement="right" arrow>
              <span>{item}</span>
            </Tooltip>
          );

          // A section caption cannot be a sibling of the item inside .map, so
          // both are returned together under one fragment key.
          return sectionCaption ? (
            <Box key={`grp-${n.label}`}>{sectionCaption}{rendered}</Box>
          ) : (
            rendered
          );
        })}
      </List>

      {}
      {SHOW_SIDEBAR_STATUS_AND_PROFILE && sidebarExpanded ? (
        <>
          <Box sx={{ mt: 1, p: 1.25, borderRadius: "8px", bgcolor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, letterSpacing: "0.12em", color: pnp.navTextMuted, mb: 0.75 }}>
              SYSTEM STATUS
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: "#4ADE80" }} />
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#86EFAC" }}>All Systems Operational</Typography>
            </Box>
          </Box>
          <Box
            sx={{
              mt: 1.5,
              p: 1.25,
              borderRadius: "8px",
              bgcolor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Avatar sx={{ width: 36, height: 36, bgcolor: pnp.primary, fontSize: "0.75rem", fontWeight: 700 }}>
              {(user?.email?.[0] ?? "O").toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: "#F8FAFC", lineHeight: 1.2 }} noWrap>
                {user?.email?.split("@")[0]?.replace(/[._]/g, " ") ?? "Officer"}
              </Typography>
              <Typography sx={{ fontSize: "0.6875rem", color: pnp.navTextMuted }}>Operations Officer</Typography>
            </Box>
          </Box>
        </>
      ) : null}

      <Box sx={{ mt: "auto", pt: 1, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "center" }}>
        <PoweredByBcss variant={sidebarExpanded ? "sidebar" : "sidebarCollapsed"} />
      </Box>
    </Box>
  );

  const mastheadSpacer = MASTHEAD_HEIGHT;

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden", maxWidth: "100vw" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: isMobile ? "100%" : `calc(100% - ${drawerWidth}px)`,
          maxWidth: "100vw",
          minWidth: 0,
          ml: isMobile ? 0 : `${drawerWidth}px`,
          bgcolor: pnp.headerBg,
          borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
          transition: theme.transitions.create(["width", "margin"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Toolbar disableGutters sx={{ minHeight: MASTHEAD_HEIGHT, height: "auto", p: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
            <AppMasthead
              pageTitle={pageTitle}
              pageSubtitle={pageSubtitle}
              userEmail={user?.email}
              onSignOut={() => {
                logout();
                navigate("/login", { replace: true });
              }}
            />
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="nav" aria-label="Main navigation" sx={{ width: isMobile ? 0 : drawerWidth, flexShrink: 0 }}>
        {isMobile ? (
          <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ [`& .MuiDrawer-paper`]: drawerPaperSx }}>
            {drawerBody}
          </Drawer>
        ) : (
          <Drawer variant="permanent" open sx={{ [`& .MuiDrawer-paper`]: drawerPaperSx }}>
            {drawerBody}
          </Drawer>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          minHeight: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          bgcolor: loc.pathname === "/assistant" || loc.pathname.startsWith("/assistant_enhance") ? "#0B1220" : pnp.pageBg,
          width: isMobile ? "100%" : `calc(100% - ${drawerWidth}px)`,
          transition: theme.transitions.create(["width", "margin"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Toolbar sx={{ minHeight: mastheadSpacer, flexShrink: 0 }} />
        <Box
          component="section"
          aria-label="Page content"
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            pt: ui.mastheadContentGap,
            px: { xs: 2, md: 2.5 },
            pb: loc.pathname.startsWith("/assistant_enhance") ? 0 : { xs: 2, md: 2.5 },
          }}
        >
          <Box
            sx={{
              maxWidth: ui.maxContentWidth,
              mx: "auto",
              width: "100%",
              minWidth: 0,
              minHeight: "100%",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}><Outlet /></Box>
            {loc.pathname.startsWith("/assistant_enhance") ? null : <AppFooter />}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function AppShell() {
  return (
    <ShellHeaderProvider>
      <AppShellInner />
    </ShellHeaderProvider>
  );
}
