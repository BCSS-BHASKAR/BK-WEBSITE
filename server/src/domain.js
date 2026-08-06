const { getCameraMap } = require("./cameras");
const CAMERA_MAP = getCameraMap();

const VEHICLE_CLASS = {
  1: "CAR_FRONT",
  2: "CAR_BACK",
  3: "TRUCK_FRONT",
  4: "TRUCK_BACK",
  5: "BIKE_FRONT",
  6: "BIKE_BACK",
  7: "MINITRUCK_FRONT",
  8: "MINITRUCK_BACK",
  9: "BUS_FRONT",
  10: "BUS_BACK",
  11: "TUKTUK_FRONT",
  12: "TUKTUK_BACK",
};

const VEHICLE_TYPE_TO_CLASSES = {
  CAR: [1, 2],
  TRUCK: [3, 4],
  BIKE: [5, 6],
  MINITRUCK: [7, 8],
  BUS: [9, 10],
  AUTO: [11, 12],
};

const DIRECTION_TO_CLASSES = {
  IN: [1, 3, 5, 7, 9, 11],
  OUT: [2, 4, 6, 8, 10, 12],
};

function vehicleCategoryToType(cat) {
  const name = VEHICLE_CLASS[Number(cat)] || "";
  return name ? name.split("_")[0] : "";
}

module.exports = {
  CAMERA_MAP,
  VEHICLE_CLASS,
  VEHICLE_TYPE_TO_CLASSES,
  DIRECTION_TO_CLASSES,
  vehicleCategoryToType,
};
