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
  // Under `table-layout: fixed` a long header word would otherwise push its
  // column off the grid the body cells sit on.
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
  verticalAlign: "middle" as const,
};

export const tableCellSx: SxProps<Theme> = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
  py: 1.15,
  // Values that outrun their column are clipped, not allowed to widen it. Cells
  // that want to wrap (the timestamp) override whiteSpace on their own content.
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
  verticalAlign: "middle" as const,
};

/** Inline text that should ellipsize inside its cell instead of overflowing. */
export const ellipsisSx = {
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
} as const;

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
