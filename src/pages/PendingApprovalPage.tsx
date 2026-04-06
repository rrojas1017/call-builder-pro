import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, LogOut, CheckCircle2, XCircle } from "lucide-react";
import appendifyLogo from "@/assets/appendify-logo.png";

export default function PendingApprovalPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"pending" | "denied" | "no_request" | "loading">("loading");
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const checkStatus = async () => {
      // Check if user now has an org (approved)
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (profile?.org_id) {
        // User has been approved, reload
        window.location.href = "/dashboard";
        return;
      }

      // Check join request status
      const { data: requests } = await supabase
        .from("join_requests")
        .select("status, org_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (requests && requests.length > 0) {
        const req = requests[0];
        if (req.status === "denied") {
          setStatus("denied");
        } else {
          setStatus("pending");
        }
        // Try to get org name
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", req.org_id)
          .single();
        setOrgName(org?.name ?? null);
      } else {
        setStatus("no_request");
      }
    };

    checkStatus();
    // Poll every 10 seconds
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <img src={appendifyLogo} alt="Appendify Voz" className="h-16 w-16 mx-auto object-contain" />

        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Checking your access status...</p>
          </div>
        )}

        {status === "pending" && (
          <div className="space-y-6">
            <div className="h-20 w-20 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
              <Clock className="h-10 w-10 text-amber-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Pending Approval</h1>
              <p className="text-muted-foreground leading-relaxed">
                Your request to join{" "}
                {orgName ? <span className="font-semibold text-foreground">{orgName}</span> : "the company"}{" "}
                has been submitted. A company admin will review and approve your access shortly.
              </p>
            </div>
            <div className="glass-card rounded-xl p-4 text-sm text-muted-foreground">
              <p>This page will automatically refresh when your access is approved.</p>
            </div>
          </div>
        )}

        {status === "denied" && (
          <div className="space-y-6">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <XCircle className="h-10 w-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
              <p className="text-muted-foreground leading-relaxed">
                Your request to join{" "}
                {orgName ? <span className="font-semibold text-foreground">{orgName}</span> : "the company"}{" "}
                was not approved. Please contact your company administrator for assistance.
              </p>
            </div>
          </div>
        )}

        {status === "no_request" && (
          <div className="space-y-6">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Clock className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">No Company Assigned</h1>
              <p className="text-muted-foreground leading-relaxed">
                Your account is not associated with any company. Please sign up again with a valid company code, or contact an administrator to get access.
              </p>
            </div>
          </div>
        )}

        <Button variant="outline" onClick={handleSignOut} className="mx-auto">
          <LogOut className="mr-2 h-4 w-4" /> Sign Out
        </Button>
      </div>
    </div>
  );
}