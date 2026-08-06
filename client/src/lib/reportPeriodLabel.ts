import { formatChartDayTick } from "./siteTimeZone";
import { formatRangeTitle } from "./dashboardRange";

export function formatReportPeriodLabel(from: string, to: string): string {
  const title = formatRangeTitle(from, to);
  if (from === to) return `${title} (${formatChartDayTick(from)})`;
  return `${title} (${formatChartDayTick(from)} – ${formatChartDayTick(to)})`;
}
