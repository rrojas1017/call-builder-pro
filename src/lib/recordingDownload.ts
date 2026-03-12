import { supabase } from "@/integrations/supabase/client";

/**
 * Convert a Retell WAV recording URL to a smaller MP3 URL.
 */
export function toMp3Url(recordingUrl: string): string {
  return recordingUrl.replace(/\.wav(\?|$)/, ".mp3$1");
}

/**
 * Trigger a browser download of the recording.
 * Tries WAV → MP3 → server-side proxy → open in new tab.
 */
export async function downloadRecording(
  recordingUrl: string,
  filename?: string,
  retellCallId?: string | null
) {
  const mp3Url = toMp3Url(recordingUrl);
  const baseName = filename?.replace(/\.(mp3|wav)$/i, "") || "recording";

  // Try WAV first
  try {
    const res = await fetch(recordingUrl);
    if (res.ok) {
      const blob = await res.blob();
      triggerDownload(blob, baseName + ".wav");
      return;
    }
  } catch { /* continue */ }

  // Try MP3
  try {
    const res = await fetch(mp3Url);
    if (res.ok) {
      const blob = await res.blob();
      triggerDownload(blob, baseName + ".mp3");
      return;
    }
  } catch { /* continue */ }

  // Try server-side proxy
  try {
    const { data, error } = await supabase.functions.invoke("download-recording", {
      body: { recording_url: recordingUrl, retell_call_id: retellCallId },
    });
    // supabase.functions.invoke returns parsed JSON for JSON responses,
    // but for binary we get a Blob via responseType
    if (!error && data instanceof Blob && data.size > 0) {
      const ext = data.type?.includes("mpeg") ? "mp3" : "wav";
      triggerDownload(data, baseName + "." + ext);
      return;
    }
  } catch { /* continue */ }

  // Try proxy with raw fetch for binary streaming
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/download-recording`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ recording_url: recordingUrl, retell_call_id: retellCallId }),
      }
    );
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("audio") || ct.includes("octet-stream")) {
        const blob = await res.blob();
        const ext = ct.includes("mpeg") ? "mp3" : "wav";
        triggerDownload(blob, baseName + "." + ext);
        return;
      }
    }
  } catch { /* continue */ }

  // Fallback: open original URL in new tab
  window.open(recordingUrl, "_blank");
}

/** @deprecated Use downloadRecording instead */
export const downloadRecordingMp3 = downloadRecording;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
