import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Phone, PhoneIncoming, Plus, RefreshCw, Tag, Trash2, MapPin, DollarSign, Calendar, Clock, Search, Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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

interface RecentCall {
  id: string;
  outcome: string | null;
  duration_seconds: number | null;
  created_at: string;
  direction: string;
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1(${digits.slice(1, 4)})${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+1(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);

  const selectedNumber = numbers.find((n) => n.id === selectedId) || null;

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

  // Fetch recent calls when selection changes
  useEffect(() => {
    if (!selectedNumber) {
      setRecentCalls([]);
      return;
    }
    setLabelValue(selectedNumber.label || "");
    setLoadingCalls(true);
    supabase
      .from("calls")
      .select("id, outcome, duration_seconds, created_at, direction")
      .eq("inbound_number_id", selectedNumber.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setRecentCalls((data as RecentCall[]) || []);
        setLoadingCalls(false);
      });
  }, [selectedId]);

  const extractError = async (error: any): Promise<string> => {
    try {
      const body = await error?.context?.json?.();
      if (body?.error) return body.error;
    } catch { /* body may already be consumed */ }
    const msg = error?.message || "";
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.error) return parsed.error;
    } catch { /* not JSON */ }
    const jsonMatch = msg.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.error) return parsed.error;
      } catch { /* not valid JSON */ }
    }
    return msg || "Unknown error";
  };

  const handlePurchase = async () => {
    if (!areaCode || !orgId) return;
    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-retell-numbers", {
        body: { action: "purchase", area_code: areaCode, org_id: orgId },
      });
      if (error) throw new Error(await extractError(error));
      if (data?.error) throw new Error(data.error);
      toast({ title: "Number Purchased", description: `${data.number?.phone_number || "Number"} is now active.` });
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
      setSelectedId(null);
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

  const handleSaveLabel = async () => {
    if (!selectedNumber) return;
    setSavingLabel(true);
    try {
      const { error } = await supabase
        .from("inbound_numbers")
        .update({ label: labelValue || null })
        .eq("id", selectedNumber.id);
      if (error) throw error;
      toast({ title: "Label updated" });
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingLabel(false);
    }
  };

  const formatDuration = (s: number | null) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const outcomeColor = (outcome: string | null) => {
    if (!outcome) return "secondary";
    const o = outcome.toLowerCase();
    if (o.includes("transfer") || o.includes("qualified")) return "default";
    if (o.includes("voicemail") || o.includes("no_answer")) return "secondary";
    if (o.includes("disqualified") || o.includes("hang")) return "destructive";
    return "outline";
  };

  const filtered = numbers.filter((n) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return n.phone_number.includes(q) || (n.label || "").toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Left Panel — Number List */}
      <div className="w-80 border-r border-border flex flex-col bg-background">
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-foreground">Phone Numbers</h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSync} disabled={syncing} title="Sync numbers">
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              </Button>
              <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" className="h-8 w-8"><Plus className="h-4 w-4" /></Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Purchase Phone Number</DialogTitle>
                    <DialogDescription>Select an area code to purchase a new phone number.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
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
                    <p className="text-xs text-muted-foreground">Monthly cost: $2.00 billed through Append</p>
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
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Number List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center">
              <Phone className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {numbers.length === 0 ? "No phone numbers yet." : "No matching numbers."}
              </p>
            </div>
          ) : (
            filtered.map((num) => {
              const isSelected = num.id === selectedId;
              const isAssigned = !!num.project_id;
              return (
                <button
                  key={num.id}
                  onClick={() => setSelectedId(num.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-border transition-colors hover:bg-accent/50",
                    isSelected && "bg-accent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      isAssigned ? "bg-primary" : "bg-muted-foreground/40"
                    )} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {formatPhoneDisplay(num.phone_number)}
                      </p>
                      {num.label && (
                        <p className="text-xs text-muted-foreground truncate">{num.label}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel — Detail */}
      <div className="flex-1 overflow-y-auto">
        {!selectedNumber ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <PhoneIncoming className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Select a phone number to view details</p>
            </div>
          </div>
        ) : (
          <div className="max-w-xl mx-auto p-6 space-y-6">
            {/* Phone Number Heading */}
            <h2 className="text-2xl font-bold text-foreground">
              {formatPhoneDisplay(selectedNumber.phone_number)}
            </h2>

            {/* Agent Assignment */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Inbound Call Agent</label>
              <Select
                value={selectedNumber.project_id || "unassigned"}
                onValueChange={(val) => handleAssign(selectedNumber.id, val === "unassigned" ? "unassign" : val)}
                disabled={assigningId === selectedNumber.id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assigningId === selectedNumber.id && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating...
                </div>
              )}
            </div>

            {/* Label */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Label</label>
              <div className="flex items-center gap-2">
                <Input
                  value={labelValue}
                  onChange={(e) => setLabelValue(e.target.value)}
                  placeholder="Add a label..."
                  className="h-9"
                />
                <Button
                  size="sm"
                  onClick={handleSaveLabel}
                  disabled={savingLabel || labelValue === (selectedNumber.label || "")}
                >
                  {savingLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Details Grid */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  Area Code: {selectedNumber.area_code || "—"}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5 shrink-0" />
                  ${selectedNumber.monthly_cost_usd}/mo
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  {format(new Date(selectedNumber.purchased_at), "MMM d, yyyy")}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <PhoneIncoming className="h-3.5 w-3.5 shrink-0" />
                  {callCounts[selectedNumber.id] || 0} calls
                </div>
              </div>
            </div>

            {/* Recent Calls */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Recent Calls</h3>
              {loadingCalls ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : recentCalls.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No calls yet</p>
              ) : (
                <div className="space-y-2">
                  {recentCalls.map((call) => (
                    <div key={call.id} className="flex items-center justify-between rounded-lg border border-border p-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant={outcomeColor(call.outcome) as any} className="text-[10px] px-1.5 py-0">
                          {call.outcome || "pending"}
                        </Badge>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(call.duration_seconds)}
                        </span>
                      </div>
                      <span className="text-muted-foreground">
                        {format(new Date(call.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Release */}
            <div className="pt-4 border-t border-border">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRelease(selectedNumber.id)}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Release Number
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
