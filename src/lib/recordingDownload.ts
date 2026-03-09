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
 * Trigger a browser download of the recording as MP3.
 */
export async function downloadRecordingMp3(recordingUrl: string, filename?: string) {
  const mp3Url = toMp3Url(recordingUrl);
  const safeName = filename || "recording.mp3";

  try {
    const res = await fetch(mp3Url);
    if (!res.ok) throw new Error("MP3 not available");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName.endsWith(".mp3") ? safeName : safeName + ".mp3";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Fallback: open original URL in new tab
    window.open(recordingUrl, "_blank");
  }
}
