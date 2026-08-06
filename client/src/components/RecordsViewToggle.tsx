import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";

export type RecordsViewMode = "grid" | "list";

type Props = {
  value: RecordsViewMode;
  onChange: (mode: RecordsViewMode) => void;
};

export function RecordsViewToggle({ value, onChange }: Props) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_, v: RecordsViewMode | null) => {
        if (v) onChange(v);
      }}
      aria-label="Records layout"
      sx={{
        flexShrink: 0,
        "& .MuiToggleButton-root": {
          px: 1.25,
          py: 0.65,
          borderColor: "rgba(15, 23, 42, 0.12)",
          textTransform: "none",
          fontWeight: 700,
          fontSize: "0.75rem",
        },
      }}
    >
      <ToggleButton value="grid" aria-label="Grid view">
        <Tooltip title="Grid view">
          <GridViewRoundedIcon sx={{ fontSize: 18 }} />
        </Tooltip>
      </ToggleButton>
      <ToggleButton value="list" aria-label="List view">
        <Tooltip title="List view">
          <ViewListRoundedIcon sx={{ fontSize: 18 }} />
        </Tooltip>
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
