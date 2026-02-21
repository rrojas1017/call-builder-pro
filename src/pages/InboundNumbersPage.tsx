import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const POPULAR_AREA_CODES = [
  { code: "213", city: "Los Angeles, CA" },
  { code: "312", city: "Chicago, IL" },
  { code: "415", city: "San Francisco, CA" },
  { code: "516", city: "Long Island, NY" },
  { code: "604", city: "Vancouver, BC" },
  { code: "647", city: "Toronto, ON" },
  { code: "702", city: "Las Vegas, NV" },
  { code: "786", city: "Miami, FL" },
  { code: "905", city: "Greater Toronto, ON" },
] as const;
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, PhoneIncoming, Plus, RefreshCw, Tag, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InboundNumber {
  id: string;
  phone_number: string;
  project_id: string | null;
  label: string | null;
  area_code: string | null;
  status: string;
  monthly_cost_usd: number;
  purchased_at: string;
  created_at: string;
}

interface AgentProject {
  id: string;
  name: string;
}

export default function InboundNumbersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [numbers, setNumbers] = useState<InboundNumber[]>([]);
  const [agents, setAgents] = useState<AgentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const [areaCode, setAreaCode] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [callCounts, setCallCounts] = useState<Record<string, number>>({});
  const [orgId, setOrgId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"bland" | "retell">("bland");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("org_id").eq("id", user.id).single().then(({ data }) => {
      setOrgId(data?.org_id || null);
    });
  }, [user]);

  const loadData = async () => {
    if (!orgId) return;
    const [{ data: nums }, { data: ags }, { data: calls }] = await Promise.all([
      supabase.from("inbound_numbers").select("*").eq("org_id", orgId).neq("status", "released").order("created_at", { ascending: false }),
      supabase.from("agent_projects").select("id, name").eq("org_id", orgId),
      supabase.from("calls").select("inbound_number_id").not("inbound_number_id", "is", null),
    ]);
    setNumbers((nums as InboundNumber[]) || []);
    setAgents((ags as AgentProject[]) || []);

    const counts: Record<string, number> = {};
    (calls || []).forEach((c: any) => {
      counts[c.inbound_number_id] = (counts[c.inbound_number_id] || 0) + 1;
    });
    setCallCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    if (user && orgId) loadData();
  }, [user, orgId]);

  const extractError = async (error: any): Promise<string> => {
    const body = await error?.context?.json?.().catch(() => null);
    return body?.error || error?.message || "Unknown error";
  };

  const handlePurchase = async () => {
    if (!areaCode || !orgId) return;
    setPurchasing(true);
    try {
      if (provider === "retell") {
        const { data, error } = await supabase.functions.invoke("manage-retell-numbers", {
          body: { action: "purchase", area_code: areaCode, org_id: orgId },
        });
        if (error) throw new Error(await extractError(error));
        if (data?.error) throw new Error(data.error);
        toast({ title: "Number Purchased (Append)", description: `${data.number?.phone_number || "Number"} is now active.` });
      } else {
        const { data, error } = await supabase.functions.invoke("manage-inbound-numbers", {
          body: { action: "purchase", area_code: areaCode, org_id: orgId },
        });
        if (error) throw new Error(await extractError(error));
        if (data?.error) throw new Error(data.error);
        toast({ title: "Number Purchased", description: `${data.number.phone_number} is now active.` });
      }
      setBuyOpen(false);
      setAreaCode("");
      loadData();
    } catch (err: any) {
      toast({ title: "Purchase Failed", description: err.message, variant: "destructive" });
    } finally {
      setPurchasing(false);
    }
  };

  const handleAssign = async (numberId: string, projectId: string) => {
    setAssigningId(numberId);
    try {
      const action = projectId === "unassign" ? "unassign" : "assign";
      const payload: any = { action, number_id: numberId };
      if (action === "assign") payload.project_id = projectId;

      const { data, error } = await supabase.functions.invoke("manage-inbound-numbers", { body: payload });
      if (error) throw new Error(await extractError(error));
      if (data?.error) throw new Error(data.error);
      toast({ title: action === "assign" ? "Agent Assigned" : "Agent Unassigned" });
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigningId(null);
    }
  };

  const handleRelease = async (numberId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-inbound-numbers", {
        body: { action: "release", number_id: numberId },
      });
      if (error) throw new Error(await extractError(error));
      if (data?.error) throw new Error(data.error);
      toast({ title: "Number Released" });
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-inbound-numbers", {
        body: { action: "sync", org_id: orgId },
      });
      if (error) throw new Error(await extractError(error));
      if (data?.error) throw new Error(data.error);
      toast({ title: "Sync Complete", description: `${data.synced} numbers synced.` });
      loadData();
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inbound Numbers</h1>
          <p className="text-muted-foreground mt-1">Purchase and manage phone numbers for inbound calls</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn("h-4 w-4 mr-1", syncing && "animate-spin")} />
            Sync
          </Button>
          <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Buy Number</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Purchase Inbound Number</DialogTitle>
                <DialogDescription>Choose a provider and area code to purchase a new phone number.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid gap-2 grid-cols-2">
                  <button
                    onClick={() => setProvider("bland")}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      provider === "bland" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">Voz</p>
                    <p className="text-xs text-muted-foreground">$15/mo per number</p>
                  </button>
                  <button
                    onClick={() => setProvider("retell")}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      provider === "retell" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">Append</p>
                    <p className="text-xs text-muted-foreground">$2/mo per number</p>
                  </button>
                </div>

                <Select value={areaCode} onValueChange={setAreaCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an area code..." />
                  </SelectTrigger>
                  <SelectContent>
                    {POPULAR_AREA_CODES.map((ac) => (
                      <SelectItem key={ac.code} value={ac.code}>
                        {ac.code} — {ac.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Monthly cost: {provider === "retell" ? "$2.00" : "$15.00"} billed through {provider === "retell" ? "Append (Retell)" : "Bland AI"}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBuyOpen(false)}>Cancel</Button>
                <Button onClick={handlePurchase} disabled={purchasing || areaCode.length < 3}>
                  {purchasing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Purchase
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {numbers.length === 0 ? (
        <div className="surface-elevated rounded-xl p-12 text-center">
          <PhoneIncoming className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No inbound numbers yet. Purchase one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {numbers.map((num) => {
            const agent = agents.find((a) => a.id === num.project_id);
            return (
              <div key={num.id} className="surface-elevated rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <PhoneIncoming className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{num.phone_number}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {num.label && <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{num.label}</span>}
                      <span>{callCounts[num.id] || 0} calls</span>
                      <span>•</span>
                      <span>${num.monthly_cost_usd}/mo</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={num.project_id || "unassigned"}
                    onValueChange={(val) => handleAssign(num.id, val === "unassigned" ? "unassign" : val)}
                    disabled={assigningId === num.id}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Assign agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assigningId === num.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Button variant="ghost" size="icon" onClick={() => handleRelease(num.id)} title="Release number">
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
