import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Phone, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Call {
  id: string;
  bland_call_id: string | null;
  direction: string;
  outcome: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  created_at: string;
  transcript: string | null;
  extracted_data: any;
  summary: any;
}

export default function CallsPage() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Call | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setCalls(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const outcomeColor: Record<string, string> = {
    completed: "text-success",
    failed: "text-destructive",
    no_answer: "text-warning",
    qualified: "text-primary",
    disqualified: "text-muted-foreground",
  };

  return (
    <div className="flex h-full">
      <div className={cn("border-r border-border overflow-y-auto", selected ? "w-96" : "w-full")}>
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground">Calls</h1>
          <p className="text-muted-foreground mt-1">{calls.length} calls</p>
        </div>
        {calls.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No calls yet. Start a campaign to make calls.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {calls.map((call) => (
              <button
                key={call.id}
                onClick={() => setSelected(call)}
                className={cn(
                  "w-full p-4 text-left hover:bg-muted/50 transition-colors flex items-center justify-between",
                  selected?.id === call.id && "bg-muted/50"
                )}
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{call.bland_call_id?.slice(0, 12) || call.id.slice(0, 8)}...</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={outcomeColor[call.outcome || ""] || "text-muted-foreground"}>
                      {call.outcome || "pending"}
                    </span>
                    <span className="text-muted-foreground">
                      {call.duration_seconds ? `${call.duration_seconds}s` : "—"}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Call Detail</h2>
            <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:text-foreground">Close</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="surface-elevated rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Outcome</p>
              <p className={cn("text-sm font-semibold", outcomeColor[selected.outcome || ""])}>{selected.outcome || "pending"}</p>
            </div>
            <div className="surface-elevated rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-semibold text-foreground">{selected.duration_seconds ? `${selected.duration_seconds}s` : "—"}</p>
            </div>
          </div>

          {selected.extracted_data && (
            <div className="surface-elevated rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Extracted Data</p>
              <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">
                {JSON.stringify(selected.extracted_data, null, 2)}
              </pre>
            </div>
          )}

          {selected.transcript && (
            <div className="surface-elevated rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcript</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{selected.transcript}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
