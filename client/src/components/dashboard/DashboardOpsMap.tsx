import { Box } from "@mui/material";
import { DashboardPanel } from "./DashboardPanel";
import { RodriguezOperationsMap } from "../maps/RodriguezOperationsMap";
import type { CameraViolationRow } from "../../lib/opsMapViolations";

type Props = {
  violationsByCamera?: CameraViolationRow[];
};

export function DashboardOpsMap({ violationsByCamera = [] }: Props) {
  return (
    <DashboardPanel dark title="Live Operations Map" subtitle="Rodriguez, Rizal" minHeight={340} sx={{ p: 2 }}>
      <Box sx={{ flex: 1, minHeight: 300, mt: 0.5, minWidth: 0 }}>
        <RodriguezOperationsMap minHeight={300} violationsByCamera={violationsByCamera} />
      </Box>
    </DashboardPanel>
  );
}
