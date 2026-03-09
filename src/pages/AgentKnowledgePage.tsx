import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, BookOpen, ExternalLink, TrendingUp, TrendingDown, Minus, Brain, Trophy, Clock, GraduationCap, Upload, Plug, Zap, CheckCircle, XCircle, Play } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import UploadSourcesDialog from "@/components/UploadSourcesDialog";

interface KnowledgeEntry {
  id: string;
  project_id: string;
  category: string;
  content: string;
  source_url: string | null;
  source_type: string;
  created_at: string;
}

interface ApiEndpoint {
  id: string;
  project_id: string;
  org_id: string;
  name: string;
  endpoint_url: string;
  http_method: string;
  headers: Record<string, string>;
  query_template: string | null;
  response_path: string | null;
  enabled: boolean;
  last_synced_at: string | null;
  last_status: string | null;
  created_at: string;
}

interface ScoreSnapshot {
  avg_overall: number | null;
  spec_version: number;
  created_at: string;
  call_count: number;
}

interface Improvement {
  change_summary: string | null;
  created_at: string;
  from_version: number;
  to_version: number;
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
  if (type === "auto_research") return <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">Auto</Badge>;
  if (type === "evaluation") return <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Eval</Badge>;
  if (type === "success_learning") return <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Success</Badge>;
  if (type === "document") return <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">Document</Badge>;
  if (type === "url") return <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-400 border-violet-500/20">URL</Badge>;
  if (type === "transfer_recording") return <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/20">🎙️ Recording</Badge>;
  return <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/20">Manual</Badge>;
};

const MATURITY_LEVELS = [
  { key: "training", label: "Training", color: "text-muted-foreground", bg: "bg-muted", minCalls: 0, minScore: 0 },
  { key: "developing", label: "Developing", color: "text-blue-400", bg: "bg-blue-500/10", minCalls: 5, minScore: 50 },
  { key: "competent", label: "Competent", color: "text-amber-400", bg: "bg-amber-500/10", minCalls: 10, minScore: 70 },
  { key: "expert", label: "Expert", color: "text-emerald-400", bg: "bg-emerald-500/10", minCalls: 20, minScore: 85 },
  { key: "graduated", label: "Graduated", color: "text-purple-400", bg: "bg-purple-500/10", minCalls: 30, minScore: 90 },
];

