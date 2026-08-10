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

/**
 * Thumbnail cell geometry.
 *
 * `contain`, not `cover`. The frames are 16:9 and the cell is 7:5, so cover was
 * cropping roughly a fifth off each side - which on a detection thumbnail is
 * exactly where the subject entering or leaving the scene tends to be. The dark
 * plate behind it letterboxes the difference instead of hiding it, and the cell
 * is a little wider now so the whole frame still reads at this size.
 *
 * The dimensions are exported because every call site wraps the image in a
 * positioned Box of the same size to hang a play badge on. Those wrappers were
 * hardcoded to the old 56x40 and would have cropped the image right back after
 * this change.
 */
export const THUMB_W = 72;
export const THUMB_H = 44;

export const thumbSx: SxProps<Theme> = {
  width: THUMB_W,
  height: THUMB_H,
  borderRadius: "6px",
  objectFit: "contain",
  bgcolor: "rgba(15, 23, 42, 0.72)",
  display: "block",
};

/** Filter control width, matching the report pages' copy-pasted filterFieldSx. */
export const filterFieldSx = { width: { xs: "100%", sm: 176 } } as const;
