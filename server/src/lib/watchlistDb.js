

function parseJson(raw, fallback = null) {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "object") return raw;
  try {
    let v = JSON.parse(raw);
    if (typeof v === "string") v = JSON.parse(v);
    return v;
  } catch {
    return fallback;
  }
}

function parseConditions(raw) {
  const v = parseJson(raw, []);
  return Array.isArray(v) ? v : [];
}

function buildConditions(rows) {
  const conditions = [];
  for (const row of rows || []) {
    const attr = row.attr || row.rules_attr || "lp";
    if (!attr || attr === "_cameras") continue;
    const block = {};
    if (attr === "lp") {
      const op = row.lpOp || row.rules_name || "eq";
      const val = String(row.value ?? row.rule_value ?? "").trim();
      if (val) block.lp = { [op]: val };
    } else if (attr === "make" || attr === "colour") {
      const val = String(row.value ?? row.rule_value ?? "").trim();
      if (val) block[attr] = { eq: val };
    } else if (attr === "vehicle_category") {
      const val = String(row.category ?? row.vehicle_category ?? row.value ?? "").trim();
      if (val) block.vehicle_category = { eq: val };
    }
    if (Object.keys(block).length) conditions.push(block);
  }
  return conditions;
}

function extractCameraIds(raw) {
  for (const block of parseConditions(raw)) {
    if (block._cameras && Array.isArray(block._cameras.ids)) {
      return block._cameras.ids.map(String);
    }
  }
  return [];
}

function buildRuleConditions(conditionRows, cameraIds) {
  const built = buildConditions(conditionRows);
  const ids = (cameraIds || []).map(String).filter(Boolean);
  if (!ids.length) return built;
  return [{ _cameras: { ids } }, ...built];
}

function conditionBlocksWithoutMeta(raw) {
  return parseConditions(raw).filter((b) => !b._cameras);
}

function summarizeConditions(raw) {
  const parts = [];
  const cams = extractCameraIds(raw);
  if (cams.length) parts.push(`Cameras: ${cams.join(", ")}`);
  for (const block of conditionBlocksWithoutMeta(raw)) {
    if (block.lp) {
      const [op, val] = Object.entries(block.lp)[0] || [];
      parts.push(`Plate ${op}: ${val}`);
    }
    if (block.make) parts.push(`Make: ${block.make.eq}`);
    if (block.colour) parts.push(`Colour: ${block.colour.eq}`);
    if (block.vehicle_category) parts.push(`Category: ${block.vehicle_category.eq}`);
  }
  return parts.join(" · ") || "—";
}

function extractPlateMatchers(raw, cameraIds = null) {
  const matchers = [];
  const scope = cameraIds ?? extractCameraIds(raw);
  for (const block of conditionBlocksWithoutMeta(raw)) {
    if (!block.lp) continue;
    const [op, val] = Object.entries(block.lp)[0] || [];
    if (!val) continue;
    matchers.push({
      op: op || "eq",
      value: String(val).trim().toUpperCase(),
      cameraIds: scope.length ? scope : null,
    });
  }
  return matchers;
}

function plateMatches(vehicleNum, matchers, cameraId = null) {
  const plate = String(vehicleNum ?? "").trim().toUpperCase();
  if (!plate || !matchers.length) return false;
  return matchers.some((m) => {
    if (m.cameraIds?.length && cameraId != null) {
      const cid = String(cameraId);
      if (!m.cameraIds.some((c) => String(c) === cid)) return false;
    }
    const v = m.value;
    switch (m.op) {
      case "contains":
        return plate.includes(v);
      case "startswith":
        return plate.startsWith(v);
      case "endswith":
        return plate.endsWith(v);
      case "eq":
      default:
        return plate === v;
    }
  });
}

// Callers pass either a Map or the plain object returned by loadMergedCameraMap().
function lookupCameraName(cameraNameMap, id) {
  if (!cameraNameMap) return id;
  const key = String(id);
  if (typeof cameraNameMap.get === "function") {
    return cameraNameMap.get(id) ?? cameraNameMap.get(key) ?? id;
  }
  return cameraNameMap[id] ?? cameraNameMap[key] ?? id;
}

