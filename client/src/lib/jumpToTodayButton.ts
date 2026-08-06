import type { SxProps, Theme } from "@mui/material";

export function jumpToTodayButtonSx(alreadyToday: boolean): SxProps<Theme> {
  return {
    borderRadius: "10px",
    fontWeight: 800,
    textTransform: "none",
    minHeight: 48,
    boxShadow: alreadyToday ? "none" : "0 10px 22px rgba(37, 99, 235, 0.22)",
    background: alreadyToday
      ? undefined
      : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 48%, #1e40af 100%)",
    "&:hover": {
      boxShadow: alreadyToday ? "none" : "0 12px 26px rgba(37, 99, 235, 0.28)",
      background: alreadyToday
        ? undefined
        : "linear-gradient(135deg, #1d4ed8 0%, #1e40af 52%, #172554 100%)",
    },
    "&.Mui-disabled": {
      bgcolor: "rgba(15, 23, 42, 0.06)",
      color: "text.disabled",
      boxShadow: "none",
      backgroundImage: "none",
    },
  };
}
