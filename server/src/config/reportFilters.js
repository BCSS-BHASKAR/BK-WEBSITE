const { SITE_CONFIG } = require("./siteConfig");

function walkinSites() {
  return SITE_CONFIG.walkins?.sites ?? [];
}

function walkinEntrances() {
  return SITE_CONFIG.walkins?.entrances ?? [];
}

function crowdSites() {
  return SITE_CONFIG.crowd?.sites ?? [];
}

function crowdZones() {
  return SITE_CONFIG.crowd?.zones ?? [];
}

function walkinSiteMap() {
  const map = {};
  for (const s of walkinSites()) {
    map[Number(s.siteId)] = s.name;
  }
  return map;
}

function walkinCameraMap() {
  const map = {};
  for (const e of walkinEntrances()) {
    map[e.cameraId] = e.name;
  }
  return map;
}

function crowdCameraMap() {
  const map = {};
  for (const z of crowdZones()) {
    map[z.cameraId] = z.name;
  }
  return map;
}

function crowdSiteNamesList() {
  return crowdSites().map((s) => s.name);
}

function resolveWalkinSiteName(siteId) {
  return walkinSiteMap()[Number(siteId)] || "";
}

function resolveWalkinEntranceName(cameraId) {
  const id = String(cameraId || "");
  const hit = walkinEntrances().find((e) => e.cameraId === id);
  return hit?.name || id;
}

function resolveCrowdZoneName(cameraId) {
  const id = String(cameraId || "");
  const hit = crowdZones().find((z) => z.cameraId === id);
  return hit?.name || id;
}

function allowedWalkinCameraIds() {
  return new Set(walkinEntrances().map((e) => e.cameraId));
}

function allowedCrowdCameraIds() {
  return new Set(crowdZones().map((z) => z.cameraId));
}

function walkinCamerasWithCounts(camRows) {
  const allowed = allowedWalkinCameraIds();
  const totals = new Map();
  for (const r of camRows || []) {
    const id = String(r.camera_id || "");
    if (allowed.size && !allowed.has(id)) continue;
    totals.set(id, Number(r.total || 0));
  }

  const entrances = walkinEntrances();
  const list =
    entrances.length > 0
      ? entrances.map((e) => ({
          camera_id: e.cameraId,
          name: e.name,
          total: totals.get(e.cameraId) ?? 0,
        }))
      : Array.from(totals.entries()).map(([camera_id, total]) => ({
          camera_id,
          name: resolveWalkinEntranceName(camera_id),
          total,
        }));

  return list.sort((a, b) => b.total - a.total);
}

function crowdZonesWithCounts(zoneRows) {
  const allowed = allowedCrowdCameraIds();
  const byId = new Map();
  for (const r of zoneRows || []) {
    const id = String(r.camera_id || "");
    if (allowed.size && !allowed.has(id)) continue;
    byId.set(id, r);
  }

  const zones = crowdZones();
  const list =
    zones.length > 0
      ? zones.map((z) => {
          const row = byId.get(z.cameraId);
          return {
            camera_id: z.cameraId,
            name: z.name,
            alerts: Number(row?.alerts || 0),
            peakPeople: Number(row?.peakPeople || 0),
            peakOccupancy: Number(row?.peakOccupancy || 0),
          };
        })
      : Array.from(byId.values()).map((r) => ({
          camera_id: String(r.camera_id || ""),
          name: resolveCrowdZoneName(r.camera_id),
          alerts: Number(r.alerts || 0),
          peakPeople: Number(r.peakPeople || 0),
          peakOccupancy: Number(r.peakOccupancy || 0),
        }));

  return list.sort((a, b) => b.alerts - a.alerts);
}

module.exports = {
  walkinSites,
  walkinEntrances,
  crowdSites,
  crowdZones,
  walkinSiteMap,
  walkinCameraMap,
  crowdCameraMap,
  crowdSiteNamesList,
  resolveWalkinSiteName,
  resolveWalkinEntranceName,
  resolveCrowdZoneName,
  walkinCamerasWithCounts,
  crowdZonesWithCounts,
};
