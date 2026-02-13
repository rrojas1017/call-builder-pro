import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--warning))", "hsl(var(--muted))", "hsl(142 76% 36%)", "hsl(280 67% 55%)"];

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [agent, setAgent] = useState<any>(null);

  useEffect(() => {
    if (!user || !id) return;
    const load = async () => {
      const [campRes, contactsRes, clRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).single(),
        supabase.from("contacts").select("*").eq("campaign_id", id).order("created_at"),
        supabase.from("campaign_lists" as any).select("*, dial_lists(*)").eq("campaign_id", id),
      ]);

      setCampaign(campRes.data);
      setContacts(contactsRes.data || []);
      setLists((clRes.data as any[])?.map((cl: any) => cl.dial_lists) || []);

      if (campRes.data?.agent_project_id) {
        const { data: ag } = await supabase
          .from("agent_projects")
          .select("name")
          .eq("id", campRes.data.agent_project_id)
          .single();
        setAgent(ag);
      }
      setLoading(false);
    };
    load();
  }, [user, id]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!campaign) {
    return <div className="p-8 text-muted-foreground">Campaign not found.</div>;
  }

  const total = contacts.length;
  const called = contacts.filter((c) => c.status !== "queued").length;
  const completed = contacts.filter((c) => c.status === "completed").length;
  const failed = contacts.filter((c) => c.status === "failed").length;

  // Outcome distribution
  const outcomeCounts: Record<string, number> = {};
  contacts.forEach((c) => {
    const key = c.status || "queued";
    outcomeCounts[key] = (outcomeCounts[key] || 0) + 1;
  });
  const pieData = Object.entries(outcomeCounts).map(([name, value]) => ({ name, value }));

  // Per-list breakdown
  const listStats = lists.map((l: any) => {
    const listContacts = contacts.filter((c) => c.list_id === l.id);
    const listCompleted = listContacts.filter((c) => c.status === "completed").length;
    return {
      name: l.name,
      total: listContacts.length,
      completed: listCompleted,
      rate: listContacts.length > 0 ? Math.round((listCompleted / listContacts.length) * 100) : 0,
    };
  });

  const statusColor: Record<string, string> = {
    draft: "text-muted-foreground bg-muted",
    running: "text-green-700 bg-green-100",
    paused: "text-yellow-700 bg-yellow-100",
    completed: "text-primary bg-primary/10",
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/campaigns" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[campaign.status] || ""}`}>
              {campaign.status}
            </span>
            {agent && <span>Agent: {agent.name}</span>}
            <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Contacts", value: total },
          { label: "Called", value: called },
          { label: "Completed", value: completed },
          { label: "Failed", value: failed },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5 text-center">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outcome pie */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Outcome Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Per-list breakdown */}
        {listStats.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Performance by List</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>List</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listStats.map((ls) => (
                    <TableRow key={ls.name}>
                      <TableCell className="font-medium">{ls.name}</TableCell>
                      <TableCell className="text-right">{ls.total}</TableCell>
                      <TableCell className="text-right">{ls.completed}</TableCell>
                      <TableCell className="text-right">{ls.rate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Contact table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contacts</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Called At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                    <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                    <TableCell>{c.attempts}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.called_at ? new Date(c.called_at).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No contacts yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
