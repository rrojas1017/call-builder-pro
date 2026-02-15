import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Phone, CheckCircle, Star, BookOpen, GitBranch, Wrench, Mic, Radio } from "lucide-react";

const maturityConfig: Record<string, { label: string; percent: number; barClass: string; textClass: string }> = {
  training: { label: "Training", percent: 10, barClass: "bg-muted-foreground/40", textClass: "text-muted-foreground" },
  developing: { label: "Developing", percent: 30, barClass: "bg-blue-500", textClass: "text-blue-400" },
  competent: { label: "Competent", percent: 55, barClass: "bg-amber-500", textClass: "text-amber-400" },
  expert: { label: "Expert", percent: 80, barClass: "bg-emerald-500", textClass: "text-emerald-400" },
  graduated: { label: "Graduated", percent: 100, barClass: "bg-purple-500", textClass: "text-purple-400" },
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
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="flex justify-between gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const statItems = [
    { label: "Total", value: stats.totalCalls, icon: Phone },
    { label: "Qualified", value: stats.qualifiedCalls, icon: CheckCircle },
    { label: "Avg Score", value: stats.avgScore !== null ? `${stats.avgScore}/100` : "N/A", icon: Star },
    { label: "Knowledge", value: stats.knowledgeEntries, icon: BookOpen },
    { label: "Version", value: `v${stats.specVersion}`, icon: GitBranch },
    { label: "Improv.", value: stats.improvementsCount, icon: Wrench },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
          {/* Row 1: Maturity bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${maturity.barClass}`}
                style={{ width: `${maturity.percent}%` }}
              />
            </div>
            <span className={`text-xs font-medium whitespace-nowrap ${maturity.textClass}`}>
              {maturity.label} {maturity.percent}%
            </span>
          </div>

          {/* Row 2: Stats */}
          <div className="grid grid-cols-6 gap-1">
            {statItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="text-center space-y-0.5">
                  <Icon className="h-3 w-3 mx-auto text-muted-foreground" />
                  <p className="text-xs font-semibold text-foreground leading-none">{item.value}</p>
                  <p className="text-[9px] text-muted-foreground leading-none">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-80 space-y-3" side="bottom" align="start">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className={`text-[10px] px-1.5 py-0 ${maturity.textClass}`} variant="outline">
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
        </div>

        <div className="grid grid-cols-3 gap-3 pt-1">
          {statItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground leading-none">{item.value}</p>
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
