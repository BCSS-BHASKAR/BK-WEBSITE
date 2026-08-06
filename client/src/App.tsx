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
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/vehicle-report" element={<VehicleReportPage />} />
          {/* Active Alerts now reads the live inference data. The previous
              page queried the legacy crowds table, which has no writer. */}
          <Route path="/crowds-report" element={<ActiveAlertsPage />} />
          <Route path="/active-alerts" element={<Navigate to="/crowds-report" replace />} />
          <Route path="/vehicle-journey" element={<VehicleJourneyPage />} />
          <Route path="/violations" element={<ViolationsPage />} />
          <Route path="/violation" element={<ViolationsPage />} />
          <Route path="/live-view" element={<LiveViewPage />} />
          {/* Kitchen Unattended reports kitchen staffing records. The plate-rule
              editor it replaced is still reachable at /watchlists/rules. */}
          <Route path="/watchlists/rules" element={<WatchlistsPage />} />
          <Route path="/known-faces" element={<KnownFacesPage />} />
          {/* One template, five modules - resolved from the :module slug. */}
          <Route path="/monitoring/:module" element={<MonitoringPage />} />
          <Route path="/monitoring" element={<Navigate to="/monitoring/walkins" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/daily-briefing" element={<DailyBriefingPage />} />
          {/* Legacy report routes now point at their Monitoring equivalents.
              Kept as redirects so existing links and bookmarks keep working. */}
          <Route path="/walkins-report" element={<Navigate to="/monitoring/walkins" replace />} />
          <Route path="/watchlists" element={<Navigate to="/monitoring/kitchen-unattended" replace />} />
          <Route path="/inference" element={<InferenceViewerPage />} />
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
