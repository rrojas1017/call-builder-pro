import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, CheckCircle, Star, BookOpen, GitBranch, Wrench, Mic, Radio } from "lucide-react";

const maturityConfig: Record<string, { label: string; className: string; bgClassName: string }> = {
  training: { label: "Training", className: "text-muted-foreground", bgClassName: "bg-muted" },
  developing: { label: "Developing", className: "text-blue-400", bgClassName: "bg-blue-500/10 border-blue-500/20" },
  competent: { label: "Competent", className: "text-amber-400", bgClassName: "bg-amber-500/10 border-amber-500/20" },
  expert: { label: "Expert", className: "text-emerald-400", bgClassName: "bg-emerald-500/10 border-emerald-500/20" },
  graduated: { label: "Graduated", className: "text-purple-400", bgClassName: "bg-purple-500/10 border-purple-500/20" },
};

interface AgentProfileCardProps {
  agentId: string;
  description: string | null;
  maturityLevel: string;
}

interface AgentStats {
  voiceName: string;
  mode: string;
  totalCalls: number;
  qualifiedCalls: number;
  avgScore: number | null;
  knowledgeEntries: number;
  specVersion: number;
  improvementsCount: number;
}

export default function AgentProfileCard({ agentId, description, maturityLevel }: AgentProfileCardProps) {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);

    const fetchStats = async () => {
      const [specRes, callsRes, qualifiedRes, knowledgeRes, improvementsRes] = await Promise.all([
        supabase.from("agent_specs").select("voice_id, mode, version").eq("project_id", agentId).maybeSingle(),
        supabase.from("calls").select("id", { count: "exact", head: true }).eq("project_id", agentId),
        supabase.from("calls").select("id", { count: "exact", head: true }).eq("project_id", agentId).eq("outcome", "qualified"),
        supabase.from("agent_knowledge").select("id", { count: "exact", head: true }).eq("project_id", agentId),
        supabase.from("improvements").select("id", { count: "exact", head: true }).eq("project_id", agentId),
      ]);

      // Fetch avg score separately since we need the actual values
      const { data: scoreCalls } = await supabase
        .from("calls")
        .select("evaluation")
        .eq("project_id", agentId)
        .not("evaluation", "is", null);

      let avgScore: number | null = null;
      if (scoreCalls && scoreCalls.length > 0) {
        const scores = scoreCalls
          .map((c) => {
            const eval_ = c.evaluation as any;
            return eval_?.overall_score ? Number(eval_.overall_score) : null;
          })
          .filter((s): s is number => s !== null);
        if (scores.length > 0) {
          avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
        }
      }

      setStats({
        voiceName: specRes.data?.voice_id || "Maya (default)",
        mode: specRes.data?.mode || "outbound",
        totalCalls: callsRes.count || 0,
        qualifiedCalls: qualifiedRes.count || 0,
        avgScore,
        knowledgeEntries: knowledgeRes.count || 0,
        specVersion: specRes.data?.version || 1,
        improvementsCount: improvementsRes.count || 0,
      });
      setLoading(false);
    };

    fetchStats();
  }, [agentId]);

  const maturity = maturityConfig[maturityLevel] || maturityConfig.training;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const statItems = [
    { label: "Total Calls", value: stats.totalCalls, icon: Phone },
    { label: "Qualified", value: stats.qualifiedCalls, icon: CheckCircle },
    { label: "Avg Score", value: stats.avgScore !== null ? `${stats.avgScore}/100` : "N/A", icon: Star },
    { label: "Knowledge", value: stats.knowledgeEntries, icon: BookOpen },
    { label: "Version", value: `v${stats.specVersion}`, icon: GitBranch },
    { label: "Improvements", value: stats.improvementsCount, icon: Wrench },
  ];

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Row 1: Description, maturity, voice, mode */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={`${maturity.bgClassName} ${maturity.className} border text-xs`}>
          {maturity.label}
        </Badge>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Mic className="h-3 w-3" /> {stats.voiceName}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Radio className="h-3 w-3" /> {stats.mode.charAt(0).toUpperCase() + stats.mode.slice(1)}
        </span>
      </div>
      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      )}

      {/* Row 2: Stats grid */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="text-center space-y-0.5">
              <div className="flex items-center justify-center">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">{item.value}</p>
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
