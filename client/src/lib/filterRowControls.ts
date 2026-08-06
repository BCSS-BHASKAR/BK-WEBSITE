import type { SxProps, Theme } from "@mui/material";
import { jumpToTodayButtonSx } from "./jumpToTodayButton";

export const FILTER_ROW_HEIGHT = 44;

const inputRootSx = {
  height: FILTER_ROW_HEIGHT,
  minHeight: FILTER_ROW_HEIGHT,
  boxSizing: "border-box" as const,
};

export const filterRowTextFieldSlotProps = {
  fullWidth: true,
  size: "small" as const,
  sx: {
    "& .MuiInputBase-root": inputRootSx,
    "& .MuiInputBase-input": {
      py: 0,
      height: "100%",
      boxSizing: "border-box",
    },
  },
};

export const dashboardCustomDatePickerSlotProps = {
  textField: {
    fullWidth: true,
    size: "small" as const,
    sx: {
      "& .MuiInputLabel-root": {
        fontSize: "0.75rem",
      },
      "& .MuiOutlinedInput-root": {
        borderRadius: "8px",
        bgcolor: "background.paper",
        minHeight: 34,
        fontSize: "0.8125rem",
      },
      "& .MuiPickersSectionList-root": {
        fontSize: "0.8125rem",
        py: 0.2,
      },
      "& .MuiPickersSectionList-sectionContent": {
        fontSize: "0.8125rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        lineHeight: 1.2,
        minWidth: "1.35em",
      },
      "& .MuiInputBase-input": {
        fontSize: "0.8125rem",
        py: 0.45,
      },
    },
  },
};

export const filterRowButtonSx: SxProps<Theme> = {
  height: FILTER_ROW_HEIGHT,
  minHeight: FILTER_ROW_HEIGHT,
  maxHeight: FILTER_ROW_HEIGHT,
  py: 0,
  px: 1.75,
  fontSize: "0.875rem",
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

export const filterRowFormControlSx: SxProps<Theme> = {
  "& .MuiInputBase-root": inputRootSx,
  "& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    py: 0,
  },
};

export function filterRowJumpToTodaySx(alreadyToday: boolean): SxProps<Theme> {
  return {
    ...jumpToTodayButtonSx(alreadyToday),
    height: FILTER_ROW_HEIGHT,
    minHeight: FILTER_ROW_HEIGHT,
    maxHeight: FILTER_ROW_HEIGHT,
    py: 0,
    fontSize: "0.875rem",
    lineHeight: 1.2,
  };
}
