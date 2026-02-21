import { useState, useRef } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VoicePlayButtonProps {
  voiceId: string;
  previewUrl?: string;
}

let activeAudio: HTMLAudioElement | null = null;

export function VoicePlayButton({ voiceId, previewUrl }: VoicePlayButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setState("idle");
  };

  const play = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (state === "playing") {
      stop();
      return;
    }

    if (!previewUrl) {
      toast({ title: "No preview available", description: "This voice doesn't have a preview URL.", variant: "destructive" });
      return;
    }

    // Stop any other playing sample
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio = null;
    }

    setState("loading");
    try {
      const audio = new Audio(previewUrl);
      audioRef.current = audio;
      activeAudio = audio;

      audio.onended = () => {
        audioRef.current = null;
        activeAudio = null;
        setState("idle");
      };

      audio.onerror = () => {
        audioRef.current = null;
        activeAudio = null;
        setState("idle");
        toast({ title: "Playback failed", variant: "destructive" });
      };

      await audio.play();
      setState("playing");
    } catch (err: any) {
      console.error("Voice sample error:", err);
      setState("idle");
      toast({ title: "Could not play sample", description: err.message, variant: "destructive" });
    }
  };

  return (
    <button
      onClick={play}
      disabled={state === "loading" || !previewUrl}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
      title={state === "playing" ? "Stop" : "Preview voice"}
    >
      {state === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
      {state === "playing" && <Square className="h-3 w-3" />}
      {state === "idle" && <Play className="h-3 w-3" />}
      {state === "loading" ? "Loading…" : state === "playing" ? "Stop" : "Preview"}
    </button>
  );
}
