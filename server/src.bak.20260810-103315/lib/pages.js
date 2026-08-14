"use strict";

// The catalogue of protectable pages.
//
// This is the single source of truth for RBAC on the server. Each entry maps a
// page to the API path prefixes that back it, so revoking a page revokes its
// data too - hiding a nav item alone would leave the endpoints wide open to
// anyone who typed the URL.
//
// The client mirrors the keys in client/src/lib/pages.ts.

const PAGES = [
  {
    key: "dashboard", label: "Dashboard", group: "Overview",
    route: "/dashboard",
    api: ["/inference/summary", "/inference/stats", "/inference/health", "/inference/timeline"],
  },
  {
    key: "daily_briefing", label: "AI Daily Briefing", group: "Overview",
    route: "/daily-briefing",
    api: ["/dashboard/daily-briefing"],
  },
  {
    key: "monitoring_walkins", label: "Walk-ins", group: "Monitoring",
    route: "/monitoring/walkins",
    api: ["/inference/walkins", "/inference/kpis/walkins", "/inference/analytics/walkins", "/inference/export/walkins"],
  },
  {
    key: "monitoring_loitering", label: "Loitering", group: "Monitoring",
    route: "/monitoring/loitering",
    api: ["/inference/loitering", "/inference/kpis/loitering", "/inference/analytics/loitering", "/inference/export/loitering"],
  },
  {
    key: "monitoring_intrusion", label: "Intrusion", group: "Monitoring",
    route: "/monitoring/intrusion",
    api: ["/inference/intrusion", "/inference/kpis/intrusion", "/inference/analytics/intrusion", "/inference/export/intrusion"],
  },
  {
    key: "monitoring_after_hours", label: "After Hours", group: "Monitoring",
    route: "/monitoring/after-hours",
    api: ["/inference/after-hours", "/inference/kpis/after_hours", "/inference/analytics/after_hours", "/inference/export/after_hours"],
  },
  {
    key: "monitoring_kitchen", label: "Kitchen Unattended", group: "Monitoring",
    route: "/monitoring/kitchen-unattended",
    api: ["/inference/kitchen-unattended", "/inference/kpis/kitchen_unattended", "/inference/analytics/kitchen_unattended", "/inference/export/kitchen_unattended"],
  },
  {
    // One prefix covers the sub-streams too (/chef-absence/intrusions,
    // /detections, /kpis, /analytics) because pageForApiPath matches on
    // "<prefix>/". These rows carry face crops and face_quality, so this grant
    // is what gates biometric material.
    key: "monitoring_chef_absence", label: "Chef Absence", group: "Monitoring",
    route: "/monitoring/chef-absence",
    api: [
      "/inference/chef-absence",
      "/inference/kpis/chef_absence",
      "/inference/analytics/chef_absence",
      "/inference/export/chef_absence",
    ],
  },
  {
    key: "active_alerts", label: "Active Alerts", group: "Operations",
    route: "/crowds-report",
    api: ["/dashboard/crowds-range-stats", "/dashboard/crowds-report-events"],
  },
  {
    key: "cameras_online", label: "Cameras Online", group: "Operations",
    route: "/live-view",
    api: ["/streams"],
  },
  {
    key: "known_faces", label: "Known Faces", group: "Operations",
    route: "/known-faces",
    api: ["/walking-enroll"],
  },
  {
    key: "inference_viewer", label: "Inference Viewer", group: "Operations",
    route: "/inference",
    api: ["/inference/media", "/inference/facets", "/inference/cameras"],
  },
  {
    key: "settings", label: "Settings", group: "Administration",
    route: "/settings",
    api: ["/settings"],
  },
  {
    key: "access_control", label: "Roles & Access", group: "Administration",
    route: "/settings/access",
    api: ["/rbac"],
  },
];

const PAGE_KEYS = PAGES.map((p) => p.key);
const PAGE_BY_KEY = Object.fromEntries(PAGES.map((p) => [p.key, p]));

/**
 * Which page guards a given API path, if any.
 * Longest prefix wins so /inference/kpis/walkins resolves to the walk-ins page
 * rather than the dashboard's shorter /inference prefix.
 */
function pageForApiPath(path) {
  let best = null;
  for (const p of PAGES) {
    for (const prefix of p.api) {
      if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
        if (!best || prefix.length > best.prefix.length) best = { page: p, prefix };
      }
    }
  }
  return best ? best.page : null;
}

module.exports = { PAGES, PAGE_KEYS, PAGE_BY_KEY, pageForApiPath };
