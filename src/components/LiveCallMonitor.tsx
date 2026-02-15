import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Headphones, Radio, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface TranscriptLine {
  id: string;
  role: "agent" | "caller";
  text: string;
  timestamp?: number;
}

interface LiveCallMonitorProps {
  blandCallId?: string | null;
  retellCallId?: string | null;
  /** For Retell: poll transcript from test_run_contacts */
  contactId?: string | null;
  isActive: boolean;
}

export default function LiveCallMonitor({ blandCallId, retellCallId, contactId, isActive }: LiveCallMonitorProps) {
  const { toast } = useToast();
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [listening, setListening] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevIsActiveRef = useRef(isActive);

  const isBland = !!blandCallId;
  const isRetell = !!retellCallId && !blandCallId;
  const activeCallId = blandCallId || retellCallId;

  // Poll transcript for Bland calls via edge function
  useEffect(() => {
    if (!isActive || !isBland || !blandCallId) return;

    const fetchTranscript = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("live-call-stream", {
          body: { call_id: blandCallId, action: "transcript" },
        });
        if (error || !data?.transcripts) return;

        const allLines: TranscriptLine[] = data.transcripts
          .filter((t: any) => t.text?.trim())
          .map((t: any) => ({
            id: String(t.id),
            role: t.role as "agent" | "caller",
            text: t.text,
            timestamp: t.created_at ? new Date(t.created_at).getTime() : undefined,
          }));
        setLines(allLines);
      } catch {
        // silently retry on next poll
      }
    };

    fetchTranscript();
    const interval = setInterval(fetchTranscript, 1500);
    return () => clearInterval(interval);
  }, [isActive, isBland, blandCallId]);

  // Poll transcript for Retell calls from database
  useEffect(() => {
    if (!isActive || !isRetell || !contactId) return;

    const fetchTranscript = async () => {
      try {
        const { data } = await supabase
          .from("test_run_contacts")
          .select("transcript")
          .eq("id", contactId)
          .single();

        if (!data?.transcript) return;

        // Parse concatenated transcript format: "role: text\nrole: text"
        const parsed: TranscriptLine[] = [];
        const segments = data.transcript.split("\n").filter((s: string) => s.trim());
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const colonIdx = seg.indexOf(":");
          if (colonIdx === -1) continue;

          const speaker = seg.slice(0, colonIdx).trim().toLowerCase();
          const text = seg.slice(colonIdx + 1).trim();
          if (!text) continue;

          parsed.push({
            id: `retell-${i}`,
            role: speaker === "agent" || speaker === "assistant" ? "agent" : "caller",
            text,
          });
        }

        if (parsed.length > 0) {
          setLines(parsed);
        }
      } catch {
        // silently retry
      }
    };

    fetchTranscript();
    const interval = setInterval(fetchTranscript, 3000);
    return () => clearInterval(interval);
  }, [isActive, isRetell, contactId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  // Final fetch when call ends + clean up WebSocket/AudioContext
  useEffect(() => {
    if (prevIsActiveRef.current && !isActive) {
      // Call just ended — do one final transcript fetch
      if (isBland && blandCallId) {
        supabase.functions.invoke("live-call-stream", {
          body: { call_id: blandCallId, action: "transcript" },
        }).then(({ data }) => {
          if (data?.transcripts) {
            const allLines: TranscriptLine[] = data.transcripts
              .filter((t: any) => t.text?.trim())
              .map((t: any) => ({
                id: String(t.id),
                role: t.role as "agent" | "caller",
                text: t.text,
                timestamp: t.created_at ? new Date(t.created_at).getTime() : undefined,
              }));
            setLines(allLines);
          }
        }).catch(() => {});
      }
      wsRef.current?.close();
      wsRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      setListening(false);
    }
    prevIsActiveRef.current = isActive;
  }, [isActive, isBland, blandCallId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      audioCtxRef.current?.close();
    };
  }, []);

  const handleListen = useCallback(async () => {
    if (listening) {
      wsRef.current?.close();
      wsRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      setListening(false);
      return;
    }

    if (!blandCallId) return;

    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("live-call-stream", {
        body: { call_id: blandCallId, action: "listen" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const wsUrl = data?.websocket_url;
      if (!wsUrl) throw new Error("No WebSocket URL returned");

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setListening(true);
        setConnecting(false);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const floatData = new Float32Array(event.data);
          const buffer = audioCtx.createBuffer(1, floatData.length, audioCtx.sampleRate);
          buffer.getChannelData(0).set(floatData);
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(audioCtx.destination);
          source.start();
        }
      };

      ws.onerror = () => {
        toast({ title: "Audio error", description: "Failed to connect to live audio.", variant: "destructive" });
        setListening(false);
        setConnecting(false);
      };

      ws.onclose = () => {
        setListening(false);
      };
    } catch (err: any) {
      toast({ title: "Listen failed", description: err.message, variant: "destructive" });
      setConnecting(false);
    }
  }, [blandCallId, listening, toast]);

  if (!isActive || !activeCallId) return null;

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

      {/* Listen button - only for Bland calls */}
      {isBland && (
        <Button
          variant={listening ? "destructive" : "outline"}
          size="sm"
          className="w-full"
          onClick={handleListen}
          disabled={connecting}
        >
          <Headphones className="mr-2 h-4 w-4" />
          {connecting ? "Connecting..." : listening ? "Stop Listening" : "Listen Live"}
        </Button>
      )}

      {isRetell && (
        <p className="text-xs text-muted-foreground text-center">
          Live audio not available for this provider. Transcript updates from database.
        </p>
      )}
    </div>
  );
}
