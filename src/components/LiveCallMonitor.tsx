import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Radio, User, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TranscriptLine {
  id: string;
  role: "agent" | "caller";
  text: string;
}

interface LiveCallMonitorProps {
  retellCallId?: string | null;
  contactId?: string | null;
  isActive: boolean;
}

export default function LiveCallMonitor({ retellCallId, contactId, isActive }: LiveCallMonitorProps) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll transcript for Retell calls via edge function
  useEffect(() => {
    if (!isActive || !retellCallId) return;

    const fetchTranscript = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("live-call-stream", {
          body: { call_id: retellCallId, action: "transcript" },
        });
        if (error || !data?.transcripts) return;

        const allLines: TranscriptLine[] = data.transcripts
          .filter((t: any) => t.text?.trim())
          .map((t: any) => ({
            id: String(t.id),
            role: t.role as "agent" | "caller",
            text: t.text,
          }));
        setLines(allLines);
      } catch {
        // silently retry on next poll
      }
    };

    fetchTranscript();
    const interval = setInterval(fetchTranscript, 1500);
    return () => clearInterval(interval);
  }, [isActive, retellCallId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  if (!isActive || !retellCallId) return null;

  return (
    <div className="surface-elevated rounded-xl p-6 space-y-3 border border-primary/20">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary animate-pulse" />
          Live Monitor
        </h2>
        <Badge variant="outline" className="text-xs border-primary/40 text-primary">
          LIVE
        </Badge>
      </div>

      {/* Transcript feed */}
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto space-y-2 rounded-lg bg-muted/30 border border-border p-3"
      >
        {lines.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Waiting for conversation to begin...
          </p>
        )}
        {lines.map((line) => (
          <div
            key={line.id}
            className={`flex gap-2 items-start ${line.role === "agent" ? "" : "flex-row-reverse"}`}
          >
            <div className={`flex-shrink-0 rounded-full p-1 ${line.role === "agent" ? "bg-primary/10" : "bg-muted"}`}>
              {line.role === "agent" ? (
                <Bot className="h-3 w-3 text-primary" />
              ) : (
                <User className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            <div
              className={`rounded-lg px-3 py-1.5 text-xs max-w-[80%] ${
                line.role === "agent"
                  ? "bg-primary/10 text-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {line.text}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Transcript updates in real-time.
      </p>
    </div>
  );
}
