import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Clock, Phone, TrendingUp, AlertTriangle, Building2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Period = "today" | "7d" | "30d" | "all";

interface OrgCostRow {
  orgId: string;
  orgName: string;
  totalCost: number;
  totalMinutes: number;
  callCount: number;
  avgPerMinute: number;
}

interface PlatformStats {
  totalSpend: number;
  totalMinutes: number;
  totalCalls: number;
  avgPerMinute: number;
  orgCount: number;
}

const DEFAULT_THRESHOLD = 500; // USD

export default function CostAuditsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [stats, setStats] = useState<PlatformStats>({ totalSpend: 0, totalMinutes: 0, totalCalls: 0, avgPerMinute: 0, orgCount: 0 });
  const [orgs, setOrgs] = useState<OrgCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadCosts();
  }, [period]);

  const getDateFilter = () => {
    const now = new Date();
    if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (period === "7d") return new Date(now.getTime() - 7 * 86400000).toISOString();
    if (period === "30d") return new Date(now.getTime() - 30 * 86400000).toISOString();
    return null;
  };

  const loadCosts = async () => {
    setLoading(true);

    let query = supabase
      .from("calls")
      .select("cost_estimate_usd, duration_seconds, org_id")
      .not("cost_estimate_usd", "is", null);

    const dateFilter = getDateFilter();
    if (dateFilter) query = query.gte("started_at", dateFilter);

    const { data: calls } = await query;

    if (!calls || calls.length === 0) {
      setStats({ totalSpend: 0, totalMinutes: 0, totalCalls: 0, avgPerMinute: 0, orgCount: 0 });
      setOrgs([]);
      setLoading(false);
      return;
    }

    const orgMap: Record<string, { cost: number; seconds: number; count: number }> = {};
    let totalSpend = 0;
    let totalSeconds = 0;

    for (const c of calls) {
      const cost = Number(c.cost_estimate_usd) || 0;
      const dur = c.duration_seconds || 0;
      totalSpend += cost;
      totalSeconds += dur;
      const oid = c.org_id;
      if (!orgMap[oid]) orgMap[oid] = { cost: 0, seconds: 0, count: 0 };
      orgMap[oid].cost += cost;
      orgMap[oid].seconds += dur;
      orgMap[oid].count += 1;
    }

    const totalMinutes = totalSeconds / 60;
    const orgIds = Object.keys(orgMap);

    const { data: organizations } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);

    const nameMap: Record<string, string> = {};
    (organizations || []).forEach((o) => (nameMap[o.id] = o.name));

    const orgRows: OrgCostRow[] = orgIds
      .map((oid) => ({
        orgId: oid,
        orgName: nameMap[oid] || "Unknown",
        totalCost: orgMap[oid].cost,
        totalMinutes: orgMap[oid].seconds / 60,
        callCount: orgMap[oid].count,
        avgPerMinute: orgMap[oid].seconds > 0 ? orgMap[oid].cost / (orgMap[oid].seconds / 60) : 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    setStats({
      totalSpend,
      totalMinutes,
      totalCalls: calls.length,
      avgPerMinute: totalMinutes > 0 ? totalSpend / totalMinutes : 0,
      orgCount: orgIds.length,
    });
    setOrgs(orgRows);
    setLoading(false);
  };

  const periods: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
    { key: "all", label: "All Time" },
  ];

  const kpis = [
    { label: "Platform Spend", value: `$${stats.totalSpend.toFixed(2)}`, icon: DollarSign, color: "text-red-400" },
    { label: "Total Minutes", value: stats.totalMinutes.toFixed(1), icon: Clock, color: "text-blue-400" },
    { label: "Avg $/Min", value: `$${stats.avgPerMinute.toFixed(3)}`, icon: TrendingUp, color: "text-amber-400" },
    { label: "Total Calls", value: stats.totalCalls.toString(), icon: Phone, color: "text-emerald-400" },
    { label: "Active Orgs", value: stats.orgCount.toString(), icon: Building2, color: "text-purple-400" },
  ];

  const filteredOrgs = orgs.filter((o) =>
    o.orgName.toLowerCase().includes(search.toLowerCase())
  );

  const overThreshold = orgs.filter((o) => o.totalCost >= threshold);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cost Audits</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform-wide cost visibility across all organizations</p>
      </div>

      {/* Period selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Alert threshold:</span>
          <div className="relative">
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 0)}
              className="w-28 pl-7 h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading cost data...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="surface-elevated rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                  {kpi.label}
                </div>
                <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Threshold alerts */}
          {overThreshold.length > 0 && (
            <div className="surface-elevated rounded-xl p-4 border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-foreground">
                  {overThreshold.length} org{overThreshold.length > 1 ? "s" : ""} over ${threshold} threshold
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {overThreshold.map((o) => (
                  <Badge key={o.orgId} variant="outline" className="border-amber-500/40 text-amber-400">
                    {o.orgName}: ${o.totalCost.toFixed(2)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Per-org breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Per-Organization Breakdown</h2>
              <Input
                placeholder="Search orgs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 h-8 text-sm"
              />
            </div>
            <div className="surface-elevated rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Minutes</TableHead>
                    <TableHead className="text-right">Avg $/Min</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrgs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {search ? "No matching organizations" : "No cost data for this period"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrgs.map((o) => (
                      <TableRow key={o.orgId}>
                        <TableCell className="font-medium">{o.orgName}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{o.callCount}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{o.totalMinutes.toFixed(1)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">${o.avgPerMinute.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-mono font-medium text-red-400">
                          ${o.totalCost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {o.totalCost >= threshold ? (
                            <Badge variant="destructive" className="text-xs">Over</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
