import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import { PageBanner } from "./PageBanner";
import { SITE_LABELS } from "../i18n/lang";

export function DashboardHero() {
  return (
    <PageBanner
      title={SITE_LABELS.operationalDashboards}
      subtitle={SITE_LABELS.operationalDashboardsSubtitle}
      icon={<DashboardRoundedIcon sx={{ fontSize: { xs: 28, sm: 32 } }} />}
    />
  );
}
