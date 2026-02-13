import { useState, useRef } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VoicePlayButtonProps {
  voiceId: string;
  sampleText?: string;
}

let activeAudio: HTMLAudioElement | null = null;

export function VoicePlayButton({ voiceId, sampleText }: VoicePlayButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      URL.revokeObjectURL(audioRef.current.src);
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

    // Stop any other playing sample
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      URL.revokeObjectURL(activeAudio.src);
      activeAudio = null;
    }

    setState("loading");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-voice-sample`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ voice_id: voiceId, text: sampleText }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      activeAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        activeAudio = null;
        setState("idle");
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
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
      toast({ title: "Could not generate sample", description: err.message, variant: "destructive" });
    }
  };

  return (
    <button
      onClick={play}
      disabled={state === "loading"}
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
