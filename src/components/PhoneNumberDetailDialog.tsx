import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  PhoneIncoming, Clock, Calendar, DollarSign, MapPin, Tag, Loader2, Pencil, Check, X,
} from "lucide-react";
import { format } from "date-fns";

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

interface Props {
  number: InboundNumber | null;
  agents: AgentProject[];
  callCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLabelUpdated: () => void;
}

export default function PhoneNumberDetailDialog({ number, agents, callCount, open, onOpenChange, onLabelUpdated }: Props) {
  const { toast } = useToast();
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);

  useEffect(() => {
    if (!number || !open) return;
    setEditingLabel(false);
    setLabelValue(number.label || "");
    setLoadingCalls(true);
    supabase
      .from("calls")
      .select("id, outcome, duration_seconds, created_at, direction")
      .eq("inbound_number_id", number.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setRecentCalls((data as RecentCall[]) || []);
        setLoadingCalls(false);
      });
  }, [number, open]);

  const handleSaveLabel = async () => {
    if (!number) return;
    setSavingLabel(true);
    try {
      const { error } = await supabase
        .from("inbound_numbers")
        .update({ label: labelValue || null })
        .eq("id", number.id);
      if (error) throw error;
      toast({ title: "Label updated" });
      setEditingLabel(false);
      onLabelUpdated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingLabel(false);
    }
  };

  if (!number) return null;

  const agent = agents.find((a) => a.id === number.project_id);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneIncoming className="h-5 w-5 text-primary" />
            {number.phone_number}
          </DialogTitle>
          <DialogDescription>Phone number details and recent activity</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Label */}
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {editingLabel ? (
              <div className="flex items-center gap-1 flex-1">
                <Input
                  value={labelValue}
                  onChange={(e) => setLabelValue(e.target.value)}
                  className="h-7 text-sm"
                  placeholder="Add a label..."
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveLabel} disabled={savingLabel}>
                  {savingLabel ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingLabel(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 flex-1">
                <span className="text-sm text-foreground">{number.label || "No label"}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setLabelValue(number.label || ""); setEditingLabel(true); }}>
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            )}
          </div>

          {/* Assignment */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Agent:</span>
            {agent ? (
              <Badge variant="default">{agent.name}</Badge>
            ) : (
              <Badge variant="secondary">Unassigned</Badge>
            )}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Area code: {number.area_code || "—"}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              ${number.monthly_cost_usd}/mo
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(number.purchased_at), "MMM d, yyyy")}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <PhoneIncoming className="h-3.5 w-3.5" />
              {callCount} calls
            </div>
          </div>

          {/* Recent calls */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">Recent Calls</h4>
            {loadingCalls ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : recentCalls.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No calls yet</p>
            ) : (
              <div className="space-y-2">
                {recentCalls.map((call) => (
                  <div key={call.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
