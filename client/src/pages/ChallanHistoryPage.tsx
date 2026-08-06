import { Navigate } from "react-router-dom";

export function ChallanHistoryPage() {
  return <Navigate to="/challan-email?tab=history" replace />;
}
