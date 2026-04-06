import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, BarChart3, PhoneCall, CheckCircle, DollarSign, Lightbulb, TrendingUp, Users, List, Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DateRange = "7d" | "30d" | "90d" | "all";

const ReportsPage = () => {
  const { activeOrgId } = useOrgContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [campaignLists, setCampaignLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [insights, setInsights] = useState<any[] | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "", dir: "desc" });

  useEffect(() => {
    if (!activeOrgId) return;
    const load = async () => {
      setLoading(true);
      const [cRes, lRes, aRes, clRes, clnRes] = await Promise.all([
        supabase.from("campaigns").select("*, agent_projects!campaigns_project_id_fkey(name, id)"),
        supabase.from("dial_lists").select("*").eq("org_id", activeOrgId),
        supabase.from("agent_projects").select("*").eq("org_id", activeOrgId),
        supabase.from("calls").select("id, campaign_id, project_id, outcome, duration_seconds, cost_estimate_usd, created_at, evaluation, contact_id").eq("org_id", activeOrgId),
        supabase.from("campaign_lists").select("*"),
      ]);
      setCampaigns(cRes.data || []);
      setLists(lRes.data || []);
      setAgents(aRes.data || []);
      setCalls(clRes.data || []);
      setCampaignLists(clnRes.data || []);

      // Fetch contacts for all campaigns
      const campIds = (cRes.data || []).map((c: any) => c.id);
      if (campIds.length > 0) {
        const { data: contactData } = await supabase
          .from("contacts")
          .select("id, campaign_id, status, list_id")
          .in("campaign_id", campIds);
        setContacts(contactData || []);
      }
      setLoading(false);
    };
    load();
  }, [activeOrgId]);

  const filteredCalls = useMemo(() => {
    if (dateRange === "all") return calls;
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return calls.filter((c: any) => new Date(c.created_at) >= cutoff);
  }, [calls, dateRange]);

  // Summary stats
  const totalCalls = filteredCalls.length;
  const totalQualified = filteredCalls.filter((c: any) => c.outcome === "qualified" || c.outcome === "transfer_completed").length;
  const conversionRate = totalCalls > 0 ? ((totalQualified / totalCalls) * 100).toFixed(1) : "0";
  const totalCost = filteredCalls.reduce((s: number, c: any) => s + (c.cost_estimate_usd || 0), 0);

  // Campaign stats
  const campaignStats = useMemo(() => {
    return campaigns.map((camp: any) => {
      const campCalls = filteredCalls.filter((c: any) => c.campaign_id === camp.id);
      const campContacts = contacts.filter((c: any) => c.campaign_id === camp.id);
      const qualified = campCalls.filter((c: any) => c.outcome === "qualified" || c.outcome === "transfer_completed").length;
      const connected = campCalls.filter((c: any) => c.duration_seconds && c.duration_seconds > 0).length;
      const avgDuration = campCalls.length > 0
        ? campCalls.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / campCalls.length
        : 0;
      const avgScore = campCalls.filter((c: any) => c.evaluation?.overall_score).length > 0
        ? campCalls.filter((c: any) => c.evaluation?.overall_score).reduce((s: number, c: any) => s + (c.evaluation as any).overall_score, 0) / campCalls.filter((c: any) => c.evaluation?.overall_score).length
        : null;
      const cost = campCalls.reduce((s: number, c: any) => s + (c.cost_estimate_usd || 0), 0);
      return {
        id: camp.id,
        name: camp.name,
        shortId: camp.short_id,
        status: camp.status,
        agentName: camp.agent_projects?.name || "—",
        totalContacts: campContacts.length,
        totalCalls: campCalls.length,
        connectionRate: campContacts.length > 0 ? ((connected / campContacts.length) * 100).toFixed(1) : "0",
        qualificationRate: campCalls.length > 0 ? ((qualified / campCalls.length) * 100).toFixed(1) : "0",
        qualified,
        avgDuration: Math.round(avgDuration),
        avgScore: avgScore ? avgScore.toFixed(1) : "—",
        cost: cost.toFixed(2),
      };
    });
  }, [campaigns, filteredCalls, contacts]);

  // List stats
  const listStats = useMemo(() => {
    return lists.map((list: any) => {
      const listCampaignIds = campaignLists.filter((cl: any) => cl.list_id === list.id).map((cl: any) => cl.campaign_id);
      const listContacts = contacts.filter((c: any) => c.list_id === list.id);
      const listContactIds = new Set(listContacts.map((c: any) => c.id));
      const listCalls = filteredCalls.filter((c: any) => listContactIds.has(c.contact_id));
      const qualified = listCalls.filter((c: any) => c.outcome === "qualified" || c.outcome === "transfer_completed").length;
      const dnc = listCalls.filter((c: any) => c.outcome === "dnc").length;
      const avgDuration = listCalls.length > 0
        ? listCalls.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / listCalls.length
        : 0;
      return {
        id: list.id,
        name: list.name,
        shortId: list.short_id,
        rowCount: list.row_count,
        campaignsUsed: listCampaignIds.length,
        totalCalls: listCalls.length,
        penetration: list.row_count > 0 ? ((listCalls.length / list.row_count) * 100).toFixed(1) : "0",
        conversionRate: listCalls.length > 0 ? ((qualified / listCalls.length) * 100).toFixed(1) : "0",
        dncRate: listCalls.length > 0 ? ((dnc / listCalls.length) * 100).toFixed(1) : "0",
        avgDuration: Math.round(avgDuration),
      };
    });
  }, [lists, filteredCalls, contacts, campaignLists]);

  // Agent stats
  const agentStats = useMemo(() => {
    return agents.map((agent: any) => {
      const agentCalls = filteredCalls.filter((c: any) => c.project_id === agent.id);
      const qualified = agentCalls.filter((c: any) => c.outcome === "qualified" || c.outcome === "transfer_completed").length;
      const avgDuration = agentCalls.length > 0
        ? agentCalls.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / agentCalls.length
        : 0;
      const avgScore = agentCalls.filter((c: any) => c.evaluation?.overall_score).length > 0
        ? agentCalls.filter((c: any) => c.evaluation?.overall_score).reduce((s: number, c: any) => s + (c.evaluation as any).overall_score, 0) / agentCalls.filter((c: any) => c.evaluation?.overall_score).length
        : null;
      const outcomes: Record<string, number> = {};
      agentCalls.forEach((c: any) => {
        if (c.outcome) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
      });
      const topOutcome = Object.entries(outcomes).sort((a, b) => b[1] - a[1])[0];
      return {
        id: agent.id,
        name: agent.name,
        totalCalls: agentCalls.length,
        qualified,
        qualificationRate: agentCalls.length > 0 ? ((qualified / agentCalls.length) * 100).toFixed(1) : "0",
        avgDuration: Math.round(avgDuration),
        avgScore: avgScore ? avgScore.toFixed(1) : "—",
        topOutcome: topOutcome ? `${topOutcome[0]} (${topOutcome[1]})` : "—",
      };
    });
  }, [agents, filteredCalls]);

  const sortedData = (data: any[], key: string) => {
    if (!sortConfig.key || sortConfig.key !== key) return data;
    return [...data]; // Already sorted via click handler below
  };

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  const sortData = <T extends Record<string, any>>(data: T[]) => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      const numA = parseFloat(aVal);
      const numB = parseFloat(bVal);
      if (!isNaN(numA) && !isNaN(numB)) {
        return sortConfig.dir === "asc" ? numA - numB : numB - numA;
      }
      return sortConfig.dir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  };

  const SortHeader = ({ label, field }: { label: string; field: string }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => handleSort(field)}
    >
      {label} {sortConfig.key === field ? (sortConfig.dir === "asc" ? "↑" : "↓") : ""}
    </TableHead>
  );

  const generateInsights = async () => {
    setInsightsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-campaign-insights", {
        body: { org_id: activeOrgId, date_range: dateRange },
      });
      if (error) throw error;
      setInsights(data?.insights || []);
    } catch (err: any) {
      toast({ title: "Error generating insights", description: err.message, variant: "destructive" });
    } finally {
      setInsightsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">Performance analytics across campaigns, lists, and agents</p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <PhoneCall className="h-4 w-4" /> Total Calls
            </div>
            <p className="text-2xl font-bold">{totalCalls.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" /> Qualified
            </div>
            <p className="text-2xl font-bold">{totalQualified.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" /> Conversion
            </div>
            <p className="text-2xl font-bold">{conversionRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" /> Total Cost
            </div>
            <p className="text-2xl font-bold">${totalCost.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="campaign">
        <TabsList>
          <TabsTrigger value="campaign" className="gap-1"><BarChart3 className="h-4 w-4" /> By Campaign</TabsTrigger>
          <TabsTrigger value="list" className="gap-1"><List className="h-4 w-4" /> By List</TabsTrigger>
          <TabsTrigger value="agent" className="gap-1"><Bot className="h-4 w-4" /> By Agent</TabsTrigger>
        </TabsList>

        <TabsContent value="campaign">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Campaign" field="name" />
                    <SortHeader label="Status" field="status" />
                    <SortHeader label="Contacts" field="totalContacts" />
                    <SortHeader label="Calls" field="totalCalls" />
                    <SortHeader label="Connect %" field="connectionRate" />
                    <SortHeader label="Qual %" field="qualificationRate" />
                    <SortHeader label="Avg Duration" field="avgDuration" />
                    <SortHeader label="Avg Score" field="avgScore" />
                    <SortHeader label="Cost" field="cost" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortData(campaignStats).map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/campaigns/${c.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        {c.shortId && <span className="text-xs text-muted-foreground">{c.shortId}</span>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                      <TableCell>{c.totalContacts}</TableCell>
                      <TableCell>{c.totalCalls}</TableCell>
                      <TableCell>{c.connectionRate}%</TableCell>
                      <TableCell>{c.qualificationRate}%</TableCell>
                      <TableCell>{c.avgDuration}s</TableCell>
                      <TableCell>{c.avgScore}</TableCell>
                      <TableCell>${c.cost}</TableCell>
                    </TableRow>
                  ))}
                  {campaignStats.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No campaigns found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="List" field="name" />
                    <SortHeader label="Rows" field="rowCount" />
                    <SortHeader label="Campaigns" field="campaignsUsed" />
                    <SortHeader label="Calls" field="totalCalls" />
                    <SortHeader label="Penetration %" field="penetration" />
                    <SortHeader label="Conversion %" field="conversionRate" />
                    <SortHeader label="DNC %" field="dncRate" />
                    <SortHeader label="Avg Duration" field="avgDuration" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortData(listStats).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium">{l.name}</div>
                        {l.shortId && <span className="text-xs text-muted-foreground">{l.shortId}</span>}
                      </TableCell>
                      <TableCell>{l.rowCount}</TableCell>
                      <TableCell>{l.campaignsUsed}</TableCell>
                      <TableCell>{l.totalCalls}</TableCell>
                      <TableCell>{l.penetration}%</TableCell>
                      <TableCell>{l.conversionRate}%</TableCell>
                      <TableCell>{l.dncRate}%</TableCell>
                      <TableCell>{l.avgDuration}s</TableCell>
                    </TableRow>
                  ))}
                  {listStats.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No lists found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Agent" field="name" />
                    <SortHeader label="Calls" field="totalCalls" />
                    <SortHeader label="Qualified" field="qualified" />
                    <SortHeader label="Qual %" field="qualificationRate" />
                    <SortHeader label="Avg Duration" field="avgDuration" />
                    <SortHeader label="Avg Score" field="avgScore" />
                    <TableHead>Top Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortData(agentStats).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.totalCalls}</TableCell>
                      <TableCell>{a.qualified}</TableCell>
                      <TableCell>{a.qualificationRate}%</TableCell>
                      <TableCell>{a.avgDuration}s</TableCell>
                      <TableCell>{a.avgScore}</TableCell>
                      <TableCell>{a.topOutcome}</TableCell>
                    </TableRow>
                  ))}
                  {agentStats.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No agents found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* AI Insights */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-yellow-500" /> AI Campaign Insights
          </CardTitle>
          <Button onClick={generateInsights} disabled={insightsLoading} size="sm">
            {insightsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lightbulb className="h-4 w-4 mr-1" />}
            Generate Insights
          </Button>
        </CardHeader>
        <CardContent>
          {insights === null && !insightsLoading && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Click "Generate Insights" to get AI-powered recommendations based on your campaign data.
            </p>
          )}
          {insights && insights.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {insights.map((insight: any, i: number) => (
                <Card key={i} className="border-dashed">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0 mt-0.5">{insight.category || "Insight"}</Badge>
                      <div>
                        <p className="font-medium text-sm">{insight.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {insights && insights.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Not enough data to generate insights. Run more campaigns first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;
