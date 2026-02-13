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
  blandCallId: string;
  isActive: boolean;
}

export default function LiveCallMonitor({ blandCallId, isActive }: LiveCallMonitorProps) {
  const { toast } = useToast();
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [listening, setListening] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Poll transcript every 2.5s
  useEffect(() => {
    if (!isActive || !blandCallId) return;

    const fetchTranscript = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("live-call-stream", {
          body: { call_id: blandCallId, action: "transcript" },
        });
        if (error || !data?.events) return;

        const newLines: TranscriptLine[] = [];
        for (const evt of data.events) {
          const text = evt.text || evt.transcript || evt.message || "";
          if (!text.trim()) continue;

          const id = evt.id || `${evt.created_at || ""}-${text.slice(0, 20)}`;
          if (seenIdsRef.current.has(id)) continue;
          seenIdsRef.current.add(id);

          const role: "agent" | "caller" =
            evt.category === "agent" || evt.role === "agent" || evt.speaker === "agent"
              ? "agent"
              : "caller";

          newLines.push({ id, role, text, timestamp: evt.created_at ? new Date(evt.created_at).getTime() : undefined });
        }

        if (newLines.length > 0) {
          setLines((prev) => [...prev, ...newLines]);
        }
      } catch {
        // silently retry on next poll
      }
    };

    fetchTranscript();
    const interval = setInterval(fetchTranscript, 2500);
    return () => clearInterval(interval);
  }, [isActive, blandCallId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  // Clean up WebSocket + AudioContext when call ends
  useEffect(() => {
    if (!isActive) {
      wsRef.current?.close();
      wsRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      setListening(false);
    }
  }, [isActive]);

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

    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("live-call-stream", {
        body: { call_id: blandCallId, action: "listen" },
      });
      if (error) throw error;

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

  if (!isActive || !blandCallId) return null;

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

      {/* Listen button */}
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
    </div>
  );
}