function mapRuleRow(r, siteName, cameraNameMap = null) {
  const listIds = parseJson(r.vehicleListIds, []);
  const listName = Array.isArray(listIds) && listIds.length ? listIds[0] : null;
  const cameraIds = extractCameraIds(r.conditions);
  const cameraNames = cameraIds.map((id) => lookupCameraName(cameraNameMap, id));
  return {
    id: r.id,
    enabled: Boolean(r.enabled),
    name: r.name,
    filterType: r.filterType,
    vehicleListIds: listIds,
    vehicleListName: listName,
    siteId: r.site_id,
    siteName: siteName ?? null,
    cameraIds,
    cameraNames,
    notes: r.notes ?? "",
    accessType: r.access_type,
    securityType: r.security_type,
    priority: r.priority,
    conditions: parseConditions(r.conditions),
    conditionsSummary: summarizeConditions(r.conditions),
    validFrom: r.valid_from,
    validTo: r.valid_to,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function tableExists(pool, name) {
  const [[row]] = await pool.query("SHOW TABLES LIKE ?", [name]);
  return Boolean(row);
}

async function loadSites(pool) {
  if (!(await tableExists(pool, "sites"))) return [{ id: 1, name: "Default site" }];
  const [rows] = await pool.query("SELECT id, name FROM sites ORDER BY name ASC");
  return rows.length ? rows : [{ id: 1, name: "Default site" }];
}

async function siteNameMap(pool) {
  const sites = await loadSites(pool);
  return new Map(sites.map((s) => [s.id, s.name]));
}

async function loadWatchPlateMatchers(pool) {
  const matchers = [];
  const listNames = new Map();

  if (await tableExists(pool, "lpr_vehicle_list_vehicles")) {
    const [vehRows] = await pool.query(
      `SELECT v.id, v.vehicle_list_id, v.conditions, l.name AS list_name, l.enabled
       FROM lpr_vehicle_list_vehicles v
       LEFT JOIN lpr_vehicle_lists l ON l.id = v.vehicle_list_id`
    );
    for (const row of vehRows) {
      if (row.enabled === 0) continue;
      const m = extractPlateMatchers(row.conditions);
      for (const x of m) {
        matchers.push({ ...x, listId: row.vehicle_list_id, listName: row.list_name || "Watchlist" });
      }
      if (row.list_name) listNames.set(row.vehicle_list_id, row.list_name);
    }
  }

  if (await tableExists(pool, "lpr_rules")) {
    const [rules] = await pool.query(`SELECT * FROM lpr_rules WHERE enabled = 1`);
    for (const rule of rules) {
      if (rule.filterType === "plate") {
        const m = extractPlateMatchers(rule.conditions);
        for (const x of m) matchers.push({ ...x, ruleId: rule.id, ruleName: rule.name });
      } else if (rule.filterType === "vehicleList") {
        const names = parseJson(rule.vehicleListIds, []);
        if (names.length && (await tableExists(pool, "lpr_vehicle_lists"))) {
          const [lists] = await pool.query(`SELECT id, name FROM lpr_vehicle_lists WHERE name IN (?)`, [names]);
          for (const list of lists) {
            const [vehRows] = await pool.query(
              `SELECT conditions FROM lpr_vehicle_list_vehicles WHERE vehicle_list_id = ?`,
              [list.id]
            );
            for (const v of vehRows) {
              const m = extractPlateMatchers(v.conditions);
              for (const x of m) {
                matchers.push({ ...x, listId: list.id, listName: list.name, ruleId: rule.id, ruleName: rule.name });
              }
            }
          }
        }
      }
    }
  }

  return { matchers, listNames };
}

module.exports = {
  parseJson,
  parseConditions,
  buildConditions,
  buildRuleConditions,
  extractCameraIds,
  conditionBlocksWithoutMeta,
  summarizeConditions,
  extractPlateMatchers,
  plateMatches,
  mapRuleRow,
  tableExists,
  loadSites,
  siteNameMap,
  loadWatchPlateMatchers,
};
