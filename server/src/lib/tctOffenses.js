const TCT_OFFENSES_LEFT = [
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

const TCT_OFFENSES_RIGHT = [
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

const TCT_OFFENSES = [...TCT_OFFENSES_LEFT, ...TCT_OFFENSES_RIGHT];

const LABEL_BY_CODE = Object.fromEntries(TCT_OFFENSES.map((o) => [o.code, o.label]));
const VALID_CODES = new Set(TCT_OFFENSES.map((o) => o.code));

function sanitizeOffenseCodes(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  for (const raw of input) {
    const code = String(raw || "").trim().toUpperCase();
    if (VALID_CODES.has(code)) seen.add(code);
  }
  return TCT_OFFENSES.map((o) => o.code).filter((c) => seen.has(c));
}

function offenseLabel(code) {
  return LABEL_BY_CODE[code] || String(code || "");
}

function labelsFor(codes) {
  return (Array.isArray(codes) ? codes : []).map(offenseLabel);
}

module.exports = { TCT_OFFENSES, TCT_OFFENSES_LEFT, TCT_OFFENSES_RIGHT, sanitizeOffenseCodes, offenseLabel, labelsFor };
