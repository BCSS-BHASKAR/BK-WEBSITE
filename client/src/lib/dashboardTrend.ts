
export function formatTrendHint(current: number, previous: number, label = "vs yesterday"): string | undefined {
  if (previous <= 0 && current <= 0) return undefined;
  if (previous <= 0) return `↑ new · ${label}`;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `No change · ${label}`;
  const arrow = pct > 0 ? "↑" : "↓";
  const signed = pct > 0 ? `+${pct}` : `${pct}`;
  return `${arrow} ${signed}% · ${label}`;
}
