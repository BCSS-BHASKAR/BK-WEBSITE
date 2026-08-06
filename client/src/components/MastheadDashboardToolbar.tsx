import { Box } from "@mui/material";
import { ManilaSiteClock } from "./ManilaSiteClock";
import { DateRangePopoverTrigger } from "./DateRangePopoverTrigger";
import type { DatePreset } from "../lib/dashboardRange";

type Props = {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  resolvedFrom: string | null;
  resolvedTo: string | null;
  onResetToToday: () => void;
  emptyRangeLabel?: string;
};

export function MastheadDashboardToolbar(props: Props) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexShrink: 0,
        flexWrap: "nowrap",
        minWidth: 0,
      }}
    >
      <ManilaSiteClock compact />
      <DateRangePopoverTrigger compact {...props} />
    </Box>
  );
}
