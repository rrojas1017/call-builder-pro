import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { useTheme } from "next-themes";

export default function SettingsPage() {
  const { user } = useAuth();
  const { activeOrgId, isAdmin } = useOrgContext();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: profile } = await supabase.from("profiles").select("full_name, org_id").eq("id", user.id).single();
      if (profile) {
        setFullName(profile.full_name || "");
        const orgIdToUse = activeOrgId || profile.org_id;
        if (orgIdToUse) {
          const { data: org } = await supabase.from("organizations").select("name").eq("id", orgIdToUse).single();
          setOrgName(org?.name || "");
        }
      }
      setLoading(false);
    };
    load();
  }, [user, activeOrgId]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);

      // Save org name if admin
      if (isAdmin && activeOrgId && orgName.trim()) {
        await supabase.from("organizations").update({ name: orgName.trim() }).eq("id", activeOrgId);
      }

      toast({ title: "Settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-8 max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account.</p>
      </div>

      <div className="surface-elevated rounded-xl p-6 space-y-5">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={user?.email || ""} disabled className="opacity-60" />
        </div>
        <div className="space-y-2">
          <Label>Full Name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Organization</Label>
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            disabled={!isAdmin}
            className={!isAdmin ? "opacity-60" : ""}
          />
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">Only admins can edit the organization name.</p>
          )}
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose your preferred theme.</p>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="theme-switch">Dark Mode</Label>
          <Switch
            id="theme-switch"
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </div>
      </div>
    </div>
  );
}
