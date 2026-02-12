import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Upload, Loader2, FileText, Trash2 } from "lucide-react";

interface KnowledgeFile {
  name: string;
  created_at: string;
}

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.storage.from("knowledge_docs").list(user.id);
    setFiles((data || []).map((f) => ({ name: f.name, created_at: f.created_at || "" })));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const { error } = await supabase.storage.from("knowledge_docs").upload(`${user.id}/${file.name}`, file);
      if (error) throw error;
      toast({ title: "Uploaded", description: file.name });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!user) return;
    await supabase.storage.from("knowledge_docs").remove([`${user.id}/${name}`]);
    toast({ title: "Deleted" });
    load();
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">Upload documents for your agents to reference.</p>
        </div>
        <label>
          <Button disabled={uploading} asChild>
            <span className="cursor-pointer">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload
            </span>
          </Button>
          <input type="file" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {files.length === 0 ? (
        <div className="surface-elevated rounded-xl p-12 text-center space-y-4">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.name} className="surface-elevated rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground">{f.name}</span>
              </div>
              <button onClick={() => handleDelete(f.name)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
