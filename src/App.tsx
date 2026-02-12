import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedLayout from "./components/ProtectedLayout";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import AgentsPage from "./pages/AgentsPage";
import CreateAgentPage from "./pages/CreateAgentPage";
import CampaignsPage from "./pages/CampaignsPage";
import CallsPage from "./pages/CallsPage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import SettingsPage from "./pages/SettingsPage";
import QuickTestPage from "./pages/QuickTestPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/create-agent" element={<CreateAgentPage />} />
            <Route path="/test" element={<QuickTestPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/calls" element={<CallsPage />} />
            <Route path="/knowledge" element={<KnowledgeBasePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
