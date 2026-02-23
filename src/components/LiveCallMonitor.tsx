import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Radio, User, Bot, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TranscriptLine {
  id: string;
  role: "agent" | "caller";
  text: string;
}

interface LiveCallMonitorProps {
  retellCallId?: string | null;
  contactId?: string | null;
  contactStatus?: string;
  isActive: boolean;
}

function parseTranscript(raw: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  const segments = raw.split("\n").filter((s) => s.trim());
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const colonIdx = seg.indexOf(":");
    if (colonIdx === -1) continue;
    const speaker = seg.slice(0, colonIdx).trim().toLowerCase();
    const text = seg.slice(colonIdx + 1).trim();
    if (!text) continue;
    lines.push({
      id: `line-${i}`,
      role: speaker === "agent" || speaker === "assistant" ? "agent" : "caller",
      text,
    });
  }
  return lines;
}

export default function LiveCallMonitor({ retellCallId, contactId, contactStatus, isActive }: LiveCallMonitorProps) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [transcript, setTranscript] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isCalling = contactStatus === "calling" || contactStatus === "queued";

  // Poll database for transcript
  useEffect(() => {
    if (!isActive || !contactId) return;

    const fetchTranscript = async () => {
      const { data } = await supabase
        .from("test_run_contacts")
        .select("transcript, status")
        .eq("id", contactId)
        .single();

      if (data?.transcript) {
        setTranscript(data.transcript);
        setLines(parseTranscript(data.transcript));
      }
    };

    fetchTranscript();
    const interval = setInterval(fetchTranscript, 3000);
    return () => clearInterval(interval);
  }, [isActive, contactId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  if (!isActive || !contactId) return null;

  const showInProgress = isCalling && lines.length === 0;
  const showNoTranscript = !isCalling && !transcript;

  return (
    <div className="surface-elevated rounded-xl p-6 space-y-3 border border-primary/20">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {isCalling ? (
            <Radio className="h-4 w-4 text-primary animate-pulse" />
          ) : (
            <Phone className="h-4 w-4 text-primary" />
          )}
          Call Transcript
        </h2>
        {isCalling && (
          <Badge variant="outline" className="text-xs border-primary/40 text-primary">
            LIVE
          </Badge>
        )}
      </div>

      {/* In-progress animation */}
      {showInProgress && (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1 bg-primary rounded-full"
                style={{
                  animation: `audioWave 1.2s ease-in-out ${i * 0.15}s infinite`,
                  height: "16px",
                }}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">
            Call in progress — transcript will appear when the call ends...
          </p>
          <style>{`
            @keyframes audioWave {
              0%, 100% { height: 8px; opacity: 0.4; }
              50% { height: 24px; opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* No transcript available */}
      {showNoTranscript && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No transcript available for this call.
        </p>
      )}

      {/* Transcript feed */}
      {lines.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto space-y-2 rounded-lg bg-muted/30 border border-border p-3"
        >
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
      )}

      {isCalling && lines.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Transcript updates as the call progresses.
        </p>
      )}
    </div>
  );
}
