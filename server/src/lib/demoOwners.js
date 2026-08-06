const fs = require("fs");
const path = require("path");

const OWNERS_PATH = path.join(__dirname, "../data/demoOwners.json");
const PLATE_MAP_PATH = path.join(__dirname, "../data/demoPlateMap.json");
const RR_PATH = path.join(__dirname, "../data/demoRoundRobin.json");

function safeReadJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWriteJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function normalizePlate(plate) {
  return String(plate || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
}

function isResolvablePlate(plate) {
  const p = normalizePlate(plate);
  if (!p || p.length < 3) return false;
  if (p.startsWith("NOTINFER")) return false;
  const blocked = new Set(["UNKNOWN", "NA", "NONE", "UNREADABLE", "NOPLATE", "NOTINFERED", "NOTINFERRED"]);
  if (blocked.has(p)) return false;
  return true;
}

function loadOwners() {
  const data = safeReadJson(OWNERS_PATH, { owners: [] });
  const owners = Array.isArray(data.owners) ? data.owners : [];
  return owners
    .map((o) => ({
      email: String(o.email || "").trim(),
      name: o.name ? String(o.name) : null,
      phone: o.phone ? String(o.phone) : null,
      address: o.address ? String(o.address) : null,
      vehicles: Array.isArray(o.vehicles) ? o.vehicles.map(normalizePlate).filter(Boolean) : [],
    }))
    .filter((o) => o.email);
}

function buildDirectMap(owners) {
  const map = new Map();
  for (const o of owners) {
    for (const v of o.vehicles) map.set(v, o);
  }
  return map;
}

function loadPlateMap() {
  const data = safeReadJson(PLATE_MAP_PATH, { map: {} });
  const out = new Map();
  for (const [k, v] of Object.entries(data.map || {})) {
    if (k && v && typeof v === "object" && v.email) out.set(normalizePlate(k), v);
  }
  return out;
}

function savePlateMap(map) {
  const obj = { map: Object.fromEntries(map.entries()) };
  safeWriteJson(PLATE_MAP_PATH, obj);
}

function nextRoundRobinIndex(max) {
  const state = safeReadJson(RR_PATH, { idx: 0 });
  const idx = Number(state.idx || 0);
  const next = max > 0 ? ((idx % max) + 1) % max : 0;
  safeWriteJson(RR_PATH, { idx: next });
  return idx % (max || 1);
}

function resolveOwnerByPlate(plate) {
  const p = normalizePlate(plate);
  if (!isResolvablePlate(plate)) return null;

  const owners = loadOwners();
  const direct = buildDirectMap(owners);
  if (direct.has(p)) return { ...direct.get(p), plate: p, source: "direct" };

  const persisted = loadPlateMap();
  if (persisted.has(p)) {
    const row = persisted.get(p);
    return {
      email: row.email,
      name: row.name ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      vehicles: [p],
      plate: p,
      source: "persisted",
    };
  }

  if (!owners.length) return null;
  const idx = nextRoundRobinIndex(owners.length);
  const chosen = owners[idx] || owners[0];
  persisted.set(p, {
    email: chosen.email,
    name: chosen.name ?? null,
    phone: chosen.phone ?? null,
    address: chosen.address ?? null,
  });
  savePlateMap(persisted);
  return { ...chosen, vehicles: [p], plate: p, source: "round_robin" };
}

function replaceOwners(payload) {
  const owners = Array.isArray(payload?.owners) ? payload.owners : [];
  safeWriteJson(OWNERS_PATH, { owners });
  return loadOwners();
}

module.exports = {
  normalizePlate,
  isResolvablePlate,
  loadOwners,
  resolveOwnerByPlate,
  replaceOwners,
};

