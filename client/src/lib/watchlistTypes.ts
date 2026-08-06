export type WatchSite = { id: number; name: string };

export type ConditionRow = {
  attr: "lp" | "make" | "colour" | "vehicle_category";
  lpOp?: "eq" | "contains" | "startswith" | "endswith";
  value?: string;
  category?: string;
};

export type WatchRule = {
  id: number;
  enabled: boolean;
  name: string;
  filterType: "plate" | "vehicleList";
  vehicleListIds: string[];
  vehicleListName: string | null;
  siteId: number;
  siteName: string | null;
  cameraIds: string[];
  cameraNames: string[];
  notes: string;
  accessType: string;
  securityType: string;
  conditions: unknown[];
  conditionsSummary: string;
  validFrom: string | null;
  validTo: string | null;
};

export type VehicleListRow = {
  id: number;
  name: string;
  enabled: boolean;
  siteId: number;
  siteName: string | null;
  notes: string | null;
  entryCount: number;
};

export type ListEntry = {
  id: number;
  vehicleListId: number;
  conditions: ConditionRow[];
  summary: string;
};

export type WatchHit = {
  id: string | number;
  source: "trigger" | "anpr";
  plate: string;
  ruleName: string | null;
  listName: string;
  accessType: string | null;
  securityType: string | null;
  siteName: string | null;
  camera: string | null;
  cameraId?: string;
  createdAt: string;
};
