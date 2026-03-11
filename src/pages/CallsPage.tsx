import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import USMapChart, { type StateMetrics, type MapMetric } from "@/components/USMapChart";
import { phoneToState } from "@/lib/areaCodeToState";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Phone, ChevronRight, Zap, AlertTriangle, CheckCircle2,
  TrendingUp, PhoneIncoming, PhoneOutgoing, Search, X, Download,
  Clock, Target, BarChart3, Bot, User, Play, ChevronDown,
} from "lucide-react";
import { downloadRecordingMp3 } from "@/lib/recordingDownload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Call {
  id: string;
  retell_call_id: string | null;
  voice_provider: string;
  direction: string;
  outcome: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  transcript: string | null;
  extracted_data: any;
  summary: any;
  evaluation: any;
  project_id: string;
  recording_url: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  contacts?: { phone: string } | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

type DirFilter = "all" | "inbound" | "outbound";
type ScoreFilter = "all" | "80+" | "50-79" | "<50";
type DurationFilter = "all" | "30s+" | "1min+" | "5min+";

// ─── Demo state data (remove when real campaign data is sufficient) ─────────
const USE_MOCK_MAP_DATA = true;
const DEMO_STATE_DATA: Record<string, StateMetrics> = {
  CA: { calls: 47, conversionRate: 34, avgScore: 78, avgDuration: 185 },
  TX: { calls: 38, conversionRate: 42, avgScore: 82, avgDuration: 210 },
  NY: { calls: 31, conversionRate: 28, avgScore: 71, avgDuration: 155 },
  FL: { calls: 29, conversionRate: 51, avgScore: 85, avgDuration: 240 },
  IL: { calls: 18, conversionRate: 22, avgScore: 65, avgDuration: 120 },
  PA: { calls: 15, conversionRate: 38, avgScore: 74, avgDuration: 175 },
  OH: { calls: 14, conversionRate: 31, avgScore: 69, avgDuration: 140 },
  GA: { calls: 12, conversionRate: 45, avgScore: 80, avgDuration: 195 },
  NC: { calls: 11, conversionRate: 36, avgScore: 76, avgDuration: 160 },
  MI: { calls: 10, conversionRate: 19, avgScore: 58, avgDuration: 95 },
  NJ: { calls: 9, conversionRate: 55, avgScore: 88, avgDuration: 260 },
  VA: { calls: 8, conversionRate: 40, avgScore: 73, avgDuration: 150 },
  WA: { calls: 7, conversionRate: 48, avgScore: 81, avgDuration: 200 },
  AZ: { calls: 6, conversionRate: 33, avgScore: 70, avgDuration: 130 },
  CO: { calls: 5, conversionRate: 60, avgScore: 91, avgDuration: 280 },
  MN: { calls: 4, conversionRate: 25, avgScore: 62, avgDuration: 110 },
  MO: { calls: 3, conversionRate: 67, avgScore: 84, avgDuration: 220 },
  TN: { calls: 3, conversionRate: 33, avgScore: 72, avgDuration: 145 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

function relTime(date: string): string {
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }); }
  catch { return date; }
}

const OUTCOME_COLORS: Record<string, string> = {
  qualified: "bg-primary/15 text-primary border-primary/30",
  completed: "bg-green-500/15 text-green-500 border-green-500/30",
  voicemail: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  left_message: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  no_answer: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  busy: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  disqualified: "bg-muted text-muted-foreground border-border",
};

// ─── Transcript Parser ───────────────────────────────────────────────────────

interface ChatLine { id: string; role: "agent" | "caller"; text: string }

function parseTranscript(raw: string | null): ChatLine[] {
  if (!raw) return [];
  const lines: ChatLine[] = [];
  const segments = raw.split("\n").filter(s => s.trim());
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const colonIdx = seg.indexOf(":");
    if (colonIdx === -1) continue;
    const speaker = seg.slice(0, colonIdx).trim().toLowerCase();
    const text = seg.slice(colonIdx + 1).trim();
    if (!text) continue;
    lines.push({
      id: `line-${i}`,
      role: speaker === "agent" || speaker === "assistant" || speaker === "bot" ? "agent" : "caller",
      text,
    });
  }
  return lines;
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

