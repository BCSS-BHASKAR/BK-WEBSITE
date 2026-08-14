const { execFileSync } = require("child_process");
const path = require("path");

const SQLITE_PATH =
  process.env.WALKING_SQLITE_PATH || "/opt/gstream-data/walking/results/metadata.sqlite";
const LOOKUP_SCRIPT = path.join(__dirname, "walkinFrameLookup.py");

function parseWalkinDetectionId(imagePath) {
  const base = String(imagePath || "")
    .split("/")
    .pop();
  const match = base.match(/_(\d+)\.(jpe?g|png)$/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function lookupFramePaths(detIds) {
  const unique = [...new Set(detIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) return new Map();

  try {
    const raw = execFileSync("python3", [LOOKUP_SCRIPT, SQLITE_PATH, JSON.stringify(unique)], {
      encoding: "utf8",
      timeout: 8000,
    });
    const parsed = JSON.parse(String(raw || "{}").trim() || "{}");
    return new Map(
      Object.entries(parsed).map(([id, framePath]) => [Number(id), String(framePath || "")])
    );
  } catch {
    return new Map();
  }
}

function attachWalkinFramePaths(rows) {
  const detIds = rows.map((row) => parseWalkinDetectionId(row.image_path));
  const frameMap = lookupFramePaths(detIds.filter(Boolean));

  return rows.map((row, index) => {
    const detId = detIds[index];
    const framePath = detId != null ? frameMap.get(detId) || "" : "";
    return { ...row, frame_path: framePath };
  });
}

module.exports = {
  parseWalkinDetectionId,
  lookupFramePaths,
  attachWalkinFramePaths,
};
