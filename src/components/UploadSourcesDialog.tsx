import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Globe, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UploadSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onIngested: () => void;
}

const ACCEPTED_TYPES = ".pdf,.csv,.xlsx,.xls,.txt,.md,.doc,.docx";

export default function UploadSourcesDialog({ open, onOpenChange, projectId, onIngested }: UploadSourcesDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