function exportCSV(calls: Call[], agentMap: Record<string, string>, campaignMap: Record<string, string>) {
  const headers = ["ID", "Agent", "Campaign", "Direction", "Outcome", "Duration (s)", "Score", "Provider", "Created At"];
  const rows = calls.map(c => [
    c.id,
    agentMap[c.project_id] || "Unknown",
    c.campaign_id ? (campaignMap[c.campaign_id] || "") : "",
    c.direction,
    c.outcome || "",
    c.duration_seconds ?? "",
    c.evaluation?.overall_score ?? "",
    c.voice_provider === "retell" ? "Append" : "Voz",
    c.created_at,
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `calls-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ─────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function CallsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Data
  const [calls, setCalls] = useState<Call[]>([]);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  // UI State
  const [selected, setSelected] = useState<Call | null>(null);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [appliedSet, setAppliedSet] = useState<Set<string>>(new Set());
  const [ignoredSet, setIgnoredSet] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [mapMetric, setMapMetric] = useState<MapMetric>("calls");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Audio
  const [playbackRate, setPlaybackRate] = useState(1);

  // ─── Improvement helpers ──────────────────────────────────────────────────
  const normalizeField = (field: string) =>
    field.trim().replace(/\s*\(.*\)$/, "").replace(/\//g, ".").trim();

  const improvementKey = (imp: any) =>
    normalizeField(imp.field) + "::" + JSON.stringify(imp.suggested_value);

  // ─── Fetch applied improvements for selected call ─────────────────────────
  useEffect(() => {
    if (!selected?.evaluation?.recommended_improvements?.length) {
      setAppliedSet(new Set());
      return;
    }
    const fetchApplied = async () => {
      const { data } = await supabase
        .from("improvements")
        .select("patch, source_recommendation")
        .eq("project_id", selected.project_id);
      const keys = new Set<string>();
      (data || []).forEach((row: any) => {
        if (row.source_recommendation) {
          keys.add(row.source_recommendation);
        }
        if (row.patch && typeof row.patch === "object") {
          Object.keys(row.patch).filter(k => k !== "version").forEach(k => {
            keys.add(k + "::" + JSON.stringify(row.patch[k]));
          });
        }
      });
      setAppliedSet(keys);
    };
    fetchApplied();
  }, [selected]);

  // ─── Fetch calls + agents ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [callsRes, agentsRes, campaignsRes] = await Promise.all([
        supabase
          .from("calls")
          .select("*, contacts(phone)")
          .order("created_at", { ascending: false })
          .range(0, PAGE_SIZE - 1),
        supabase.from("agent_projects").select("id, name"),
        supabase.from("campaigns").select("id, name, status").order("created_at", { ascending: false }),
      ]);

      const callData = (callsRes.data as Call[]) || [];
      setCalls(callData);
      setHasMore(callData.length === PAGE_SIZE);

      const map: Record<string, string> = {};
      (agentsRes.data || []).forEach((a: any) => { map[a.id] = a.name; });
      setAgentMap(map);

      const campaignData = (campaignsRes.data || []).filter(
        (c: any) => c.status !== "draft"
      ) as Campaign[];
      setCampaigns(campaignData);

      setLoading(false);
    };
    load();
  }, [user]);

  // ─── Load more ────────────────────────────────────────────────────────────
  const loadMore = async () => {
    const { data } = await supabase
      .from("calls")
      .select("*, contacts(phone)")
      .order("created_at", { ascending: false })
      .range(calls.length, calls.length + PAGE_SIZE - 1);
    const more = (data as Call[]) || [];
    setCalls(prev => [...prev, ...more]);
    setHasMore(more.length === PAGE_SIZE);
  };

  // ─── Apply improvement ────────────────────────────────────────────────────
  const handleApplyImprovement = async (improvement: any, idx: number) => {
    if (!selected) return;
    setApplyingIdx(idx);
    try {
      const { data, error } = await supabase.functions.invoke("apply-improvement", {
        body: {
          project_id: selected.project_id,
          improvement: {
            ...improvement,
            original_key: improvementKey(improvement),
          },
        },
      });
      if (error) throw error;
      const desc = data.caution
        ? `v${data.from_version} → v${data.to_version} — ⚠️ ${data.caution}`
        : `v${data.from_version} → v${data.to_version}: ${data.change_summary}`;
      toast({ title: "Improvement Applied", description: desc });
      setAppliedSet(prev => new Set(prev).add(improvementKey(improvement)));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setApplyingIdx(null);
    }
  };

  // ─── Derive state per call ────────────────────────────────────────────────
  const callStateMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    calls.forEach(c => {
      map[c.id] = phoneToState((c.contacts as any)?.phone);
    });
    return map;
  }, [calls]);

  // ─── Filtered calls ──────────────────────────────────────────────────────
  const campaignMap = useMemo(() => {
    const m: Record<string, string> = {};
    campaigns.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [campaigns]);

  const filteredCalls = useMemo(() => {
    return calls.filter(c => {
      if (campaignFilter !== "all" && c.campaign_id !== campaignFilter) return false;
      if (dirFilter !== "all" && c.direction !== dirFilter) return false;
      if (selectedState && callStateMap[c.id] !== selectedState) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTranscript = c.transcript?.toLowerCase().includes(q);
        const matchAgent = agentMap[c.project_id]?.toLowerCase().includes(q);
        if (!matchTranscript && !matchAgent) return false;
      }
      if (scoreFilter !== "all") {
        const score = c.evaluation?.overall_score;
        if (score == null) return false;
        if (scoreFilter === "80+" && score < 80) return false;
        if (scoreFilter === "50-79" && (score < 50 || score >= 80)) return false;
        if (scoreFilter === "<50" && score >= 50) return false;
      }
      if (durationFilter !== "all") {
        const d = c.duration_seconds ?? 0;
        if (durationFilter === "30s+" && d < 30) return false;
        if (durationFilter === "1min+" && d < 60) return false;
        if (durationFilter === "5min+" && d < 300) return false;
      }
      return true;
    });
  }, [calls, campaignFilter, dirFilter, selectedState, searchQuery, scoreFilter, durationFilter, callStateMap, agentMap]);

  // ─── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filteredCalls.length;
    const durations = filteredCalls.map(c => c.duration_seconds).filter((d): d is number => d != null);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const scores = filteredCalls.map(c => c.evaluation?.overall_score).filter((s): s is number => s != null);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const qualified = filteredCalls.filter(c => c.outcome === "qualified").length;
    const conversionRate = total > 0 ? (qualified / total) * 100 : 0;
    return { total, avgDuration, avgScore, conversionRate };
  }, [filteredCalls]);

  // ─── State metrics for map ────────────────────────────────────────────────
  const stateMetrics = useMemo(() => {
    const map: Record<string, { calls: number; qualified: number; scores: number[]; durations: number[] }> = {};
    filteredCalls.forEach(c => {
      const st = callStateMap[c.id];
      if (!st) return;
      if (!map[st]) map[st] = { calls: 0, qualified: 0, scores: [], durations: [] };
      map[st].calls++;
      if (c.outcome === "qualified") map[st].qualified++;
      if (c.evaluation?.overall_score != null) map[st].scores.push(c.evaluation.overall_score);
      if (c.duration_seconds != null) map[st].durations.push(c.duration_seconds);
    });
    const result: Record<string, StateMetrics> = {};
    Object.entries(map).forEach(([st, d]) => {
      result[st] = {
        calls: d.calls,
        conversionRate: d.calls > 0 ? (d.qualified / d.calls) * 100 : 0,
        avgScore: d.scores.length > 0 ? d.scores.reduce((a, b) => a + b, 0) / d.scores.length : null,
        avgDuration: d.durations.length > 0 ? d.durations.reduce((a, b) => a + b, 0) / d.durations.length : 0,
      };
    });
    // Merge demo data for states without real calls
    if (USE_MOCK_MAP_DATA) {
      Object.entries(DEMO_STATE_DATA).forEach(([st, demo]) => {
        if (!result[st]) result[st] = demo;
      });
    }
    return result;
  }, [filteredCalls, callStateMap]);

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const eval_ = selected?.evaluation;

  return (
    <div className="flex h-full flex-col">
      {/* ── Analytics Header (hidden when detail open) ── */}
      {!selected && (
        <div className="p-6 space-y-4 border-b border-border">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard icon={Phone} label="Total Calls" value={String(stats.total)} />
            <StatCard icon={Clock} label="Avg Duration" value={fmtDuration(stats.avgDuration)} />
            <StatCard
              icon={TrendingUp}
              label="Avg Score"
              value={stats.avgScore != null ? `${stats.avgScore.toFixed(0)}%` : "—"}
              valueClass={stats.avgScore != null ? (stats.avgScore >= 80 ? "text-green-500" : stats.avgScore >= 50 ? "text-yellow-500" : "text-destructive") : ""}
            />
            <StatCard icon={Target} label="Conversion" value={`${stats.conversionRate.toFixed(1)}%`} />
          </div>

          {/* Map */}
          <div className="relative">
            {USE_MOCK_MAP_DATA && (
              <Badge variant="secondary" className="absolute top-2 right-2 z-10 text-[10px] opacity-70">
                Demo data
              </Badge>
            )}
          <USMapChart
            stateData={stateMetrics}
            metric={mapMetric}
            onMetricChange={setMapMetric}
            selectedState={selectedState}
            onStateClick={setSelectedState}
          />
          </div>
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="p-4 border-b border-border space-y-3">
        {selectedState && (
          <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary rounded-lg px-3 py-2">
            Showing calls from <strong>{selectedState}</strong>
            <button onClick={() => setSelectedState(null)} className="ml-auto hover:text-primary/80">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transcripts or agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          {campaigns.length > 0 && (
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="h-9 w-[180px] text-xs">
                <SelectValue placeholder="All Campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      {c.name}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {c.status}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Tabs value={dirFilter} onValueChange={(v) => setDirFilter(v as DirFilter)}>
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="outbound" className="text-xs gap-1"><PhoneOutgoing className="h-3 w-3" />Out</TabsTrigger>
              <TabsTrigger value="inbound" className="text-xs gap-1"><PhoneIncoming className="h-3 w-3" />In</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={scoreFilter} onValueChange={(v) => setScoreFilter(v as ScoreFilter)}>
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs">Score</TabsTrigger>
              <TabsTrigger value="80+" className="text-xs">80+</TabsTrigger>
              <TabsTrigger value="50-79" className="text-xs">50-79</TabsTrigger>
              <TabsTrigger value="<50" className="text-xs">&lt;50</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={durationFilter} onValueChange={(v) => setDurationFilter(v as DurationFilter)}>
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs">Dur</TabsTrigger>
              <TabsTrigger value="30s+" className="text-xs">30s+</TabsTrigger>
              <TabsTrigger value="1min+" className="text-xs">1m+</TabsTrigger>
              <TabsTrigger value="5min+" className="text-xs">5m+</TabsTrigger>
            </TabsList>
          </Tabs>
          {!selected && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => exportCSV(filteredCalls, agentMap, campaignMap)}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          )}
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="flex flex-1 min-h-0">
        {/* Call List */}
        <div className={cn("border-r border-border overflow-y-auto", selected ? "w-96" : "w-full")}>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{filteredCalls.length} calls</p>
          </div>
          {filteredCalls.length === 0 ? (
            <div className="p-12 text-center">
              <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No calls match your filters.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {filteredCalls.map((call) => (
                  <button
                    key={call.id}
                    onClick={() => setSelected(call)}
                    className={cn(
                      "w-full p-4 text-left hover:bg-muted/50 transition-colors flex items-center justify-between gap-3",
                      selected?.id === call.id && "bg-muted/50"
                    )}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {call.direction === "inbound" ? <PhoneIncoming className="h-3 w-3 text-primary shrink-0" /> : <PhoneOutgoing className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <span className="text-sm font-medium text-foreground truncate">{agentMap[call.project_id] || "Unknown Agent"}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">{call.voice_provider === "retell" ? "Append" : "Voz"}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        {call.outcome && (
                          <span className={cn("inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium", OUTCOME_COLORS[call.outcome] || "bg-muted text-muted-foreground border-border")}>
                            {call.outcome}
                          </span>
                        )}
                        <span className="text-muted-foreground">{fmtDuration(call.duration_seconds)}</span>
                        {call.evaluation?.overall_score != null && (
                          <span className={cn("font-medium", call.evaluation.overall_score >= 80 ? "text-green-500" : call.evaluation.overall_score >= 50 ? "text-yellow-500" : "text-destructive")}>
                            {call.evaluation.overall_score}%
                          </span>
                        )}
                        <span className="text-muted-foreground">{relTime(call.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
              {hasMore && (
                <div className="p-4 text-center">
                  <Button variant="outline" size="sm" onClick={loadMore}>Load More</Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Detail Panel ── */}
        {selected && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">{agentMap[selected.project_id] || "Call Detail"}</h2>
                <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                  {selected.direction === "inbound" ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}
                  {selected.direction} · {relTime(selected.created_at)}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:text-foreground">Close</button>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="surface-elevated rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Outcome</p>
                <p className="text-sm font-semibold text-foreground">{selected.outcome || "pending"}</p>
              </div>
              <div className="surface-elevated rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-semibold text-foreground">{fmtDuration(selected.duration_seconds)}</p>
              </div>
              <ScoreCard label="Score" score={selected.evaluation?.overall_score} />
            </div>

            {/* Call Timeline */}
            <div className="surface-elevated rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Timeline</p>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                  <span className="text-muted-foreground mt-1">Created</span>
                  <span className="text-foreground font-mono">{new Date(selected.created_at).toLocaleTimeString()}</span>
                </div>
                <div className="flex-1 h-px bg-border" />
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground mt-1">Started</span>
                  <span className="text-foreground font-mono">{selected.started_at ? new Date(selected.started_at).toLocaleTimeString() : "—"}</span>
                </div>
                <div className="flex-1 h-px bg-border" />
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground mt-1">Ended</span>
                  <span className="text-foreground font-mono">{selected.ended_at ? new Date(selected.ended_at).toLocaleTimeString() : "—"}</span>
                </div>
                {selected.duration_seconds != null && (
                  <Badge variant="outline" className="ml-2">{fmtDuration(selected.duration_seconds)}</Badge>
                )}
              </div>
            </div>

            {/* Audio Player */}
            {selected.recording_url && (
              <div className="surface-elevated rounded-lg p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Play className="h-3 w-3" /> Recording
                </p>
                <audio
                  src={selected.recording_url}
                  controls
                  className="w-full h-10"
                  onRateChange={(e) => setPlaybackRate((e.target as HTMLAudioElement).playbackRate)}
                />
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[1, 1.25, 1.5, 2].map(rate => (
                      <Button
                        key={rate}
                        variant={playbackRate === rate ? "default" : "outline"}
                        size="sm"
                        className="text-xs px-2 h-7"
                        onClick={() => {
                          const audio = document.querySelector("audio");
                          if (audio) { audio.playbackRate = rate; setPlaybackRate(rate); }
                        }}
                      >
                        {rate}x
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 ml-auto"
                    onClick={() => downloadRecordingMp3(selected.recording_url!, `call-${selected.id}.mp3`)}
                  >
                    <Download className="mr-1 h-3 w-3" /> MP3
                  </Button>
                </div>
              </div>
            )}

            {/* Evaluation */}
            {eval_ && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Evaluation
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <ScoreCard label="Compliance" score={eval_.compliance_score} />
                  <ScoreCard label="Objective" score={eval_.objective_score} />
                  <ScoreCard label="Overall" score={eval_.overall_score} />
                </div>

                {eval_.voice_recommendation && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-primary flex items-center gap-1">🎙️ Voice Recommendation</p>
                      {eval_.voice_recommendation.source === "cross_agent" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">Platform-wide</span>
                      )}
                      {eval_.voice_recommendation.confidence && (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          eval_.voice_recommendation.confidence === "high" ? "bg-green-500/15 text-green-500" :
                          eval_.voice_recommendation.confidence === "medium" ? "bg-yellow-500/15 text-yellow-500" :
                          "bg-muted text-muted-foreground"
                        )}>{eval_.voice_recommendation.confidence} confidence</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground">{eval_.voice_recommendation.reason}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">Current: <strong>{eval_.voice_recommendation.current_voice}</strong> ({eval_.voice_recommendation.current_avg_humanness})</span>
                      <span className="text-primary">→ <strong>{eval_.voice_recommendation.suggested_voice}</strong> ({eval_.voice_recommendation.suggested_avg_humanness})</span>
                      {eval_.voice_recommendation.sample_size && (
                        <span className="text-muted-foreground">({eval_.voice_recommendation.sample_size} calls)</span>
                      )}
                    </div>
                  </div>
                )}

                {eval_.hallucination_detected && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4" /> Hallucination detected in this call
                  </div>
                )}

                {eval_.issues_detected?.length > 0 && (
                  <div className="surface-elevated rounded-lg p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Issues Detected</p>
                    <ul className="space-y-1">
                      {eval_.issues_detected.map((issue: string, i: number) => (
                        <li key={i} className="text-sm text-foreground flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 text-yellow-500 mt-1 shrink-0" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {eval_.recommended_improvements?.length > 0 && (
                  <div className="surface-elevated rounded-lg p-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recommended Improvements</p>
                    {[...eval_.recommended_improvements]
                      .sort((a: any, b: any) => {
                        const order: Record<string, number> = { critical: 0, important: 1, minor: 2 };
                        return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
                      })
                      .map((imp: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-foreground"><strong>{imp.field}:</strong> {imp.reason}</p>
                          <SeverityBadge severity={imp.severity} />
                        </div>
                        {imp.suggested_value && (
                          <p className="text-xs text-muted-foreground">Suggested: {typeof imp.suggested_value === "object" ? JSON.stringify(imp.suggested_value) : imp.suggested_value}</p>
                        )}
                        {appliedSet.has(improvementKey(imp)) ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-500">
                            <CheckCircle2 className="h-3 w-3" /> Applied
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" disabled={applyingIdx === i} onClick={() => handleApplyImprovement(imp, i)}>
                            {applyingIdx === i ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Zap className="mr-2 h-3 w-3" />}
                            Apply Improvement
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chat-style Transcript */}
            {selected.transcript && (
              <div className="surface-elevated rounded-lg p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcript</p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {parseTranscript(selected.transcript).length > 0 ? (
                    parseTranscript(selected.transcript).map(line => (
                      <div key={line.id} className={`flex gap-2 items-start ${line.role === "agent" ? "" : "flex-row-reverse"}`}>
                        <div className={`flex-shrink-0 rounded-full p-1.5 ${line.role === "agent" ? "bg-primary/10" : "bg-muted"}`}>
                          {line.role === "agent" ? <Bot className="h-3 w-3 text-primary" /> : <User className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        <div className={cn("rounded-lg px-3 py-2 text-sm max-w-[80%]", line.role === "agent" ? "bg-primary/10 text-foreground" : "bg-muted text-foreground")}>
                          {line.text}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selected.transcript}</p>
                  )}
                </div>
              </div>
            )}

            {/* Extracted Data */}
            {selected.extracted_data && (
              <Collapsible>
                <div className="surface-elevated rounded-lg p-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Extracted Data</p>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="text-xs text-foreground font-mono whitespace-pre-wrap mt-3">
                      {JSON.stringify(selected.extracted_data, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, valueClass }: { icon: any; label: string; value: string; valueClass?: string }) {
  return (
    <div className="surface-elevated rounded-lg p-4 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold text-foreground", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number | undefined }) {
  if (score == null) return (
    <div className="surface-elevated rounded-lg p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-muted-foreground">—</p>
    </div>
  );
  const color = score >= 80 ? "text-green-500" : score >= 50 ? "text-yellow-500" : "text-destructive";
  return (
    <div className="surface-elevated rounded-lg p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold", color)}>{score}%</p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity) return null;
  const styles: Record<string, string> = {
    critical: "bg-destructive/15 text-destructive border-destructive/30",
    important: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    minor: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${styles[severity] || styles.minor}`}>
      {severity}
    </span>
  );
}
