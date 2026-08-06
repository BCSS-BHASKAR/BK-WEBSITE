import { ymdSite, ymdSiteYesterday } from "./siteTimeZone";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatChatDateLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return ymd;

  const today = ymdSite();
  const yesterday = ymdSiteYesterday();
  if (ymd === today) return "today";
  if (ymd === yesterday) return "yesterday";

  const day = Number(m[3]);
  const monthIdx = Number(m[2]) - 1;
  const month = monthIdx >= 0 && monthIdx < 12 ? MONTH_SHORT[monthIdx] : m[2];
  const year = Number(m[1]);
  return `${day} ${month} ${year}`;
}

export function formatChatDateRange(from: string, to: string): string {
  if (from === to) return formatChatDateLabel(from);
  return `${formatChatDateLabel(from)} – ${formatChatDateLabel(to)}`;
}
