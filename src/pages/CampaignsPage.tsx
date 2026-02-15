import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, Pause, Megaphone, Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

interface Campaign {
  id: string;
  name: string;
  status: string;
  project_id: string;
  agent_project_id: string | null;
  max_concurrent_calls: number;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
}

interface DialList {
  id: string;
  name: string;
  row_count: number;
  created_at: string;
}

export default function CampaignsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [dialLists, setDialLists] = useState<DialList[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    const [campRes, agentRes, listRes] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("agent_projects").select("id, name").order("name"),
      supabase.from("dial_lists").select("id, name, row_count, created_at").eq("status", "ready").order("created_at", { ascending: false }),
    ]);
    setCampaigns((campRes.data as Campaign[]) || []);
    setAgents(agentRes.data || []);
    setDialLists((listRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const toggleList = (id: string) => {
    setSelectedLists((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!newName.trim() || !selectedAgent || selectedLists.length === 0) return;
    setCreating(true);
    try {
      // Create campaign
      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert({
          name: newName,
          project_id: selectedAgent,
          agent_project_id: selectedAgent,
        } as any)
        .select()
        .single();
      if (error) throw error;

      const campId = (campaign as any).id;

      // Insert campaign_lists junction rows
      const junctionRows = selectedLists.map((listId) => ({
        campaign_id: campId,
        list_id: listId,
      }));
      await supabase.from("campaign_lists" as any).insert(junctionRows);

      // Copy contacts from dial_list_rows into contacts
      for (const listId of selectedLists) {
        const list = dialLists.find((l) => l.id === listId);
        const { data: rows } = await supabase
          .from("dial_list_rows" as any)
          .select("row_data")
          .eq("list_id", listId);

        if (rows && rows.length > 0) {
          // We need to figure out phone/name columns from the list's detected_fields
          const { data: listMeta } = await supabase
            .from("dial_lists")
            .select("detected_fields")
            .eq("id", listId)
            .single();

          const rawFields = (listMeta as any)?.detected_fields;
          const fields: string[] = Array.isArray(rawFields) ? rawFields : (rawFields && typeof rawFields === "object" ? Object.keys(rawFields) : []);
          // Simple heuristic: find phone and name columns
          const phoneCols = ["phone", "phone_number", "mobile", "cell", "telephone"];
          const nameCols = ["name", "full_name", "first_name", "contact"];
          const phoneField = fields.find((f) => phoneCols.includes(f.toLowerCase())) || fields[1] || "";
          const nameField = fields.find((f) => nameCols.includes(f.toLowerCase())) || fields[0] || "";

          const contacts = (rows as any[]).map((r: any) => {
            const rd = r.row_data;
            const extraFields: Record<string, any> = {};
            fields.forEach((f) => {
              if (f !== phoneField && f !== nameField) extraFields[f] = rd[f];
            });
            return {
              campaign_id: campId,
              list_id: listId,
              name: rd[nameField] || "Unknown",
              phone: rd[phoneField] || "",
              extra_data: Object.keys(extraFields).length > 0 ? extraFields : null,
            };
          }).filter((c: any) => c.phone);

          if (contacts.length > 0) {
            // Batch insert
            const batchSize = 500;
            for (let i = 0; i < contacts.length; i += batchSize) {
              await supabase.from("contacts").insert(contacts.slice(i, i + batchSize) as any);
            }
          }
        }
      }

      // Validate contacts were actually inserted
      const { count: insertedCount } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campId);

      if (!insertedCount || insertedCount === 0) {
        // Clean up: delete campaign_lists and campaign
        await supabase.from("campaign_lists" as any).delete().eq("campaign_id", campId);
        await supabase.from("campaigns").delete().eq("id", campId);
        toast({
          title: "No valid contacts found",
          description: "The selected lists have no rows with phone numbers. Check your lists and try again.",
          variant: "destructive",
        });
        setCreating(false);
        return;
      }

      toast({ title: "Campaign created", description: `${insertedCount} contacts loaded from selected lists.` });
      setNewName("");
      setSelectedAgent("");
      setSelectedLists([]);
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
    running: "text-green-700 bg-green-100",
    paused: "text-yellow-700 bg-yellow-100",
    completed: "text-primary bg-primary/10",
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
          <p className="text-muted-foreground mt-1">Manage outbound call campaigns.</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-4 w-4" /> New Campaign
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Q1 ACA Outreach" />
              </div>
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select Lists</Label>
              {dialLists.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lists available. <Link to="/lists" className="text-primary underline">Upload one first</Link>.
                </p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {dialLists.map((l) => (
                    <label
                      key={l.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
                        selectedLists.includes(l.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      )}
                    >
                      <Checkbox
                        checked={selectedLists.includes(l.id)}
                        onCheckedChange={() => toggleList(l.id)}
                      />
                      <div className="flex-1">
                        <span className="font-medium text-sm">{l.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {l.row_count} contacts • {new Date(l.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !selectedAgent || selectedLists.length === 0}
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      )}

      {campaigns.length === 0 ? (
        <div className="surface-elevated rounded-xl p-12 text-center space-y-4">
          <Megaphone className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No campaigns yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/campaigns/${c.id}`)}>
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground">{c.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColor[c.status])}>
                      {c.status}
                    </span>
                    <span>{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <Eye className="h-4 w-4" />
                  </Button>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
