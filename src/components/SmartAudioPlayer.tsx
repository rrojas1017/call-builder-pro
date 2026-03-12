import { useState, useRef, useEffect } from "react";
import { ExternalLink, Download, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadRecording } from "@/lib/recordingDownload";
import { supabase } from "@/integrations/supabase/client";

interface SmartAudioPlayerProps {
  url: string;
  className?: string;
  onRateChange?: (rate: number) => void;
  retellCallId?: string | null;
}

/**
 * Audio player that handles CORS/403 failures gracefully.
 * Tries WAV first, then MP3, then fetch-as-blob, then provider lookup, then fallback UI.
 */
export function SmartAudioPlayer({ url, className = "w-full h-10", onRateChange, retellCallId }: SmartAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fetching" | "failed" | "unavailable">("loading");
  const [bestUrl, setBestUrl] = useState(url);
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Reset when URL changes
  useEffect(() => {
    setStatus("loading");
    setBestUrl(url);
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, [url]);

  const tryFetchAsBlob = async (targetUrl: string): Promise<string | null> => {
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) return null;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      blobUrlRef.current = objUrl;
      return objUrl;
    } catch {
      return null;
    }
  };

  const handleError = async () => {
    setStatus("fetching");

    // 1. Try fetching WAV as blob
    const wavBlobUrl = await tryFetchAsBlob(url);
    if (wavBlobUrl && audioRef.current) {
      audioRef.current.src = wavBlobUrl;
      setBestUrl(url);
      setStatus("ready");
      return;
    }

    // 2. Try MP3 variant as blob
    const mp3Url = url.replace(/\.wav(\?|$)/, ".mp3$1");
    if (mp3Url !== url) {
      const mp3BlobUrl = await tryFetchAsBlob(mp3Url);
      if (mp3BlobUrl && audioRef.current) {
        audioRef.current.src = mp3BlobUrl;
        setBestUrl(mp3Url);
        setStatus("ready");
        return;
      }
    }

    // 3. Try provider-side fresh URL lookup
    if (retellCallId) {
      try {
        const { data } = await supabase.functions.invoke("live-call-stream", {
          body: { call_id: retellCallId, action: "recording_status" },
        });
        if (data?.recording_url) {
          const freshBlobUrl = await tryFetchAsBlob(data.recording_url);
          if (freshBlobUrl && audioRef.current) {
            audioRef.current.src = freshBlobUrl;
            setBestUrl(data.recording_url);
            setStatus("ready");
            return;
          }
          // Even if blob fails, try direct element
          if (audioRef.current) {
            audioRef.current.src = data.recording_url;
            setBestUrl(data.recording_url);
            setStatus("ready");
            return;
          }
        }
        if (data?.exists === false) {
          setStatus("unavailable");
          return;
        }
      } catch {
        // Provider lookup failed, continue to fallback
      }
    }

    setStatus("failed");
  };

  if (status === "unavailable") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        <span>Recording no longer available</span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(bestUrl, "_blank")}
        >
          <ExternalLink className="h-3 w-3 mr-1" /> Play in New Tab
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => downloadRecording(url)}
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
        {/* WAV first — MP3 returns 403 in this environment */}
        <source src={url} type="audio/wav" />
        <source src={url.replace(/\.wav(\?|$)/, ".mp3$1")} type="audio/mpeg" />
      </audio>
    </div>
  );
}
