import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, Pause, Upload, Megaphone, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  status: string;
  project_id: string;
  max_concurrent_calls: number;
  created_at: string;
  contact_count?: number;
}

export default function CampaignsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const projectId = params.get("project");
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(!!projectId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    let query = supabase.from("campaigns").select("*").order("created_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data } = await query;
    setCampaigns(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, projectId]);

  const handleCreate = async () => {
    if (!newName.trim() || !projectId) return;
    setCreating(true);
    try {
      const { data: campaign, error } = await supabase.from("campaigns").insert({
        name: newName,
        project_id: projectId,
      }).select().single();
      if (error) throw error;

      // Parse CSV and insert contacts
      if (csvFile) {
        const text = await csvFile.text();
        const lines = text.trim().split("\n").slice(1); // skip header
        const contacts = lines.map((line) => {
          const [name, phone] = line.split(",").map((s) => s.trim().replace(/"/g, ""));
          return { campaign_id: campaign.id, name: name || "Unknown", phone: phone || "" };
        }).filter((c) => c.phone);

        if (contacts.length > 0) {
          const { error: contactErr } = await supabase.from("contacts").insert(contacts);
          if (contactErr) throw contactErr;
        }
        toast({ title: "Campaign created", description: `${contacts.length} contacts loaded.` });
      } else {
        toast({ title: "Campaign created", description: "Upload a CSV to add contacts." });
      }

      setNewName("");
      setCsvFile(null);
      setShowCreate(false);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleStart = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      const { error } = await supabase.functions.invoke("start-campaign", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      toast({ title: "Campaign started!" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
      toast({ title: "Campaign paused" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const statusColor: Record<string, string> = {
    draft: "text-muted-foreground bg-muted",
    running: "text-success bg-success/10",
    paused: "text-warning bg-warning/10",
    completed: "text-primary bg-primary/10",
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
          <p className="text-muted-foreground mt-1">Manage outbound call campaigns.</p>
        </div>
        {projectId && (
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        )}
      </div>

      {showCreate && projectId && (
        <div className="surface-elevated rounded-xl p-6 space-y-4">
          <div className="space-y-2">
            <Label>Campaign Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Q1 ACA Outreach" />
          </div>
          <div className="space-y-2">
            <Label>Upload CSV (name, phone)</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary transition-colors">
              <Upload className="h-4 w-4" />
              {csvFile ? csvFile.name : "Choose CSV file"}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
            Create Campaign
          </Button>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="surface-elevated rounded-xl p-12 text-center space-y-4">
          <Megaphone className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No campaigns yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="surface-elevated rounded-xl p-5 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">{c.name}</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColor[c.status])}>
                    {c.status}
                  </span>
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(c.status === "draft" || c.status === "paused") && (
                  <Button size="sm" onClick={() => handleStart(c.id)} disabled={actionLoading === c.id}>
                    {actionLoading === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                )}
                {c.status === "running" && (
                  <Button size="sm" variant="outline" onClick={() => handlePause(c.id)} disabled={actionLoading === c.id}>
                    {actionLoading === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
