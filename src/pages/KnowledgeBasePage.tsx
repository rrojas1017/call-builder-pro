import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import UploadSourcesDialog from "@/components/UploadSourcesDialog";
import {
  BookOpen, Upload, Loader2, Trash2, Brain, ArrowLeft, ChevronRight,
  GraduationCap, Plus, Pencil, Mic, FileText, Globe, Lightbulb, BarChart3
} from "lucide-react";

interface AgentProject {
  id: string;
  name: string;
  description: string | null;
  maturity_level: string;
  updated_at: string;
}

interface KnowledgeEntry {
  id: string;
  project_id: string;
  category: string;
  content: string;
  source_url: string | null;
  source_type: string;
  created_at: string;
  usage_count: number;
  file_name: string | null;
}

interface WizardQuestion {
  question: string;
  rationale: string;
}

const CATEGORIES = [
  { value: "conversation_technique", label: "Conversation", icon: "💬" },
  { value: "product_knowledge", label: "Product", icon: "📦" },
  { value: "objection_handling", label: "Objections", icon: "🛡️" },
  { value: "industry_insight", label: "Industry", icon: "📊" },
  { value: "competitor_info", label: "Competitors", icon: "🏢" },
  { value: "winning_pattern", label: "Winning Patterns", icon: "🏆" },
];

const categoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;
const categoryIcon = (cat: string) => CATEGORIES.find(c => c.value === cat)?.icon || "📝";

