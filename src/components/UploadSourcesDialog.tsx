import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Globe, FileText, X, Mic, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UploadSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onIngested: () => void;
}

const ACCEPTED_TYPES = ".pdf,.csv,.xlsx,.xls,.txt,.md,.doc,.docx";
const ACCEPTED_AUDIO_TYPES = ".mp3,.wav,.mp4,.m4a,.ogg";

type RecordingStep = "idle" | "uploading" | "transcribing" | "extracting" | "done";

const STEP_LABELS: Record<RecordingStep, string> = {
  idle: "",
  uploading: "Uploading file...",
  transcribing: "Transcribing recording...",
  extracting: "Extracting insights...",
  done: "",
};

export default function UploadSourcesDialog({ open, onOpenChange, projectId, onIngested }: UploadSourcesDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Recording tab state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDragOver, setAudioDragOver] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [recordingStep, setRecordingStep] = useState<RecordingStep>("idle");
  const [insightCount, setInsightCount] = useState<number | null>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles = Array.from(fileList).slice(0, 5);
    setFiles(prev => [...prev, ...newFiles].slice(0, 5));
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUploadFiles = async () => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const filePath = `${projectId}/${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("agent_knowledge_sources")
          .upload(filePath, file);
        if (uploadErr) throw uploadErr;

        const { error: fnErr } = await supabase.functions.invoke("ingest-knowledge-source", {
          body: { project_id: projectId, file_path: filePath },
        });
        if (fnErr) throw fnErr;
      }
      toast({ title: "Sources processed", description: `${files.length} file(s) ingested successfully.` });
      setFiles([]);
      onOpenChange(false);
      onIngested();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleIngestUrl = async () => {
    if (!url.trim()) return;
    setUploading(true);
    try {
      const { error } = await supabase.functions.invoke("ingest-knowledge-source", {
        body: { project_id: projectId, url: url.trim() },
      });
      if (error) throw error;
      toast({ title: "URL processed", description: "Knowledge extracted from the URL." });
      setUrl("");
      onOpenChange(false);
      onIngested();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleAudioFile = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const allowed = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "video/mp4"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExts = ["mp3", "wav", "mp4", "m4a", "ogg"];
    if (!allowed.includes(file.type) && !allowedExts.includes(ext || "")) {
      toast({ title: "Unsupported format", description: "Please upload .mp3, .wav, .mp4, .m4a, or .ogg", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 20MB", variant: "destructive" });
      return;
    }
    setAudioFile(file);
    setRecordingStep("idle");
    setInsightCount(null);
  };

  const handleProcessRecording = async () => {
    if (!audioFile) return;
    try {
      // Step 1: Upload
      setRecordingStep("uploading");
      const ext = audioFile.name.split(".").pop()?.toLowerCase() || "mp3";
      const filePath = `recordings/${projectId}/${Date.now()}_${audioFile.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("agent_knowledge_sources")
        .upload(filePath, audioFile, { contentType: audioFile.type || `audio/${ext}` });
      if (uploadErr) throw uploadErr;

      // Step 2: Transcribe
      setRecordingStep("transcribing");
      // Step 3: Extract (happens server-side, we just show the label change with a slight delay)
      const transcribeTimeout = setTimeout(() => setRecordingStep("extracting"), 15000);

      const { data, error: fnErr } = await supabase.functions.invoke("transcribe-and-ingest", {
        body: {
          project_id: projectId,
          file_path: filePath,
          source_label: sourceLabel.trim() || null,
        },
      });
      clearTimeout(transcribeTimeout);

      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setInsightCount(data?.count ?? 0);
      setRecordingStep("done");

      setTimeout(() => {
        onIngested();
        onOpenChange(false);
        setAudioFile(null);
        setSourceLabel("");
        setRecordingStep("idle");
        setInsightCount(null);
      }, 2500);

    } catch (err: any) {
      setRecordingStep("idle");
      toast({ title: "Processing failed", description: err.message, variant: "destructive" });
    }
  };

  const isRecordingProcessing = recordingStep !== "idle" && recordingStep !== "done";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Knowledge Sources</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="file">
          <TabsList className="w-full">
            <TabsTrigger value="file" className="flex-1"><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Files</TabsTrigger>
            <TabsTrigger value="url" className="flex-1"><Globe className="h-3.5 w-3.5 mr-1.5" /> Paste URL</TabsTrigger>
            <TabsTrigger value="recording" className="flex-1"><Mic className="h-3.5 w-3.5 mr-1.5" /> Recording</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-4 mt-4">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Drag & drop files here, or <span className="text-primary font-medium">browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">PDF, CSV, Excel, TXT, MD — up to 20MB each, max 5 files</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <span className="text-sm truncate mr-2">{f.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeFile(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={handleUploadFiles} disabled={uploading || files.length === 0} className="w-full">
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Process {files.length} File{files.length !== 1 ? "s" : ""}
            </Button>
          </TabsContent>

          <TabsContent value="url" className="space-y-4 mt-4">
            <Input
              placeholder="https://example.com/faq"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter a webpage URL — we'll extract the text content and create knowledge entries.
            </p>
            <Button onClick={handleIngestUrl} disabled={uploading || !url.trim()} className="w-full">
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Extract from URL
            </Button>
          </TabsContent>

          <TabsContent value="recording" className="space-y-4 mt-4">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                audioDragOver ? "border-primary bg-primary/5" : audioFile ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setAudioDragOver(true); }}
              onDragLeave={() => setAudioDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setAudioDragOver(false); handleAudioFile(e.dataTransfer.files); }}
              onClick={() => !isRecordingProcessing && audioInputRef.current?.click()}
            >
              {audioFile ? (
                <div className="space-y-1">
                  <Mic className="h-8 w-8 mx-auto text-primary mb-2" />
                  <p className="text-sm font-medium text-foreground">{audioFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  {!isRecordingProcessing && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground underline mt-1"
                      onClick={(e) => { e.stopPropagation(); setAudioFile(null); setRecordingStep("idle"); setInsightCount(null); }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Mic className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drop recording here, or <span className="text-primary font-medium">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .mp3, .wav, .mp4, .m4a — up to 20MB</p>
                </>
              )}
              <input
                ref={audioInputRef}
                type="file"
                accept={ACCEPTED_AUDIO_TYPES}
                className="hidden"
                onChange={(e) => handleAudioFile(e.target.files)}
              />
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Label (optional)</label>
              <Input
                placeholder='e.g. "Closing call with John - Jan 2026"'
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                disabled={isRecordingProcessing}
              />
            </div>

            {/* Info callout */}
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">💡 Post-Transfer Recordings</p>
              <p>Upload recordings from successful calls that happened <span className="text-foreground font-medium">after your agent transferred a prospect</span>. We'll transcribe and extract sales insights that train your AI agent.</p>
            </div>

            {/* Progress states */}
            {isRecordingProcessing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span>{STEP_LABELS[recordingStep]}</span>
              </div>
            )}

            {recordingStep === "done" && (
              <div className="flex items-center gap-2 text-sm text-emerald-500">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>
                  {insightCount != null && insightCount > 0
                    ? `Done! ${insightCount} insight${insightCount !== 1 ? "s" : ""} added to knowledge base.`
                    : "Processed — no new insights extracted from this recording."}
                </span>
              </div>
            )}

            <Button
              onClick={handleProcessRecording}
              disabled={!audioFile || isRecordingProcessing || recordingStep === "done"}
              className="w-full"
            >
              {isRecordingProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {recordingStep === "done" ? "Done!" : "Process Recording"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
