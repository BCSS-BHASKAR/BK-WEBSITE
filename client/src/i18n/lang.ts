import langJson from "../../../config/en.lang.json";
import { SITE_CONFIG } from "../config/siteConfig";

export type SiteBranding = typeof langJson.branding;
export type SiteLabels = typeof langJson.labels;

export const LANG = langJson;

export const SITE_BRANDING = LANG.branding;
export const SITE_LABELS = LANG.labels;

export function siteRegionChipLabel(): string {
  const { display } = SITE_CONFIG.timezone;
  const region = SITE_CONFIG.region.label;
  const tzShort = display.iana.includes("/") ? display.iana.split("/").pop()! : display.iana;
  return `${region} · ${tzShort}`;
}

export function formatLang(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    template
  );
}
