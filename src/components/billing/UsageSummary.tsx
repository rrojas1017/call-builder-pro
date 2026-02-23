import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { DollarSign, Clock, Phone, TrendingDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Period = "today" | "7d" | "30d" | "all";

interface UsageStats {
  totalSpend: number;
  totalMinutes: number;
  avgPerMinute: number;
  callCount: number;
}

interface AgentBreakdown {
  projectId: string;
  projectName: string;
  totalCost: number;
  totalMinutes: number;
  callCount: number;
}

export default function UsageSummary() {
  const { activeOrgId } = useOrgContext();
  const [period, setPeriod] = useState<Period>("30d");
  const [stats, setStats] = useState<UsageStats>({ totalSpend: 0, totalMinutes: 0, avgPerMinute: 0, callCount: 0 });
  const [agents, setAgents] = useState<AgentBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) return;
    loadUsage();
  }, [activeOrgId, period]);

  const getDateFilter = () => {
    const now = new Date();
    if (period === "today") {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (period === "7d") {
      return new Date(now.getTime() - 7 * 86400000).toISOString();
    } else if (period === "30d") {
      return new Date(now.getTime() - 30 * 86400000).toISOString();
    }
    return null;
  };

  const loadUsage = async () => {
    setLoading(true);
    let query = supabase
      .from("calls")
      .select("cost_estimate_usd, duration_seconds, project_id")
      .eq("org_id", activeOrgId!)
      .not("cost_estimate_usd", "is", null);

    const dateFilter = getDateFilter();
    if (dateFilter) {
      query = query.gte("started_at", dateFilter);
    }

    const { data: calls } = await query;

    if (!calls || calls.length === 0) {
      setStats({ totalSpend: 0, totalMinutes: 0, avgPerMinute: 0, callCount: 0 });
      setAgents([]);
      setLoading(false);
      return;
    }

    let totalSpend = 0;
    let totalSeconds = 0;
    const agentMap: Record<string, { cost: number; seconds: number; count: number }> = {};

    for (const c of calls) {
      const cost = Number(c.cost_estimate_usd) || 0;
      const dur = c.duration_seconds || 0;
      totalSpend += cost;
      totalSeconds += dur;
      const pid = c.project_id;
      if (!agentMap[pid]) agentMap[pid] = { cost: 0, seconds: 0, count: 0 };
      agentMap[pid].cost += cost;
      agentMap[pid].seconds += dur;
      agentMap[pid].count += 1;
    }

    const totalMinutes = totalSeconds / 60;
    setStats({
      totalSpend,
      totalMinutes,
      avgPerMinute: totalMinutes > 0 ? totalSpend / totalMinutes : 0,
      callCount: calls.length,
    });

    // Fetch project names
    const projectIds = Object.keys(agentMap);
    const { data: projects } = await supabase
      .from("agent_projects")
      .select("id, name")
      .in("id", projectIds);

    const nameMap: Record<string, string> = {};
    (projects || []).forEach((p) => (nameMap[p.id] = p.name));

    setAgents(
      projectIds.map((pid) => ({
        projectId: pid,
        projectName: nameMap[pid] || "Unknown Agent",
        totalCost: agentMap[pid].cost,
        totalMinutes: agentMap[pid].seconds / 60,
        callCount: agentMap[pid].count,
      })).sort((a, b) => b.totalCost - a.totalCost)
    );

    setLoading(false);
  };

  const periods: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
    { key: "all", label: "All Time" },
  ];

  const kpis = [
    { label: "Total Spend", value: `$${stats.totalSpend.toFixed(2)}`, icon: DollarSign },
    { label: "Total Minutes", value: stats.totalMinutes.toFixed(1), icon: Clock },
    { label: "Avg $/Min", value: `$${stats.avgPerMinute.toFixed(3)}`, icon: TrendingDown },
    { label: "Calls Made", value: stats.callCount.toString(), icon: Phone },
  ];

  if (loading && stats.callCount === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Usage Summary</h2>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="surface-elevated rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <kpi.icon className="h-3.5 w-3.5" />
              {kpi.label}
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {agents.length > 0 && (
        <div className="surface-elevated rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Minutes</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.projectId}>
                  <TableCell className="font-medium">{a.projectName}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{a.callCount}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{a.totalMinutes.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono font-medium text-red-400">
                    ${a.totalCost.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
