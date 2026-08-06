import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { SITE_TIMEZONE } from "./siteTimeZone";
import type { VehicleReportOpenParams } from "./vehicleReportNav";

dayjs.extend(utc);
dayjs.extend(timezone);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_YMD_H = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/;
const SLOT_HM = /^(\d{2}):00$/;

export type TrafficBucketPoint = {
  name: string;
  drillDay?: string;
  hourStartUnix?: number;
};

export function reportParamsFromTrafficBucket(
  pt: TrafficBucketPoint,
  range: { from: string; to: string }
): VehicleReportOpenParams {
  if (typeof pt.hourStartUnix === "number" && Number.isFinite(pt.hourStartUnix)) {
    const d = dayjs.unix(pt.hourStartUnix).tz(SITE_TIMEZONE);
    return { from: d.format("YYYY-MM-DD"), to: d.format("YYYY-MM-DD"), hour: d.hour() };
  }

  const slot = SLOT_YMD_H.exec(String(pt.name).trim());
  if (slot) {
    const end = dayjs.tz(`${slot[1]} ${slot[2]}:00:00`, "YYYY-MM-DD HH:mm:ss", SITE_TIMEZONE);
    const start = end.subtract(1, "hour");
    return { from: start.format("YYYY-MM-DD"), to: start.format("YYYY-MM-DD"), hour: start.hour() };
  }

  if (ISO_DAY.test(pt.name)) return { from: pt.name, to: pt.name };

  if (pt.drillDay && ISO_DAY.test(pt.drillDay)) {
    const hm = SLOT_HM.exec(String(pt.name).trim());
    if (hm) {
      const endHour = Number(hm[1]);
      const startHour = endHour === 24 || endHour === 0 ? 23 : endHour - 1;
      return { from: pt.drillDay, to: pt.drillDay, hour: startHour };
    }
    return { from: pt.drillDay, to: pt.drillDay };
  }

  const hm = SLOT_HM.exec(String(pt.name).trim());
  if (hm && range.from === range.to && ISO_DAY.test(range.from)) {
    const endHour = Number(hm[1]);
    const startHour = endHour === 24 || endHour === 0 ? 23 : endHour - 1;
    return { from: range.from, to: range.to, hour: startHour };
  }

  return { from: range.from, to: range.to };
}

export function reportParamsFromPeakBucket(
  peak: TrafficBucketPoint | undefined,
  range: { from: string; to: string }
): VehicleReportOpenParams {
  if (!peak) return { from: range.from, to: range.to };
  return reportParamsFromTrafficBucket(peak, range);
}
