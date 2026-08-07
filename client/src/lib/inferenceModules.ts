// Single registry of the five Monitoring inference types.
//
// Before this, the type list existed three times in incompatible forms:
// CROWD_ALERT_TYPE_META (wrong five members - it describes crowds.alert_type),
// a local SERVICES array inside InferenceViewerPage, and ad-hoc strings in the
// dashboard. Everything Monitoring-related now reads from here so a label,
// colour or route is changed in exactly one place.
//
// `capabilities` is the important part: it records which fields a module's data
// ACTUALLY carries. The Monitoring template uses it to decide which KPI tiles,
// filters and table columns to render, so no module ever shows a column that
// its detector cannot populate.

export type InferenceModuleKey =
  | "walkins"
  | "loitering"
  | "intrusion"
  | "after_hours"
  | "kitchen_unattended"
  | "chef_absence";

export type ModuleCapabilities = {
  /** Detections carry a numeric confidence (only walk-ins do today). */
  confidence: boolean;
  /** Detections have a measured duration (only loitering does today). */
  duration: boolean;
  /** Evidence is video rather than a still. */
  video: boolean;
  /** Re-identification global id / session tag is present. */
  identity: boolean;
  /** Clothing colour + garment classification is present. */
  appearance: boolean;
};

export type InferenceModule = {
  key: InferenceModuleKey;
  label: string;
  /** Header subtitle on the Monitoring page. */
  blurb: string;
  /** Singular noun for one detection, used in tables and empty states. */
  eventNoun: string;
  route: string;
  /** Validated categorical hue - assigned by identity, never by rank. */
  colour: string;
  /** REST path segment under /api/inference. */
  endpoint: string;
  capabilities: ModuleCapabilities;
};

export const INFERENCE_MODULES: InferenceModule[] = [
  {
    key: "walkins",
    label: "Walk-ins",
    blurb: "Monitor all walk-in detections across connected cameras.",
    eventNoun: "Walk-in",
    route: "/monitoring/walkins",
    colour: "#2a78d6",
    endpoint: "walkins",
    capabilities: { confidence: true, duration: false, video: false, identity: false, appearance: true },
  },
  {
    key: "loitering",
    label: "Loitering",
    blurb: "Review people who lingered past the configured dwell threshold.",
    eventNoun: "Loitering event",
    route: "/monitoring/loitering",
    colour: "#eb6834",
    endpoint: "loitering",
    capabilities: { confidence: false, duration: true, video: true, identity: true, appearance: false },
  },
  {
    key: "intrusion",
    label: "Intrusion",
    blurb: "Track tripwire crossings into restricted areas.",
    eventNoun: "Intrusion",
    route: "/monitoring/intrusion",
    colour: "#1baf7a",
    endpoint: "intrusion",
    capabilities: { confidence: false, duration: false, video: false, identity: false, appearance: false },
  },
  {
    key: "after_hours",
    label: "After Hours",
    blurb: "Presence detected outside business hours.",
    eventNoun: "After-hours sighting",
    route: "/monitoring/after-hours",
    colour: "#eda100",
    endpoint: "after-hours",
    capabilities: { confidence: false, duration: false, video: false, identity: true, appearance: false },
  },
  {
    key: "kitchen_unattended",
    label: "Kitchen Unattended",
    blurb: "Periods where the cameras found no staff in the kitchen.",
    eventNoun: "Unattended period",
    route: "/monitoring/kitchen-unattended",
    colour: "#4a3aa7",
    endpoint: "kitchen-unattended",
    capabilities: { confidence: false, duration: true, video: false, identity: false, appearance: false },
  },
  {
    key: "chef_absence",
    label: "Chef Absence",
    blurb: "Cooking-station coverage, kitchen entries and uniform compliance.",
    eventNoun: "Absence incident",
    route: "/monitoring/chef-absence",
    // Sixth categorical slot. Checked with the palette validator against the
    // five hues above: passes lightness, chroma, CVD separation and the
    // normal-vision floor (its worst adjacent pair is 21.7 normal / 9.1 protan).
    colour: "#c2408c",
    endpoint: "chef-absence",
    // duration is FALSE on purpose. Clips carry a length, but it measures the
    // recording, not how long the kitchen was unattended - 150 of 151 clips are
    // shorter than the 60 s the detector is documented to require. Declaring it
    // here would put a "Longest / Average duration" tile on the page built on a
    // number that does not mean what it says.
    capabilities: { confidence: true, duration: false, video: true, identity: false, appearance: true },
  },
];

export const MODULE_BY_KEY: Record<InferenceModuleKey, InferenceModule> =
  Object.fromEntries(INFERENCE_MODULES.map((m) => [m.key, m])) as Record<
    InferenceModuleKey,
    InferenceModule
  >;

export function moduleByRouteSlug(slug: string): InferenceModule | undefined {
  return INFERENCE_MODULES.find((m) => m.route.endsWith(`/${slug}`));
}

/** Backend module key used by the feedback API (underscored, not the URL slug). */
export function apiModuleKey(m: InferenceModule): string {
  return m.key;
}
