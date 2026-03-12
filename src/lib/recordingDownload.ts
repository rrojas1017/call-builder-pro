/**
 * Convert a Retell WAV recording URL to a smaller MP3 URL.
 * Retell stores recordings at paths like:
 *   https://...storage.../call_xxx.wav
 * Swapping the extension gives the MP3 variant.
 */
export function toMp3Url(recordingUrl: string): string {
  return recordingUrl.replace(/\.wav(\?|$)/, ".mp3$1");
}

/**
 * Trigger a browser download of the recording.
 * Tries WAV first (more reliable), falls back to MP3, then opens in new tab.
 */
export async function downloadRecording(recordingUrl: string, filename?: string) {
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
