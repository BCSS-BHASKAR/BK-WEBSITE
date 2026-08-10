import { useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";
import { BkDashboardView } from "../components/dashboard/bk/BkDashboardView";
import { MastheadDashboardToolbar } from "../components/MastheadDashboardToolbar";
import { useShellHeader } from "../context/ShellHeaderContext";
import { pageLayoutSx } from "../lib/uiSurfaces";
import {
  type DatePreset, datedRangeFromPreset, defaultLast7Range, normalizeCustomRange,
} from "../lib/dashboardRange";

// The dashboard is an analytical view over what the on-prem CV services
// actually capture (walk-ins, loitering, intrusion, after-hours), read from the
// inference tables.
//
// The body is BkDashboardView, built to the Biryani Katha green design: KPI row,
// walk-ins trend beside the live camera wall, three detail panels, the fleet
// health bar and the value-props strip. It replaced InferenceAnalyticsView,
// which is left in the tree unreferenced - as DashboardOperationalView already
// was - because it still holds the per-service small multiples and the
// upper-garment colour chart that the new design has no slot for.

// The page opens directly on the KPI row. The in-page "Operations Analytics"
// heading, the intro paragraph, the ingest-status line and the auto-refresh
// chip were all removed: the shell header already names and describes this
// section, so the heading was a second, conflicting title block, and the other
// two restated a Settings value and a pipeline detail rather than anything an
// operator acts on.

export function DashboardPage() {
  const { setRightSlot } = useShellHeader();

  // Date range lives here and drives every query below, restoring the masthead
  // range control the operational dashboard used to carry.
  const [preset, setPreset] = useState<DatePreset>("last7");
  const initial = defaultLast7Range();
  const [customFrom, setCustomFrom] = useState(initial.from);
  const [customTo, setCustomTo] = useState(initial.to);

  const { from, to } = useMemo(() => {
    if (preset === "custom") return normalizeCustomRange(customFrom, customTo);
    return datedRangeFromPreset(preset, customFrom, customTo);
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    setRightSlot(
      <MastheadDashboardToolbar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        resolvedFrom={from}
        resolvedTo={to}
        onResetToToday={() => {
          const d = defaultLast7Range();
          setPreset("last7");
          setCustomFrom(d.from);
          setCustomTo(d.to);
        }}
      />
    );
    return () => setRightSlot(null);
  }, [setRightSlot, preset, customFrom, customTo, from, to]);

  return (
    <Box sx={pageLayoutSx}>
      <BkDashboardView from={from} to={to} />
    </Box>
  );
}
