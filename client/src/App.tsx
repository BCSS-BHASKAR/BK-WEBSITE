import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { AppShell } from "./components/AppShell";
import { ProtectedLayout } from "./components/ProtectedLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { VehicleReportPage } from "./pages/VehicleReportPage";
import { WalkinsReportPage } from "./pages/WalkinsReportPage";
import { CrowdsReportPage } from "./pages/CrowdsReportPage";
import { ViolationsPage } from "./pages/ViolationsPage";
import { LiveViewPage } from "./pages/LiveViewPage";
import { LoginPage } from "./pages/LoginPage";
import { WatchlistsPage } from "./pages/WatchlistsPage";
import { ChefPresencePage } from "./pages/ChefPresencePage";
import { ChatAssistantPage } from "./pages/ChatAssistantPage";
import { AssistantEnhancePage } from "./pages/AssistantEnhancePage";
import { AssistantEnhanceDebugPage } from "./pages/AssistantEnhanceDebugPage";
import { ChallanEmailPage } from "./pages/ChallanEmailPage";
import { ChallanHistoryPage } from "./pages/ChallanHistoryPage";
import { DailyBriefingPage } from "./pages/DailyBriefingPage";
import { VehicleJourneyPage } from "./pages/VehicleJourneyPage";
import { KnownFacesPage } from "./pages/KnownFacesPage";
import { InferenceViewerPage } from "./pages/InferenceViewerPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/vehicle-report" element={<VehicleReportPage />} />
          <Route path="/walkins-report" element={<WalkinsReportPage />} />
          <Route path="/crowds-report" element={<CrowdsReportPage />} />
          <Route path="/vehicle-journey" element={<VehicleJourneyPage />} />
          <Route path="/violations" element={<ViolationsPage />} />
          <Route path="/violation" element={<ViolationsPage />} />
          <Route path="/live-view" element={<LiveViewPage />} />
          {/* Kitchen Unattended reports kitchen staffing records. The plate-rule
              editor it replaced is still reachable at /watchlists/rules. */}
          <Route path="/watchlists" element={<ChefPresencePage />} />
          <Route path="/watchlists/rules" element={<WatchlistsPage />} />
          <Route path="/known-faces" element={<KnownFacesPage />} />
          <Route path="/inference" element={<InferenceViewerPage />} />
          <Route path="/assistant" element={<AssistantEnhancePage />} />
          <Route path="/assistant_legacy" element={<ChatAssistantPage />} />
          <Route path="/assistant_enhance/debug" element={<AssistantEnhanceDebugPage />} />
          <Route path="/challan-email" element={<ChallanEmailPage />} />
          <Route path="/challan-history" element={<ChallanHistoryPage />} />
          <Route path="/daily-briefing" element={<DailyBriefingPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
