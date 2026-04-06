import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedLayout from "./components/ProtectedLayout";
import AuthPage from "./pages/AuthPage";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import AgentsPage from "./pages/AgentsPage";
import CreateAgentPage from "./pages/CreateAgentPage";
import EditAgentPage from "./pages/EditAgentPage";
import AgentKnowledgePage from "./pages/AgentKnowledgePage";
import CampaignsPage from "./pages/CampaignsPage";
import CampaignDetailPage from "./pages/CampaignDetailPage";
import ListsPage from "./pages/ListsPage";
import CallsPage from "./pages/CallsPage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import SettingsPage from "./pages/SettingsPage";
import UniversityPage from "./pages/UniversityPage";
import InboundNumbersPage from "./pages/InboundNumbersPage";
import TeamPage from "./pages/TeamPage";
import BillingPage from "./pages/BillingPage";
import AdminCompaniesPage from "./pages/AdminCompaniesPage";
import AdminCompanyDetailPage from "./pages/AdminCompanyDetailPage";
import AuditLogPage from "./pages/AuditLogPage";
import TrainingAuditPage from "./pages/TrainingAuditPage";
import CRMPage from "./pages/CRMPage";
import CostAuditsPage from "./pages/CostAuditsPage";
import ReportsPage from "./pages/ReportsPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";

import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";
import NotFound from "./pages/NotFound";
import { ThemeProvider } from "./components/ThemeProvider";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/pending" element={<ProtectedRoute><PendingApprovalPage /></ProtectedRoute>} />
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/agents/:id/knowledge" element={<AgentKnowledgePage />} />
            <Route path="/agents/:id/edit" element={<EditAgentPage />} />
            <Route path="/create-agent" element={<CreateAgentPage />} />
            <Route path="/test" element={<UniversityPage />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/inbound" element={<InboundNumbersPage />} />
            <Route path="/calls" element={<CallsPage />} />
            <Route path="/knowledge" element={<KnowledgeBasePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/admin/companies" element={<AdminCompaniesPage />} />
            <Route path="/admin/companies/:orgId" element={<AdminCompanyDetailPage />} />
            <Route path="/admin/audit" element={<AuditLogPage />} />
            <Route path="/training-audit" element={<TrainingAuditPage />} />
            <Route path="/crm" element={<CRMPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/admin/cost-audits" element={<CostAuditsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