const sourceTypeBadge = (type: string) => {
  const map: Record<string, { className: string; label: string }> = {
    auto_research: { className: "bg-primary/10 text-primary border-primary/20", label: "Auto" },
    evaluation: { className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", label: "Eval" },
    success_learning: { className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Success" },
    document: { className: "bg-blue-500/10 text-blue-400 border-blue-500/20", label: "Document" },
    url: { className: "bg-violet-500/10 text-violet-400 border-violet-500/20", label: "URL" },
    transfer_recording: { className: "bg-orange-500/10 text-orange-400 border-orange-500/20", label: "🎙️ Recording" },
    wizard_followup: { className: "bg-amber-500/10 text-amber-400 border-amber-500/20", label: "🧙 Wizard" },
  };
  const m = map[type] || { className: "bg-green-500/10 text-green-400 border-green-500/20", label: "Manual" };
  return <Badge variant="outline" className={`text-xs ${m.className}`}>{m.label}</Badge>;
};

const usageBadge = (count: number) => {
  if (count === 0) return <span className="text-[10px] text-muted-foreground">Unused</span>;
  return <span className="text-[10px] text-emerald-500 font-medium">Used {count}x</span>;
};

const MATURITY_COLORS: Record<string, string> = {
  training: "text-muted-foreground",
  developing: "text-blue-400",
  competent: "text-amber-400",
  expert: "text-emerald-400",
  graduated: "text-purple-400",
};

export default function KnowledgeBasePage() {
  const { activeOrgId } = useOrgContext();
  const { toast } = useToast();

  // Agent selector state
  const [agents, setAgents] = useState<(AgentProject & { knowledgeCount: number })[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentProject | null>(null);

  // Knowledge state (for selected agent)
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Add manual entry
  const [addOpen, setAddOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("product_knowledge");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardQuestions, setWizardQuestions] = useState<WizardQuestion[]>([]);
  const [wizardAnswers, setWizardAnswers] = useState<string[]>([]);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardSaving, setWizardSaving] = useState(false);

  // Load agents
  useEffect(() => {
    if (!activeOrgId) return;
    const load = async () => {
      setLoadingAgents(true);
      const { data: projects } = await supabase
        .from("agent_projects")
        .select("id, name, description, maturity_level, updated_at")
        .eq("org_id", activeOrgId)
        .order("updated_at", { ascending: false });

      if (!projects || projects.length === 0) {
        setAgents([]);
        setLoadingAgents(false);
        return;
      }

      // Get knowledge counts per agent
      const counts: Record<string, number> = {};
      for (const p of projects) {
        const { count } = await supabase
          .from("agent_knowledge")
          .select("id", { count: "exact", head: true })
          .eq("project_id", p.id);
        counts[p.id] = count || 0;
      }

      const enriched = projects.map(p => ({ ...p, knowledgeCount: counts[p.id] || 0 }));
      setAgents(enriched);

      // Auto-select if only one agent
      if (enriched.length === 1) {
        setSelectedAgent(enriched[0]);
      }
      setLoadingAgents(false);
    };
    load();
  }, [activeOrgId]);

  // Load entries when agent selected
  useEffect(() => {
    if (!selectedAgent) return;
    const load = async () => {
      setLoadingEntries(true);
      const { data } = await supabase
        .from("agent_knowledge")
        .select("*")
        .eq("project_id", selectedAgent.id)
        .order("created_at", { ascending: false });
      setEntries((data || []) as unknown as KnowledgeEntry[]);
      setLoadingEntries(false);
    };
    load();
  }, [selectedAgent]);

  const refreshEntries = async () => {
    if (!selectedAgent) return;
    const { data } = await supabase
      .from("agent_knowledge")
      .select("*")
      .eq("project_id", selectedAgent.id)
      .order("created_at", { ascending: false });
    setEntries((data || []) as unknown as KnowledgeEntry[]);
  };

  // After upload completes, trigger the wizard
  const handlePostUpload = async () => {
    await refreshEntries();
    if (!selectedAgent) return;

    // Get the most recently created entries (last 30 seconds)
    const cutoff = new Date(Date.now() - 30000).toISOString();
    const recentEntries = entries.length > 0 ? [] : []; // Will re-fetch
    const { data: recent } = await supabase
      .from("agent_knowledge")
      .select("id")
      .eq("project_id", selectedAgent.id)
      .gte("created_at", cutoff);

    if (recent && recent.length > 0) {
      triggerWizard(recent.map(r => r.id));
    }
  };

  const triggerWizard = async (entryIds: string[]) => {
    if (!selectedAgent || entryIds.length === 0) return;
    setWizardLoading(true);
    setWizardOpen(true);
    setWizardStep(0);
    setWizardAnswers([]);

    try {
      const { data, error } = await supabase.functions.invoke("knowledge-wizard", {
        body: { project_id: selectedAgent.id, entry_ids: entryIds },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const questions = data?.questions || [];
      setWizardQuestions(questions);
      setWizardAnswers(new Array(questions.length).fill(""));
    } catch (err: any) {
      toast({ title: "Wizard error", description: err.message, variant: "destructive" });
      setWizardOpen(false);
    } finally {
      setWizardLoading(false);
    }
  };

  const handleWizardSubmit = async () => {
    if (!selectedAgent) return;
    setWizardSaving(true);
    try {
      const rows = wizardQuestions
        .map((q, i) => ({
          project_id: selectedAgent.id,
          category: "product_knowledge" as string,
          content: `Q: ${q.question}\nA: ${wizardAnswers[i]}`,
          source_type: "wizard_followup",
        }))
        .filter((_, i) => wizardAnswers[i]?.trim());

      if (rows.length > 0) {
        const { error } = await supabase.from("agent_knowledge").insert(rows);
        if (error) throw error;
      }

      toast({ title: "Knowledge enriched", description: `${rows.length} follow-up answers saved.` });
      setWizardOpen(false);
      refreshEntries();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setWizardSaving(false);
    }
  };

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
    if (!newContent.trim() || !selectedAgent) return;
    setSaving(true);
    const { data, error } = await supabase.from("agent_knowledge").insert({
      project_id: selectedAgent.id,
      category: newCategory,
      content: newContent.trim(),
      source_type: "manual",
    }).select().single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setEntries(prev => [data as unknown as KnowledgeEntry, ...prev]);
      setAddOpen(false);
      setNewContent("");
      toast({ title: "Knowledge added" });
    }
    setSaving(false);
  };

  const filterByCategory = (cat: string | null) =>
    cat ? entries.filter(e => e.category === cat) : entries;

  // ─── AGENT SELECTOR VIEW ─────────────────────────────────────────────
  if (!selectedAgent) {
    return (
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Knowledge Base
          </h1>
          <p className="text-muted-foreground mt-1">Select an agent to manage its knowledge.</p>
        </div>

        {loadingAgents ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <Brain className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No agents found. Create an agent first.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => (
              <Card
                key={agent.id}
                className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md"
                onClick={() => setSelectedAgent(agent)}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{agent.name}</h3>
                      {agent.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <GraduationCap className={`h-3.5 w-3.5 ${MATURITY_COLORS[agent.maturity_level] || "text-muted-foreground"}`} />
                      <span className="capitalize text-muted-foreground">{agent.maturity_level}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Brain className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{agent.knowledgeCount} entries</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Updated {new Date(agent.updated_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── AGENT KNOWLEDGE VIEW ────────────────────────────────────────────
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div>
        <button
          onClick={() => { setSelectedAgent(null); setEntries([]); }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Agents
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" /> {selectedAgent.name} Knowledge
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {entries.length} knowledge entries
              {entries.filter(e => e.usage_count > 0).length > 0 && (
                <> · <BarChart3 className="inline h-3 w-3" /> {entries.filter(e => e.usage_count > 0).length} actively used</>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Upload Sources
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Knowledge
            </Button>
          </div>
        </div>
      </div>

      {/* Knowledge list */}
      {loadingEntries ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList className="flex-wrap">
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
                <div className="text-center py-12 space-y-3">
                  <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">No entries yet. Upload sources or add knowledge manually.</p>
                </div>
              ) : (
                filterByCategory(tab === "all" ? null : tab).map(entry => (
                  <div key={entry.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{categoryIcon(entry.category)}</span>
                        <Badge variant="secondary" className="text-xs">{categoryLabel(entry.category)}</Badge>
                        {sourceTypeBadge(entry.source_type)}
                        {usageBadge(entry.usage_count)}
                        {entry.file_name && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <FileText className="h-2.5 w-2.5" /> {entry.file_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => { setEditingId(entry.id); setEditContent(entry.content); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
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
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.content}</p>
                    )}

                    {entry.source_url && (
                      <a
                        href={entry.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Globe className="h-3 w-3" /> Source
                      </a>
                    )}
                  </div>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Upload dialog */}
      {selectedAgent && (
        <UploadSourcesDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          projectId={selectedAgent.id}
          onIngested={handlePostUpload}
        />
      )}

      {/* Add manual entry dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Knowledge Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={4}
                placeholder="Enter knowledge that will help the agent..."
              />
            </div>
            <Button onClick={handleAdd} disabled={saving || !newContent.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add Entry
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wizard dialog */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-400" /> Knowledge Wizard
            </DialogTitle>
          </DialogHeader>

          {wizardLoading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing uploaded content...</p>
            </div>
          ) : wizardQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No follow-up questions needed.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Progress value={((wizardStep + 1) / wizardQuestions.length) * 100} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground">{wizardStep + 1}/{wizardQuestions.length}</span>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">{wizardQuestions[wizardStep]?.question}</p>
                {wizardQuestions[wizardStep]?.rationale && (
                  <p className="text-xs text-muted-foreground italic">{wizardQuestions[wizardStep].rationale}</p>
                )}
                <Textarea
                  value={wizardAnswers[wizardStep] || ""}
                  onChange={e => {
                    const next = [...wizardAnswers];
                    next[wizardStep] = e.target.value;
                    setWizardAnswers(next);
                  }}
                  rows={3}
                  placeholder="Your answer..."
                />
              </div>

              <div className="flex justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={wizardStep === 0}
                  onClick={() => setWizardStep(s => s - 1)}
                >
                  Previous
                </Button>
                {wizardStep < wizardQuestions.length - 1 ? (
                  <Button size="sm" onClick={() => setWizardStep(s => s + 1)}>
                    Next
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleWizardSubmit} disabled={wizardSaving}>
                    {wizardSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Save Answers
                  </Button>
                )}
              </div>

              <button
                className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                onClick={() => setWizardOpen(false)}
              >
                Skip wizard
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
