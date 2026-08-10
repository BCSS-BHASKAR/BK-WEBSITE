import { useEffect, useState } from "react";
import { Box, Button, InputAdornment, MenuItem, Paper, Stack, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { contentCardSx } from "../../lib/uiSurfaces";
import { filterFieldSx } from "./monitoringTokens";
import type { InferenceModule } from "../../lib/inferenceModules";

export type MonitoringFilterState = {
  from: string;
  to: string;
  camera: string;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  minConfidence: string;
  minDwell: string;
};

export const EMPTY_FILTERS: MonitoringFilterState = {
  from: "", to: "", camera: "", search: "", sortBy: "detectedAt", sortDir: "desc",
  minConfidence: "", minDwell: "",
};


type Props = {
  module: InferenceModule;
  value: MonitoringFilterState;
  onChange: (next: MonitoringFilterState) => void;
  cameras: { camera_key: string }[];
  resultCount?: number;
  onExport?: () => void;
};

/**
 * One filter bar for every Monitoring module.
 *
 * Controls are rendered from the module's declared capabilities, so a module
 * never shows a filter its data cannot answer - confidence only appears for
 * walk-ins, minimum-duration only for loitering. There is deliberately no Site
 * control: nothing in the inference data links a detection to a site yet.
 */
export function MonitoringFilters({ module, value, onChange, cameras, resultCount, onExport }: Props) {
  // Search is debounced so a keystroke does not become a request. (ViolationsPage
  // puts the raw input straight into its query key and fires per character.)
  const [searchDraft, setSearchDraft] = useState(value.search);
  useEffect(() => setSearchDraft(value.search), [value.search]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== value.search) onChange({ ...value, search: searchDraft });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const set = (patch: Partial<MonitoringFilterState>) => onChange({ ...value, ...patch });
  const dirty =
    value.from || value.to || value.camera || value.search || value.minConfidence || value.minDwell ||
    value.sortBy !== "detectedAt" || value.sortDir !== "desc";

  const sortOptions = [
    { v: "detectedAt", label: "Detected at" },
    { v: "camera", label: "Camera" },
    ...(module.capabilities.duration ? [{ v: "duration", label: "Duration" }] : []),
    ...(module.capabilities.confidence ? [{ v: "confidence", label: "Confidence" }] : []),
  ];

  return (
    <Paper sx={{ ...contentCardSx }}>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
        <TextField
          label="From" type="date" size="small" value={value.from}
          onChange={(e) => set({ from: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }} sx={filterFieldSx}
        />
        <TextField
          label="To" type="date" size="small" value={value.to}
          onChange={(e) => set({ to: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }} sx={filterFieldSx}
        />
        <TextField
          select label="Camera" size="small" value={value.camera}
          onChange={(e) => set({ camera: e.target.value })} sx={filterFieldSx}
        >
          <MenuItem value="">All cameras</MenuItem>
          {cameras.map((c) => (
            // Camera ids can carry a trailing space; trim only for display.
            <MenuItem key={c.camera_key} value={c.camera_key}>{c.camera_key.trim()}</MenuItem>
          ))}
        </TextField>

        {module.capabilities.duration && (
          <TextField
            select label="Min duration" size="small" value={value.minDwell}
            onChange={(e) => set({ minDwell: e.target.value })} sx={filterFieldSx}
          >
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="60">Over 1 min</MenuItem>
            <MenuItem value="180">Over 3 min</MenuItem>
            <MenuItem value="300">Over 5 min</MenuItem>
            <MenuItem value="600">Over 10 min</MenuItem>
          </TextField>
        )}
        {module.capabilities.confidence && (
          <TextField
            select label="Min confidence" size="small" value={value.minConfidence}
            onChange={(e) => set({ minConfidence: e.target.value })} sx={filterFieldSx}
          >
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="0.5">50%+</MenuItem>
            <MenuItem value="0.7">70%+</MenuItem>
            <MenuItem value="0.9">90%+</MenuItem>
          </TextField>
        )}

        <TextField
          select label="Sort by" size="small" value={value.sortBy}
          onChange={(e) => set({ sortBy: e.target.value })} sx={filterFieldSx}
        >
          {sortOptions.map((o) => <MenuItem key={o.v} value={o.v}>{o.label}</MenuItem>)}
        </TextField>
        <TextField
          select label="Order" size="small" value={value.sortDir}
          onChange={(e) => set({ sortDir: e.target.value as "asc" | "desc" })}
          sx={{ width: { xs: "100%", sm: 132 } }}
        >
          <MenuItem value="desc">Newest first</MenuItem>
          <MenuItem value="asc">Oldest first</MenuItem>
        </TextField>

        <TextField
          size="small" placeholder="Search camera or event id"
          value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)}
          sx={{ width: { xs: "100%", sm: 230 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            },
          }}
        />

        <Box sx={{ flex: 1, minWidth: 8 }} />
        {typeof resultCount === "number" && (
          <Box component="span" sx={{ fontSize: 13, color: "text.secondary", whiteSpace: "nowrap" }}>
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </Box>
        )}
        {onExport && (
          <Button size="small" variant="outlined" onClick={onExport}>Export CSV</Button>
        )}
        <Button
          size="small" startIcon={<RestartAltIcon />} disabled={!dirty}
          onClick={() => onChange({ ...EMPTY_FILTERS })}
        >
          Reset
        </Button>
      </Stack>
    </Paper>
  );
}
