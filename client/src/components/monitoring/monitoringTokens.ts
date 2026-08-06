import type { SxProps, Theme } from "@mui/material";

// Table style tokens, lifted verbatim from the four *EventsListView components
// where they were duplicated BYTE-IDENTICALLY as module-private consts
// (WalkinsEventsListView, CrowdsEventsListView, VehicleEventsListView,
// ViolationEventsListView). Values are unchanged, so every table in the app
// still looks exactly as it does today - they are simply defined once now.

export const tableHeadSx: SxProps<Theme> = {
  fontWeight: 800,
  fontSize: "0.6875rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "text.secondary",
  bgcolor: "rgba(15, 23, 42, 0.03)",
  borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
  py: 1.1,
};

export const tableCellSx: SxProps<Theme> = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
  py: 1.15,
};

/** Thumbnail cell geometry, matching the 56x40 crop used by the existing tables. */
export const thumbSx: SxProps<Theme> = {
  width: 56,
  height: 40,
  borderRadius: "6px",
  objectFit: "cover",
  bgcolor: "rgba(15, 23, 42, 0.06)",
  display: "block",
};

/** Filter control width, matching the report pages' copy-pasted filterFieldSx. */
export const filterFieldSx = { width: { xs: "100%", sm: 176 } } as const;
