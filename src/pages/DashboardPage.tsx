import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Bot, Phone, Megaphone, CheckCircle, Loader2, TrendingUp, TrendingDown,
  Clock, DollarSign, BarChart3, ArrowRight, PhoneIncoming, PhoneOutgoing,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { format, subDays, startOfDay, isAfter } from "date-fns";

type Period = "1" | "7" | "30" | "all";

interface CallRow {
  id: string;
  created_at: string;
  direction: string;
  outcome: string | null;
  duration_seconds: number | null;
  cost_estimate_usd: number | null;
  evaluation: any;
  project_id: string;
  campaign_id: string | null;
}

interface AgentRow {
  id: string;
  name: string;
  org_id: string;
}

interface SpecRow {
  project_id: string;
  mode: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  project_id: string;
  created_at: string;
}

interface ContactAgg {
  campaign_id: string;
  status: string;
}

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "Today", value: "1" },
  { label: "7 Days", value: "7" },
  { label: "30 Days", value: "30" },
  { label: "All Time", value: "all" },
];

const OUTCOME_COLORS: Record<string, string> = {
  completed: "hsl(172, 66%, 50%)",
  qualified: "hsl(142, 71%, 45%)",
  disqualified: "hsl(0, 72%, 51%)",
  failed: "hsl(38, 92%, 50%)",
  no_answer: "hsl(215, 12%, 50%)",
  transferred: "hsl(250, 60%, 55%)",
  other: "hsl(220, 14%, 30%)",
};

