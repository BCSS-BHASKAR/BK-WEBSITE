// Official Traffic Citation Ticket (TCT) offense list. Labels and display order
// mirror the printed TCT / UI reference. The Generate Ticket form renders these as a
// two-column checkbox grid (LEFT then RIGHT). Keep in sync with server/src/lib/tctOffenses.js.

export type TctOffense = { code: string; label: string };

export const TCT_OFFENSES_LEFT: TctOffense[] = [
  { code: "DRIVING_WITHOUT_LICENSE", label: "Driving Without License" },
  { code: "OVERLOADING", label: "Overloading" },
  { code: "OBSTRUCTION", label: "Obstruction" },
  { code: "RECKLESS_DRIVING", label: "Reckless Driving" },
  { code: "CUTTING_TRIP", label: "Cutting Trip / Refuse to Convey Passenger" },
  { code: "IMPROPER_PLATE_PLACEMENT", label: "Improper Placement of Plate" },
  { code: "DISCOURTEOUS_DRIVER", label: "Discourteous / Arrogant Driver" },
  { code: "DELINQUENT_REGISTRATION", label: "Delinquent, Suspended or Invalid Registration" },
  { code: "CR_OR_NOT_CARRIED", label: "Certificate of Registration / Official Receipt Not Carried" },
  { code: "EXPIRED_LICENSE", label: "Expired or Delinquent Driver's License" },
  { code: "DUI", label: "Driving Under the Influence of Liquor" },
  { code: "DIRTY_PLATE", label: "Dirty, Illegible or Partly Hidden Plate" },
  { code: "NO_REGULATORY_STICKER", label: "No Regulatory Sticker" },
];

export const TCT_OFFENSES_RIGHT: TctOffense[] = [
  { code: "COLORUM", label: "Colorum / No Franchise" },
  { code: "OUT_OF_LINE", label: "Out of Line" },
  { code: "ILLEGAL_PARKING", label: "Illegal Parking" },
  { code: "DISREGARD_TRAFFIC_SIGN", label: "Disregard Traffic Sign" },
  { code: "UNREGISTERED_MV", label: "Unregistered MV" },
  { code: "NO_HELMET_EO13A", label: "No Helmet / EO 13-A s'2017" },
  { code: "NO_CANVASS_COVER", label: "No Canvass Cover" },
  { code: "MO_10_12", label: "M.O. 10-12" },
  { code: "MO_27_2019", label: "M.O. 27- s'2019" },
  { code: "TRUCK_BAN", label: "Truck Ban" },
  { code: "IMPROPER_HORN_SIREN", label: "Improper Horn, Unauthorized Bell or Siren (M.O. 01 s'2018)" },
  { code: "MO_95_17", label: "MO 95-17 (RA 4136)" },
  { code: "DEFECTIVE_LIGHTS", label: "Defective Headlights, Taillights, Stop Lights (M.O. 14-02)" },
  { code: "OTHERS", label: "Others (Specify)" },
];

export const TCT_OFFENSES: TctOffense[] = [...TCT_OFFENSES_LEFT, ...TCT_OFFENSES_RIGHT];

export const OTHERS_CODE = "OTHERS";

const LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  TCT_OFFENSES.map((o) => [o.code, o.label])
);

export function offenseLabel(code: string): string {
  return LABEL_BY_CODE[code] ?? code;
}
