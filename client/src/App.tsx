import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { AppShell } from "./components/AppShell";
import { ProtectedLayout } from "./components/ProtectedLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { VehicleReportPage } from "./pages/VehicleReportPage";
import { ActiveAlertsPage } from "./pages/ActiveAlertsPage";
import { ViolationsPage } from "./pages/ViolationsPage";
import { LiveViewPage } from "./pages/LiveViewPage";
import { LoginPage } from "./pages/LoginPage";
import { WatchlistsPage } from "./pages/WatchlistsPage";
import { ChatAssistantPage } from "./pages/ChatAssistantPage";
import { AssistantEnhancePage } from "./pages/AssistantEnhancePage";
import { AssistantEnhanceDebugPage } from "./pages/AssistantEnhanceDebugPage";
import { ChallanEmailPage } from "./pages/ChallanEmailPage";
import { ChallanHistoryPage } from "./pages/ChallanHistoryPage";
import { VehicleJourneyPage } from "./pages/VehicleJourneyPage";
import { KnownFacesPage } from "./pages/KnownFacesPage";
import { DailyBriefingPage } from "./pages/DailyBriefingPage";
import { InferenceViewerPage } from "./pages/InferenceViewerPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { ChefAbsencePage } from "./pages/ChefAbsencePage";
import { SettingsPage } from "./pages/SettingsPage";
import { PermissionsProvider, RequirePage } from "./lib/permissions";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<PermissionsProvider><ProtectedLayout /></PermissionsProvider>}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<RequirePage page="dashboard" label="the Dashboard"><DashboardPage /></RequirePage>} />
          <Route path="/vehicle-report" element={<VehicleReportPage />} />
          {/* Active Alerts now reads the live inference data. The previous
              page queried the legacy crowds table, which has no writer. */}
          <Route path="/crowds-report" element={<RequirePage page="active_alerts" label="Active Alerts"><ActiveAlertsPage /></RequirePage>} />
          <Route path="/active-alerts" element={<Navigate to="/crowds-report" replace />} />
          <Route path="/vehicle-journey" element={<VehicleJourneyPage />} />
          <Route path="/violations" element={<ViolationsPage />} />
          <Route path="/violation" element={<ViolationsPage />} />
          <Route path="/live-view" element={<RequirePage page="cameras_online" label="Cameras Online"><LiveViewPage /></RequirePage>} />
          {/* Kitchen Unattended reports kitchen staffing records. The plate-rule
              editor it replaced is still reachable at /watchlists/rules. */}
          <Route path="/watchlists/rules" element={<WatchlistsPage />} />
          <Route path="/known-faces" element={<RequirePage page="known_faces" label="Known Faces"><KnownFacesPage /></RequirePage>} />
          {/* One template, five modules - resolved from the :module slug. */}
          {/* Chef Absence reports on station coverage and uniform compliance
              rather than listing detections, so it has its own page instead of
              the shared Monitoring template. Declared before the :module route
              for clarity; the static segment wins regardless. */}
          <Route path="/monitoring/chef-absence" element={<ChefAbsencePage />} />
          <Route path="/monitoring/:module" element={<MonitoringPage />} />
          <Route path="/monitoring" element={<Navigate to="/monitoring/walkins" replace />} />
          <Route path="/settings" element={<RequirePage page="settings" label="Settings"><SettingsPage /></RequirePage>} />
          <Route path="/settings/access" element={<RequirePage page="access_control" label="RBAC"><SettingsPage /></RequirePage>} />
          <Route path="/daily-briefing" element={<RequirePage page="daily_briefing" label="AI Daily Briefing"><DailyBriefingPage /></RequirePage>} />
          {/* Legacy report routes now point at their Monitoring equivalents.
              Kept as redirects so existing links and bookmarks keep working. */}
          <Route path="/walkins-report" element={<Navigate to="/monitoring/walkins" replace />} />
          <Route path="/watchlists" element={<Navigate to="/monitoring/kitchen-unattended" replace />} />
          <Route path="/inference" element={<RequirePage page="inference_viewer" label="the Inference Viewer"><InferenceViewerPage /></RequirePage>} />
          <Route path="/assistant" element={<AssistantEnhancePage />} />
          <Route path="/assistant_legacy" element={<ChatAssistantPage />} />
          <Route path="/assistant_enhance/debug" element={<AssistantEnhanceDebugPage />} />
          <Route path="/challan-email" element={<ChallanEmailPage />} />
          <Route path="/challan-history" element={<ChallanHistoryPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
