import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, BookOpen, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KnowledgeEntry {
  id: string;
  project_id: string;
  category: string;
  content: string;
  source_url: string | null;
  source_type: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "conversation_technique", label: "Conversation", icon: "💬" },
  { value: "product_knowledge", label: "Product", icon: "📦" },
  { value: "objection_handling", label: "Objections", icon: "🛡️" },
  { value: "industry_insight", label: "Industry", icon: "📊" },
  { value: "competitor_info", label: "Competitors", icon: "🏢" },
];

const categoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;
const categoryIcon = (cat: string) => CATEGORIES.find(c => c.value === cat)?.icon || "📝";

const sourceTypeBadge = (type: string) => {
  if (type === "auto_research") return <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">Auto</Badge>;
  if (type === "evaluation") return <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Eval</Badge>;
  return <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/20">Manual</Badge>;
};

export default function AgentKnowledgePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [agentName, setAgentName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("product_knowledge");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    if (!projectId || !user) return;

    const [{ data: project }, { data: spec }, { data: knowledge }] = await Promise.all([
      supabase.from("agent_projects").select("name").eq("id", projectId).single(),
      supabase.from("agent_specs").select("use_case").eq("project_id", projectId).single(),
      supabase.from("agent_knowledge").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    ]);

    setAgentName(project?.name || "Agent");
    setUseCase(spec?.use_case || "");
    setEntries((knowledge || []) as KnowledgeEntry[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [projectId, user]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("agent_knowledge").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEntries(prev => prev.filter(e => e.id !== id));
      toast({ title: "Deleted" });
    }
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    const { error } = await supabase.from("agent_knowledge").update({ content: editContent }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEntries(prev => prev.map(e => e.id === id ? { ...e, content: editContent } : e));
      setEditingId(null);
      toast({ title: "Updated" });
    }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newContent.trim() || !projectId) return;
    setSaving(true);
    const { data, error } = await supabase.from("agent_knowledge").insert({
      project_id: projectId,
      category: newCategory,
      content: newContent.trim(),
      source_type: "manual",
    }).select().single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setEntries(prev => [data as KnowledgeEntry, ...prev]);
      setAddOpen(false);
      setNewContent("");
      toast({ title: "Knowledge added" });
    }
    setSaving(false);
  };

  const filterByCategory = (cat: string | null) =>
    cat ? entries.filter(e => e.category === cat) : entries;

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <Link to="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Agents
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" /> {agentName} Knowledge
            </h1>
            {useCase && <p className="text-muted-foreground mt-1">Vertical: {useCase}</p>}
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Knowledge
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
          {CATEGORIES.map(c => {
            const count = entries.filter(e => e.category === c.value).length;
            return count > 0 ? (
              <TabsTrigger key={c.value} value={c.value}>
                {c.icon} {c.label} ({count})
              </TabsTrigger>
            ) : null;
          })}
        </TabsList>

        {["all", ...CATEGORIES.map(c => c.value)].map(tab => (
          <TabsContent key={tab} value={tab} className="space-y-3 mt-4">
            {filterByCategory(tab === "all" ? null : tab).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No entries yet.</p>
            ) : (
              filterByCategory(tab === "all" ? null : tab).map(entry => (
                <div key={entry.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{categoryIcon(entry.category)}</span>
                      <Badge variant="secondary" className="text-xs">{categoryLabel(entry.category)}</Badge>
                      {sourceTypeBadge(entry.source_type)}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditingId(entry.id); setEditContent(entry.content); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {editingId === entry.id ? (
                    <div className="space-y-2">
                      <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(entry.id)} disabled={saving}>
                          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground">{entry.content}</p>
                  )}

                  {entry.source_url && (
                    <a href={entry.source_url} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Source
                    </a>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Knowledge Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Enter knowledge content..." value={newContent} onChange={e => setNewContent(e.target.value)} rows={4} />
            <Button onClick={handleAdd} disabled={saving || !newContent.trim()} className="w-full">
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Add Entry
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
