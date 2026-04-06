import { useState, useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { OrgProvider, useOrgContext } from "@/hooks/useOrgContext";
import AppSidebar from "./AppSidebar";
import CompanyOnboardingModal from "./CompanyOnboardingModal";
import { Loader2 } from "lucide-react";

function LayoutInner() {
  const { activeOrgId, orgName, loading } = useOrgContext();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [resolvedOrgName, setResolvedOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && orgName) {
      setResolvedOrgName(orgName);
      // Show onboarding if org name matches default pattern
      setShowOnboarding(orgName.endsWith("'s Org"));
    }
  }, [loading, orgName]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {showOnboarding && activeOrgId && resolvedOrgName && (
        <CompanyOnboardingModal
          orgId={activeOrgId}
          currentName={resolvedOrgName}
          onComplete={(newName) => {
            setShowOnboarding(false);
            setResolvedOrgName(newName);
          }}
        />
      )}
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </>
  );
}

export default function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <OrgProvider>
      <OrgGate />
    </OrgProvider>
  );
}

function OrgGate() {
  const { activeOrgId, loading } = useOrgContext();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user has no org, they are pending approval
  if (!activeOrgId) {
    return <Navigate to="/pending" replace />;
  }

  return <LayoutInner />;
}