function LearningProgressBar({ entries, projectId }: { entries: KnowledgeEntry[]; projectId: string }) {
  const [snapshots, setSnapshots] = useState<ScoreSnapshot[]>([]);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [maturityLevel, setMaturityLevel] = useState("training");
  const [totalCalls, setTotalCalls] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      supabase.from("score_snapshots").select("avg_overall, spec_version, created_at, call_count")
        .eq("project_id", projectId).order("created_at", { ascending: false }).limit(5),
      supabase.from("improvements").select("change_summary, created_at, from_version, to_version")
        .eq("project_id", projectId).order("created_at", { ascending: false }).limit(5),
      supabase.from("agent_projects").select("maturity_level").eq("id", projectId).single(),
      supabase.from("calls").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    ]).then(([snapRes, impRes, projRes, callsRes]) => {
      setSnapshots((snapRes.data || []) as ScoreSnapshot[]);
      setImprovements((impRes.data || []) as Improvement[]);
      setMaturityLevel((projRes.data as any)?.maturity_level || "training");
      setTotalCalls(callsRes.count || 0);
      setLoading(false);
    });
  }, [projectId]);

  if (loading) return null;

  const autoCount = entries.filter(e => e.source_type === "auto_research").length;
  const evalCount = entries.filter(e => e.source_type === "evaluation").length;
  const successCount = entries.filter(e => e.source_type === "success_learning" || e.category === "winning_pattern").length;
  const manualCount = entries.filter(e => e.source_type === "manual").length;
  const recordingCount = entries.filter(e => e.source_type === "transfer_recording").length;

  const validScores = snapshots.filter(s => s.avg_overall != null).map(s => s.avg_overall!);
  const latestScore = validScores[0] ?? null;
  const previousScore = validScores[1] ?? null;
  const scoreDelta = latestScore != null && previousScore != null ? latestScore - previousScore : null;

  const lastTimes = [
    ...entries.map(e => e.created_at),
    ...improvements.map(i => i.created_at),
    ...snapshots.map(s => s.created_at),
  ].filter(Boolean).sort().reverse();
  const lastActivity = lastTimes[0] ? new Date(lastTimes[0]) : null;

  const formatAgo = (d: Date) => {
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const currentIdx = MATURITY_LEVELS.findIndex(l => l.key === maturityLevel);
  const current = MATURITY_LEVELS[currentIdx] || MATURITY_LEVELS[0];
  const next = currentIdx < MATURITY_LEVELS.length - 1 ? MATURITY_LEVELS[currentIdx + 1] : null;

  let progressPercent = 100;
  let progressLabel = "Fully graduated!";
  if (next) {
    const callProgress = Math.min(totalCalls / next.minCalls, 1);
    const scoreProgress = latestScore != null ? Math.min(latestScore / next.minScore, 1) : 0;
    progressPercent = Math.round(((callProgress + scoreProgress) / 2) * 100);
    progressLabel = `${totalCalls}/${next.minCalls} calls, avg ${latestScore?.toFixed(0) ?? "?"}/${next.minScore} needed`;
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className={`h-5 w-5 ${current.color}`} />
              <span className="font-semibold text-foreground">{current.label}</span>
              {next && <span className="text-xs text-muted-foreground">→ {next.label}</span>}
            </div>
            <span className="text-xs text-muted-foreground">{progressLabel}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex gap-1">
            {MATURITY_LEVELS.map((l, i) => (
              <div key={l.key} className={`flex-1 h-1 rounded-full ${i <= currentIdx ? l.bg.replace("/10", "/40") : "bg-muted"}`} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Lessons</p>
              <p className="text-lg font-semibold text-foreground">{entries.length}</p>
              <div className="flex gap-1.5 mt-0.5 flex-wrap">
                {autoCount > 0 && <span className="text-[10px] text-muted-foreground">Auto:{autoCount}</span>}
                {evalCount > 0 && <span className="text-[10px] text-muted-foreground">Eval:{evalCount}</span>}
                {successCount > 0 && <span className="text-[10px] text-muted-foreground">Win:{successCount}</span>}
                {manualCount > 0 && <span className="text-[10px] text-muted-foreground">Manual:{manualCount}</span>}
                {recordingCount > 0 && <span className="text-[10px] text-orange-400">🎙️ {recordingCount}</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
              scoreDelta != null && scoreDelta > 0 ? "bg-emerald-500/10" : scoreDelta != null && scoreDelta < 0 ? "bg-destructive/10" : "bg-muted"
            }`}>
              {scoreDelta != null && scoreDelta > 0 ? <TrendingUp className="h-4.5 w-4.5 text-emerald-500" /> :
               scoreDelta != null && scoreDelta < 0 ? <TrendingDown className="h-4.5 w-4.5 text-destructive" /> :
               <Minus className="h-4.5 w-4.5 text-muted-foreground" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Score Trend</p>
              {latestScore != null ? (
                <>
                  <p className="text-lg font-semibold text-foreground">{latestScore.toFixed(0)}</p>
                  {scoreDelta != null && (
                    <span className={`text-[10px] ${scoreDelta > 0 ? "text-emerald-500" : scoreDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {scoreDelta > 0 ? "+" : ""}{scoreDelta.toFixed(1)} vs prev
                    </span>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No data</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Trophy className="h-4.5 w-4.5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Improvements</p>
              <p className="text-lg font-semibold text-foreground">{improvements.length > 0 ? improvements.length : 0}</p>
              {improvements[0]?.change_summary && (
                <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{improvements[0].change_summary}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Clock className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Activity</p>
              {lastActivity ? (
                <p className="text-lg font-semibold text-foreground">{formatAgo(lastActivity)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── API Sources Tab ──────────────────────────────────────────
function ApiSourcesTab({ projectId }: { projectId: string }) {
  const { activeOrgId } = useOrgContext();
  const { toast } = useToast();
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<ApiEndpoint | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; data: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMethod, setFormMethod] = useState("GET");
  const [formHeaders, setFormHeaders] = useState<{ key: string; value: string }[]>([]);
  const [formResponsePath, setFormResponsePath] = useState("");
  const [formQueryTemplate, setFormQueryTemplate] = useState("");

  const fetchEndpoints = async () => {
    const { data, error } = await supabase
      .from("knowledge_api_endpoints")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (!error) setEndpoints((data || []) as ApiEndpoint[]);
    setLoading(false);
  };

  useEffect(() => { fetchEndpoints(); }, [projectId]);

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormMethod("GET");
    setFormHeaders([]);
    setFormResponsePath("");
    setFormQueryTemplate("");
    setEditingEndpoint(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (ep: ApiEndpoint) => {
    setEditingEndpoint(ep);
    setFormName(ep.name);
    setFormUrl(ep.endpoint_url);
    setFormMethod(ep.http_method);
    setFormHeaders(
      Object.entries(ep.headers || {}).map(([key, value]) => ({ key, value: value as string }))
    );
    setFormResponsePath(ep.response_path || "");
    setFormQueryTemplate(ep.query_template || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim() || !activeOrgId) return;
    setSaving(true);

    const headersObj: Record<string, string> = {};
    formHeaders.forEach(h => { if (h.key.trim()) headersObj[h.key.trim()] = h.value; });

    const payload = {
      project_id: projectId,
      org_id: activeOrgId,
      name: formName.trim(),
      endpoint_url: formUrl.trim(),
      http_method: formMethod,
      headers: headersObj,
      response_path: formResponsePath.trim() || null,
      query_template: formQueryTemplate.trim() || null,
    };

    if (editingEndpoint) {
      const { error } = await supabase
        .from("knowledge_api_endpoints")
        .update(payload)
        .eq("id", editingEndpoint.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "API source updated" });
        setDialogOpen(false);
        resetForm();
        fetchEndpoints();
      }
    } else {
      const { error } = await supabase
        .from("knowledge_api_endpoints")
        .insert(payload);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "API source added" });
        setDialogOpen(false);
        resetForm();
        fetchEndpoints();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("knowledge_api_endpoints").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEndpoints(prev => prev.filter(e => e.id !== id));
      toast({ title: "Deleted" });
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from("knowledge_api_endpoints")
      .update({ enabled })
      .eq("id", id);
    if (!error) {
      setEndpoints(prev => prev.map(e => e.id === id ? { ...e, enabled } : e));
    }
  };

  const handleTest = async (ep: ApiEndpoint) => {
    setTestingId(ep.id);
    setTestResult(null);
    try {
      const resp = await supabase.functions.invoke("fetch-api-knowledge", {
        body: { project_id: projectId },
      });
      if (resp.error) {
        setTestResult({ id: ep.id, data: `Error: ${resp.error.message}` });
      } else {
        setTestResult({ id: ep.id, data: resp.data?.api_data || "No data returned" });
      }
      // Refresh to get updated last_status
      fetchEndpoints();
    } catch (err: any) {
      setTestResult({ id: ep.id, data: `Error: ${err.message}` });
    }
    setTestingId(null);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Connect external APIs to feed real-time data into your agent's knowledge before each call.
        </p>
        <Button onClick={openAdd} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add API Source
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Plug className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No API sources configured yet.</p>
          <Button variant="outline" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" /> Add your first API source
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map(ep => (
            <Card key={ep.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium text-foreground truncate">{ep.name}</span>
                      <Badge variant="outline" className="text-xs">{ep.http_method}</Badge>
                      {ep.last_status === "ok" && (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                      {ep.last_status && ep.last_status !== "ok" && (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{ep.endpoint_url}</p>
                    {ep.response_path && (
                      <p className="text-xs text-muted-foreground mt-0.5">Path: <code className="bg-muted px-1 rounded">{ep.response_path}</code></p>
                    )}
                    {ep.last_synced_at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Last synced: {new Date(ep.last_synced_at).toLocaleString()}
                      </p>
                    )}
                    {testResult?.id === ep.id && (
                      <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32 text-foreground">
                        {testResult.data}
                      </pre>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => handleTest(ep)}
                      disabled={testingId === ep.id}
                    >
                      {testingId === ep.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ep)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(ep.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Switch checked={ep.enabled} onCheckedChange={(v) => handleToggle(ep.id, v)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEndpoint ? "Edit API Source" : "Add API Source"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input placeholder="e.g. Product Catalog API" value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>Endpoint URL</Label>
              <Input placeholder="https://api.example.com/data" value={formUrl} onChange={e => setFormUrl(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>HTTP Method</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Response Path</Label>
                <Input placeholder="e.g. data.results" value={formResponsePath} onChange={e => setFormResponsePath(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Dot-notation to extract data from JSON response</p>
              </div>
            </div>

            {/* Headers */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Headers</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFormHeaders([...formHeaders, { key: "", value: "" }])}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {formHeaders.map((h, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <Input placeholder="Key" value={h.key} onChange={e => {
                    const updated = [...formHeaders];
                    updated[i].key = e.target.value;
                    setFormHeaders(updated);
                  }} className="flex-1" />
                  <Input placeholder="Value" value={h.value} onChange={e => {
                    const updated = [...formHeaders];
                    updated[i].value = e.target.value;
                    setFormHeaders(updated);
                  }} className="flex-1" />
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setFormHeaders(formHeaders.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {formMethod === "POST" && (
              <div>
                <Label>Query Template (POST body)</Label>
                <Textarea
                  placeholder={'{"query": "{{caller_name}}"}'}
                  value={formQueryTemplate}
                  onChange={e => setFormQueryTemplate(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use {"{{caller_name}}"} and {"{{phone}}"} as placeholders
                </p>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving || !formName.trim() || !formUrl.trim()} className="w-full">
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editingEndpoint ? "Update" : "Add"} API Source
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
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
  const [uploadOpen, setUploadOpen] = useState(false);

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

      {projectId && <LearningProgressBar entries={entries} projectId={projectId} />}

      <Tabs defaultValue="all">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
          {CATEGORIES.map(c => {
            const count = entries.filter(e => e.category === c.value).length;
            return count > 0 ? (
              <TabsTrigger key={c.value} value={c.value}>
                {c.icon} {c.label} ({count})
              </TabsTrigger>
            ) : null;
          })}
          <TabsTrigger value="api_sources">🔌 API Sources</TabsTrigger>
        </TabsList>

        {/* Knowledge category tabs */}
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

        {/* API Sources tab */}
        <TabsContent value="api_sources" className="mt-4">
          {projectId && <ApiSourcesTab projectId={projectId} />}
        </TabsContent>
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

      {projectId && (
        <UploadSourcesDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          projectId={projectId}
          onIngested={fetchData}
        />
      )}
    </div>
  );
}
