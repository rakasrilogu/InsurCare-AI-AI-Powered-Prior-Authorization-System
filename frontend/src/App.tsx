import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage        from "./pages/LandingPage";
import LoginPage          from "./pages/LoginPage";
import DashboardPage      from "./pages/DashboardPage";
import SubmitRequestPage  from "./pages/SubmitRequestPage";
import PipelinePage       from "./pages/PipelinePage";
import ResultPage         from "./pages/ResultPage";
import AgentTrackingPage  from "./pages/AgentTrackingPage";
import RequestsPage       from "./pages/RequestsPage";
import AnalyticsPage      from "./pages/AnalyticsPage";
import ChatPage           from "./pages/ChatPage";
import AuditLogPage       from "./pages/AuditLogPage";
import NotFound           from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/"              element={<LandingPage />} />
            <Route path="/login"         element={<LoginPage />} />
            <Route path="/dashboard"     element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            {/* Users with submit permission */}
            <Route path="/submit"        element={<ProtectedRoute submitOnly><SubmitRequestPage /></ProtectedRoute>} />
            {/* All roles */}
            <Route path="/pipeline/:id"  element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
            <Route path="/result/:id"    element={<ProtectedRoute><ResultPage /></ProtectedRoute>} />
            <Route path="/request/:id"   element={<ProtectedRoute><ResultPage /></ProtectedRoute>} />
            <Route path="/requests"      element={<ProtectedRoute><RequestsPage /></ProtectedRoute>} />
            <Route path="/agent-tracking"        element={<ProtectedRoute><AgentTrackingPage /></ProtectedRoute>} />
            <Route path="/agent-tracking/:id"    element={<ProtectedRoute><AgentTrackingPage /></ProtectedRoute>} />
            <Route path="/analytics"     element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            <Route path="/chat"          element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
            <Route path="/audit"         element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
            <Route path="*"              element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
