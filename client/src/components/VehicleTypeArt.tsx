import { useId } from "react";
import { Box } from "@mui/material";
import {
  AutoArt,
  BikeArt,
  BusArt,
  CarArt,
  DefaultVehicleArt,
  MintruckArt,
  TruckArt,
} from "./vehicleTypeIllustrations";

const TILE_THEMES: Record<
  string,
  { accent: string }
> = {
  CAR: { accent: "#2563EB" },
  TRUCK: { accent: "#EA580C" },
  BIKE: { accent: "#16A34A" },
  MINITRUCK: { accent: "#7C3AED" },
  BUS: { accent: "#CA8A04" },
  AUTO: { accent: "#0F766E" },
};

const DEFAULT_THEME = {
  accent: "#475569",
};

function artFor(type: string, size: number, svgId: string) {
  const t = type.toUpperCase();
  switch (t) {
    case "CAR":
      return <CarArt size={size} id={svgId} />;
    case "TRUCK":
      return <TruckArt size={size} id={svgId} />;
    case "BIKE":
      return <BikeArt size={size} id={svgId} />;
    case "MINITRUCK":
      return <MintruckArt size={size} id={svgId} />;
    case "BUS":
      return <BusArt size={size} id={svgId} />;
    case "AUTO":
      return <AutoArt size={size} id={svgId} />;
    default:
      return <DefaultVehicleArt size={size} id={svgId} />;
  }
}

export function VehicleTypeArt({ type, variant }: { type: string; variant: "hero" }) {
  const key = type.toUpperCase();
  const theme = TILE_THEMES[key] ?? DEFAULT_THEME;
  const svgId = useId().replace(/:/g, "");
  const size = variant === "hero" ? 58 : 44;
  const box = variant === "hero" ? 72 : 52;

  return (
    <Box
      sx={{
        width: box,
        height: box,
        borderRadius: 2.5,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        bgcolor: "#F1F5F9",
        border: "1px solid rgba(15,23,42,0.10)",
        color: "#0F172A",
        boxShadow: "inset 0 -3px 0 rgba(15,23,42,0.04)",
        transition: "border-color 160ms ease, background-color 160ms ease, transform 160ms ease",
        position: "relative",
        overflow: "hidden",
        "&::after": {
          content: '""',
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          bgcolor: theme.accent,
        },
        ".MuiButtonBase-root:hover &": {
          bgcolor: "#E2E8F0",
          borderColor: "rgba(15,23,42,0.18)",
          transform: "translateY(-1px)",
        },
      }}
    >
      {artFor(key, size, svgId)}
    </Box>
  );
}
