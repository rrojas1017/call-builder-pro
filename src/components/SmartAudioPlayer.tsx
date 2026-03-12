import { useState, useRef, useEffect } from "react";
import { ExternalLink, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMp3Url, downloadRecordingMp3 } from "@/lib/recordingDownload";

interface SmartAudioPlayerProps {
  url: string;
  className?: string;
  onRateChange?: (rate: number) => void;
}

/**
 * Audio player that handles CORS failures gracefully.
 * Tries <audio> element first, then fetch-as-blob, then offers open-in-tab fallback.
 */
export function SmartAudioPlayer({ url, className = "w-full h-10", onRateChange }: SmartAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fetching" | "failed">("loading");
  const mp3Url = toMp3Url(url);

  // Reset status when URL changes
  useEffect(() => { setStatus("loading"); }, [url]);

  const handleError = async () => {
    // The <audio> element failed — try fetch-as-blob
    setStatus("fetching");
    try {
      const res = await fetch(mp3Url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = objUrl;
        setStatus("ready");
      }
    } catch {
      // Both failed — show fallback buttons
      setStatus("failed");
    }
  };

  if (status === "failed") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(mp3Url, "_blank")}
        >
          <ExternalLink className="h-3 w-3 mr-1" /> Play in New Tab
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => downloadRecordingMp3(url)}
        >
          <Download className="h-3 w-3 mr-1" /> Download
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setStatus("loading")}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      {status === "fetching" && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60 rounded z-10">
          <span className="text-xs text-muted-foreground animate-pulse">Loading recording…</span>
        </div>
      )}
      <audio
        ref={audioRef}
        controls
        className={className}
        onLoadedData={() => setStatus("ready")}
        onRateChange={onRateChange ? (e) => onRateChange((e.target as HTMLAudioElement).playbackRate) : undefined}
        onError={handleError}
      >
        <source src={mp3Url} type="audio/mpeg" />
        <source src={url} type="audio/wav" />
      </audio>
    </div>
  );
}
