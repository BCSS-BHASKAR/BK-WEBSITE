
export function normalizePlateKey(plate: string) {
  return String(plate || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
}

const BLOCKED = new Set(["UNKNOWN", "NA", "NONE", "UNREADABLE", "NOPLATE", "NOTINFERED", "NOTINFERRED"]);

export function isConfirmedPlate(plate: string) {
  const p = normalizePlateKey(plate);
  if (!p || p.length < 3) return false;
  if (BLOCKED.has(p)) return false;
  if (p.startsWith("NOTINFER")) return false;
  return true;
}
