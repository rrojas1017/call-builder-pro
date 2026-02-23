import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  PhoneCall,
  PhoneOff,
  PhoneForwarded,
  Ban,
  TrendingUp,
  Target,
  Megaphone,
} from "lucide-react";

interface ListDetailDialogProps {
  list: {
    id: string;
    name: string;
    file_name: string;
    row_count: number;
    status: string;
    created_at: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  status: string;
  last_error: string | null;
  attempts: number;
  called_at: string | null;
  campaign_id: string;
}

interface CampaignInfo {
  id: string;
  name: string;
  status: string;
  contactCount: number;
}

interface Stats {
  total: number;
  contacted: number;
  connected: number;
  available: number;
  dnc: number;
  qualified: number;
  penetration: number;
  conversion: number;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  completed: "default",
  queued: "outline",
  calling: "secondary",
  failed: "destructive",
};

export default function ListDetailDialog({
  list,
  open,
  onOpenChange,
}: ListDetailDialogProps) {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    contacted: 0,
    connected: 0,
    available: 0,
    dnc: 0,
    qualified: 0,
    penetration: 0,
    conversion: 0,
  });

  useEffect(() => {
    if (!open || !list) return;
    setLoading(true);
    fetchData();
  }, [open, list?.id]);

  const fetchData = async () => {
    if (!list) return;

    const [contactsRes, campaignListsRes] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, name, phone, status, last_error, attempts, called_at, campaign_id")
        .eq("list_id", list.id)
        .order("called_at", { ascending: false, nullsFirst: false })
        .limit(500),
      supabase
        .from("campaign_lists")
        .select("campaign_id, campaigns(id, name, status)")
        .eq("list_id", list.id),
    ]);

    const allContacts = (contactsRes.data || []) as ContactRow[];
    setContacts(allContacts);

    // Compute stats
    const total = list.row_count || allContacts.length;
    const contacted = allContacts.filter((c) => c.status !== "queued").length;
    const connected = allContacts.filter(
      (c) => c.status === "completed"
    ).length;
    const available = allContacts.filter(
      (c) => c.status === "queued"
    ).length;
    const dnc = allContacts.filter(
      (c) =>
        c.last_error?.toLowerCase().includes("dnc") ||
        c.last_error?.toLowerCase().includes("do_not_call") ||
        c.status === "dnc"
    ).length;
    const qualified = allContacts.filter(
      (c) =>
        c.status === "completed" ||
        c.last_error?.toLowerCase().includes("qualified") ||
        c.last_error?.toLowerCase().includes("transferred")
    ).length;
    const penetration = total > 0 ? (contacted / total) * 100 : 0;
    const conversion = contacted > 0 ? (qualified / contacted) * 100 : 0;

    setStats({
      total,
      contacted,
      connected,
      available,
      dnc,
      qualified,
      penetration,
      conversion,
    });

    // Build campaign info
    const campaignMap = new Map<string, CampaignInfo>();
    (campaignListsRes.data || []).forEach((cl: any) => {
      const camp = cl.campaigns;
      if (camp) {
        campaignMap.set(camp.id, {
          id: camp.id,
          name: camp.name,
          status: camp.status,
          contactCount: 0,
        });
      }
    });

    // Count contacts per campaign
    allContacts.forEach((c) => {
      const existing = campaignMap.get(c.campaign_id);
      if (existing) existing.contactCount++;
    });

    setCampaigns(Array.from(campaignMap.values()));
    setLoading(false);
  };

  if (!list) return null;

  const kpis = [
    { label: "Total Contacts", value: stats.total, icon: Users, color: "text-foreground" },
    { label: "Contacted", value: stats.contacted, icon: PhoneCall, color: "text-primary" },
    { label: "Connected", value: stats.connected, icon: PhoneForwarded, color: "text-success" },
    { label: "Available", value: stats.available, icon: Target, color: "text-muted-foreground" },
    { label: "DNC", value: stats.dnc, icon: Ban, color: "text-destructive" },
    { label: "Qualified", value: stats.qualified, icon: TrendingUp, color: "text-success" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{list.name}</DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span>{list.file_name}</span>
            <span>•</span>
            <span>{new Date(list.created_at).toLocaleDateString()}</span>
            <Badge variant={list.status === "ready" ? "default" : "secondary"} className="text-[10px]">
              {list.status}
            </Badge>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-5 pb-2">
              {/* KPI Grid */}
              <div className="grid grid-cols-3 gap-3">
                {kpis.map((kpi) => (
                  <Card key={kpi.label} className="gradient-border rounded-xl hover-lift">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-muted p-2">
                        <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                      <div>
                        <p className={`text-2xl font-bold ${kpi.color}`}>
                          {kpi.value.toLocaleString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Rates */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="rounded-xl">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Penetration Rate</span>
                      <span className="text-lg font-bold text-gradient-primary">
                        {stats.penetration.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={stats.penetration} className="h-2" />
                    <p className="text-[11px] text-muted-foreground">
                      {stats.contacted} / {stats.total} contacted
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Conversion Rate</span>
                      <span className="text-lg font-bold text-success">
                        {stats.conversion.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={stats.conversion} className="h-2" />
                    <p className="text-[11px] text-muted-foreground">
                      {stats.qualified} / {stats.contacted} qualified
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Campaigns */}
              {campaigns.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-primary" />
                    Campaigns Using This List
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {campaigns.map((camp) => (
                      <div
                        key={camp.id}
                        className="glass-card rounded-lg px-3 py-2 flex items-center gap-2 text-sm"
                      >
                        <span className="font-medium text-foreground">{camp.name}</span>
                        <Badge variant={camp.status === "running" ? "default" : "secondary"} className="text-[10px]">
                          {camp.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {camp.contactCount} contacts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts Preview */}
              {contacts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Contacts ({contacts.length}{contacts.length >= 500 ? "+" : ""})
                  </h3>
                  <div className="rounded-lg border overflow-hidden">
                    <ScrollArea className="max-h-[260px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">Phone</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Notes</TableHead>
                            <TableHead className="text-xs text-right">Attempts</TableHead>
                            <TableHead className="text-xs">Last Called</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contacts.slice(0, 100).map((c) => (
                            <TableRow key={c.id} className="text-xs">
                              <TableCell className="font-medium">{c.name}</TableCell>
                              <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                              <TableCell>
                                <Badge variant={STATUS_VARIANTS[c.status] || "outline"} className="text-[10px]">
                                  {c.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {c.last_error || "—"}
                              </TableCell>
                              <TableCell className="text-right">{c.attempts}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {c.called_at
                                  ? new Date(c.called_at).toLocaleDateString()
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                </div>
              )}

              {contacts.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No contacts have been assigned from this list to any campaign yet.
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