function getCutoff(period: Period): Date | null {
  if (period === "all") return null;
  return startOfDay(subDays(new Date(), Number(period)));
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ full_name: string; org_id: string } | null>(null);
  const [period, setPeriod] = useState<Period>("7");

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [prevCalls, setPrevCalls] = useState<CallRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [contacts, setContacts] = useState<ContactAgg[]>([]);

  // ── Data Fetching ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, org_id")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      setProfile(prof);
      if (!prof?.org_id) { setLoading(false); return; }

      const cutoff = getCutoff(period);
      const prevCutoff = period !== "all" ? startOfDay(subDays(new Date(), Number(period) * 2)) : null;

      // Build queries
      let callsQ = supabase
        .from("calls")
        .select("id, created_at, direction, outcome, duration_seconds, cost_estimate_usd, evaluation, project_id, campaign_id")
        .eq("org_id", prof.org_id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (cutoff) callsQ = callsQ.gte("created_at", cutoff.toISOString());

      let prevCallsQ = supabase
        .from("calls")
        .select("id, created_at, direction, outcome, duration_seconds, cost_estimate_usd, evaluation, project_id, campaign_id")
        .eq("org_id", prof.org_id)
        .limit(1000);
      if (prevCutoff && cutoff) {
        prevCallsQ = prevCallsQ.gte("created_at", prevCutoff.toISOString()).lt("created_at", cutoff.toISOString());
      }

      const [agentsRes, specsRes, callsRes, prevCallsRes, campaignsRes, contactsRes] = await Promise.all([
        supabase.from("agent_projects").select("id, name, org_id").eq("org_id", prof.org_id),
        supabase.from("agent_specs").select("project_id, mode"),
        callsQ,
        period !== "all" ? prevCallsQ : Promise.resolve({ data: [] as CallRow[] }),
        supabase.from("campaigns").select("id, name, status, project_id, created_at"),
        supabase.from("contacts").select("campaign_id, status"),
      ]);

      if (cancelled) return;
      setAgents(agentsRes.data ?? []);
      setSpecs(specsRes.data ?? []);
      setCalls((callsRes.data as CallRow[]) ?? []);
      setPrevCalls((prevCallsRes.data as CallRow[]) ?? []);
      setCampaigns(campaignsRes.data ?? []);
      setContacts(contactsRes.data ?? []);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [user, period]);

  // ── Derived data ──
  const specMap = useMemo(() => {
    const m: Record<string, string> = {};
    specs.forEach((s) => { m[s.project_id] = s.mode ?? "outbound"; });
    return m;
  }, [specs]);

  const agentNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    agents.forEach((a) => { m[a.id] = a.name; });
    return m;
  }, [agents]);

  // KPIs
  const totalCalls = calls.length;
  const prevTotalCalls = prevCalls.length;
  const outboundCalls = calls.filter((c) => c.direction === "outbound").length;
  const inboundCalls = calls.filter((c) => c.direction === "inbound").length;
  const totalMinutes = Math.round(calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60);
  const totalCost = calls.reduce((s, c) => s + (c.cost_estimate_usd ?? 0), 0);

  const completedCalls = calls.filter((c) => c.outcome === "completed" || c.outcome === "qualified");
  const conversionRate = totalCalls > 0 ? Math.round((completedCalls.length / totalCalls) * 100) : 0;
  const prevCompleted = prevCalls.filter((c) => c.outcome === "completed" || c.outcome === "qualified");
  const prevConvRate = prevTotalCalls > 0 ? Math.round((prevCompleted.length / prevTotalCalls) * 100) : 0;

  const scoredCalls = calls.filter((c) => c.evaluation && typeof (c.evaluation as any)?.overall_score === "number");
  const avgScore = scoredCalls.length > 0
    ? Math.round((scoredCalls.reduce((s, c) => s + ((c.evaluation as any).overall_score ?? 0), 0) / scoredCalls.length) * 10) / 10
    : 0;

  const activeCampaigns = campaigns.filter((c) => c.status === "running" || c.status === "active");

  const callsDelta = pctChange(totalCalls, prevTotalCalls);
  const convDelta = pctChange(conversionRate, prevConvRate);

  // Volume chart data
  const volumeData = useMemo(() => {
    const map: Record<string, { date: string; outbound: number; inbound: number }> = {};
    calls.forEach((c) => {
      const day = format(new Date(c.created_at), "MMM dd");
      if (!map[day]) map[day] = { date: day, outbound: 0, inbound: 0 };
      if (c.direction === "inbound") map[day].inbound++;
      else map[day].outbound++;
    });
    return Object.values(map).reverse();
  }, [calls]);

  // Outcome distribution
  const outcomeData = useMemo(() => {
    const map: Record<string, number> = {};
    calls.forEach((c) => {
      const key = c.outcome ?? "other";
      map[key] = (map[key] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [calls]);

  // Agent leaderboard
  const leaderboard = useMemo(() => {
    const agg: Record<string, { calls: number; converted: number; scoreSum: number; scored: number }> = {};
    calls.forEach((c) => {
      if (!agg[c.project_id]) agg[c.project_id] = { calls: 0, converted: 0, scoreSum: 0, scored: 0 };
      agg[c.project_id].calls++;
      if (c.outcome === "completed" || c.outcome === "qualified") agg[c.project_id].converted++;
      if (c.evaluation && typeof (c.evaluation as any)?.overall_score === "number") {
        agg[c.project_id].scoreSum += (c.evaluation as any).overall_score;
        agg[c.project_id].scored++;
      }
    });
    return Object.entries(agg)
      .map(([pid, d]) => ({
        id: pid,
        name: agentNameMap[pid] ?? "Unknown",
        mode: specMap[pid] ?? "outbound",
        calls: d.calls,
        conversionPct: d.calls > 0 ? Math.round((d.converted / d.calls) * 100) : 0,
        avgScore: d.scored > 0 ? Math.round((d.scoreSum / d.scored) * 10) / 10 : null,
      }))
      .sort((a, b) => b.conversionPct - a.conversionPct)
      .slice(0, 8);
  }, [calls, agentNameMap, specMap]);

  // Recent calls
  const recentCalls = calls.slice(0, 10);

  // Campaign summary
  const campaignSummary = useMemo(() => {
    return campaigns.slice(0, 10).map((c) => {
      const cContacts = contacts.filter((ct) => ct.campaign_id === c.id);
      const total = cContacts.length;
      const called = cContacts.filter((ct) => ct.status !== "queued").length;
      const completed = cContacts.filter((ct) => ct.status === "completed" || ct.status === "called").length;
      return {
        ...c,
        totalContacts: total,
        calledContacts: called,
        completedContacts: completed,
        conversionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    });
  }, [campaigns, contacts]);

  // ── Empty state ──
  if (!loading && agents.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md text-center border-border/50">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bot className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Create Your First Agent</h2>
            <p className="text-muted-foreground text-sm">
              Build an AI phone agent in minutes. Write a prompt, answer a few questions, and start calling.
            </p>
            <Link
              to="/create-agent"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Create Agent
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── KPI cards config ──
  const kpis = [
    {
      label: "Active Agents",
      value: agents.length,
      sub: `${Object.values(specMap).filter((m) => m === "outbound").length} out · ${Object.values(specMap).filter((m) => m === "inbound").length} in`,
      icon: Bot,
      delta: null,
    },
    {
      label: "Total Calls",
      value: totalCalls,
      sub: `${outboundCalls} out · ${inboundCalls} in`,
      icon: Phone,
      delta: callsDelta,
    },
    {
      label: "Total Minutes",
      value: totalMinutes,
      sub: `$${totalCost.toFixed(2)} est. cost`,
      icon: Clock,
      delta: null,
    },
    {
      label: "Conversion Rate",
      value: `${conversionRate}%`,
      sub: `${completedCalls.length} converted`,
      icon: TrendingUp,
      delta: convDelta,
    },
    {
      label: "Avg Score",
      value: avgScore || "—",
      sub: `${scoredCalls.length} evaluated`,
      icon: BarChart3,
      delta: null,
    },
    {
      label: "Active Campaigns",
      value: activeCampaigns.length,
      sub: `${campaigns.length} total`,
      icon: Megaphone,
      delta: null,
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Row 1: Header + Period Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Agent performance overview</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-border/50 bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                <kpi.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-foreground">{kpi.value}</span>
                {kpi.delta !== null && (
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${kpi.delta >= 0 ? "text-success" : "text-destructive"}`}>
                    {kpi.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {kpi.delta >= 0 ? "+" : ""}{kpi.delta}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 3: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Call Volume */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Call Volume</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {volumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(172, 66%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(172, 66%, 50%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(250, 60%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(250, 60%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 16%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(220, 18%, 10%)",
                      border: "1px solid hsl(220, 14%, 16%)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="outbound" stroke="hsl(172, 66%, 50%)" fill="url(#gOut)" strokeWidth={2} />
                  <Area type="monotone" dataKey="inbound" stroke="hsl(250, 60%, 55%)" fill="url(#gIn)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No call data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Outcome Distribution */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outcome Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {outcomeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outcomeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                  >
                    {outcomeData.map((entry) => (
                      <Cell key={entry.name} fill={OUTCOME_COLORS[entry.name] ?? OUTCOME_COLORS.other} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(220, 18%, 10%)",
                      border: "1px solid hsl(220, 14%, 16%)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    formatter={(value: string) => <span className="text-xs text-muted-foreground capitalize">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No outcomes yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Leaderboard + Recent Calls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agent Leaderboard */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Agent Leaderboard</CardTitle>
              <Link to="/agents" className="text-xs text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {leaderboard.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs h-8">Agent</TableHead>
                    <TableHead className="text-xs h-8 text-right">Calls</TableHead>
                    <TableHead className="text-xs h-8 text-right">Conv %</TableHead>
                    <TableHead className="text-xs h-8 text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((a) => (
                    <TableRow key={a.id} className="border-border/30 cursor-pointer hover:bg-secondary/50" onClick={() => window.location.href = `/agents/${a.id}/edit`}>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate max-w-[140px]">{a.name}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {a.mode === "inbound" ? <PhoneIncoming className="h-2.5 w-2.5 mr-0.5" /> : <PhoneOutgoing className="h-2.5 w-2.5 mr-0.5" />}
                            {a.mode}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm text-muted-foreground">{a.calls}</TableCell>
                      <TableCell className="py-2 text-right">
                        <span className={`text-sm font-medium ${a.conversionPct >= 50 ? "text-success" : a.conversionPct >= 25 ? "text-warning" : "text-destructive"}`}>
                          {a.conversionPct}%
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm text-muted-foreground">{a.avgScore ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No call data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Calls */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recent Calls</CardTitle>
              <Link to="/calls" className="text-xs text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {recentCalls.length > 0 ? (
              <div className="divide-y divide-border/30">
                {recentCalls.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-6 py-2.5 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        c.outcome === "completed" || c.outcome === "qualified" ? "bg-success" :
                        c.outcome === "failed" ? "bg-destructive" : "bg-muted-foreground"
                      }`} />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{agentNameMap[c.project_id] ?? "Unknown Agent"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.direction === "inbound" ? "Inbound" : "Outbound"} · {format(new Date(c.created_at), "MMM dd, HH:mm")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {c.duration_seconds != null && (
                        <span className="text-xs text-muted-foreground">{Math.round(c.duration_seconds / 60)}m</span>
                      )}
                      <Badge
                        variant="secondary"
                        className={`text-[10px] capitalize ${
                          c.outcome === "qualified" || c.outcome === "completed" ? "bg-success/15 text-success" :
                          c.outcome === "failed" ? "bg-destructive/15 text-destructive" :
                          ""
                        }`}
                      >
                        {c.outcome ?? "pending"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No calls yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 5: Campaign Summary */}
      {campaignSummary.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Campaigns</h3>
            <Link to="/campaigns" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {campaignSummary.map((c) => (
              <Link
                key={c.id}
                to={`/campaigns/${c.id}`}
                className="min-w-[240px] flex-shrink-0"
              >
                <Card className="border-border/50 bg-card hover:border-primary/30 transition-colors">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${
                          c.status === "running" || c.status === "active" ? "bg-success/15 text-success" :
                          c.status === "completed" ? "bg-primary/15 text-primary" : ""
                        }`}
                      >
                        {c.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>{c.calledContacts}/{c.totalContacts} called</span>
                        <span>{c.conversionPct}% conv.</span>
                      </div>
                      <Progress value={c.totalContacts > 0 ? (c.calledContacts / c.totalContacts) * 100 : 0} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
