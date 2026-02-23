import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, Download, Phone, Calendar, Hash, CheckCircle2, XCircle, ArrowUpDown, User, Building2, Megaphone } from "lucide-react";
import { format } from "date-fns";

interface CrmRecord {
  id: string;
  org_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  state: string | null;
  zip_code: string | null;
  age: string | null;
  household_size: string | null;
  income_est_annual: string | null;
  coverage_type: string | null;
  consent: boolean | null;
  qualified: boolean | null;
  transferred: boolean | null;
  custom_fields: Record<string, any> | null;
  first_contacted_at: string | null;
  last_contacted_at: string | null;
  total_calls: number;
  last_campaign_id: string | null;
  last_outcome: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  campaign_ids: string[];
}

type SortField = "name" | "phone" | "state" | "last_contacted_at" | "total_calls" | "qualified";
type SortDir = "asc" | "desc";

export default function CRMPage() {
  const { activeOrgId, isSuperAdmin } = useOrgContext();
  const [search, setSearch] = useState("");
  const [qualFilter, setQualFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [selectedRecord, setSelectedRecord] = useState<CrmRecord | null>(null);
  const [sortField, setSortField] = useState<SortField>("last_contacted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [orgFilter, setOrgFilter] = useState<string>("all");

  // Fetch CRM records
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["crm-records", activeOrgId, isSuperAdmin],
    queryFn: async () => {
      let query = (supabase.from("crm_records") as any)
        .select("*")
        .order("last_contacted_at", { ascending: false })
        .limit(1000);

      if (!isSuperAdmin && activeOrgId) {
        query = query.eq("org_id", activeOrgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CrmRecord[];
    },
    enabled: !!activeOrgId || isSuperAdmin,
  });

  // Fetch orgs for super admin filter
  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs-for-crm"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, name");
      return data || [];
    },
    enabled: isSuperAdmin,
  });

  // Fetch campaigns for display and filter
  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns-for-crm", activeOrgId],
    queryFn: async () => {
      const { data } = await (supabase.from("campaigns") as any).select("id, name");
      return data || [];
    },
    enabled: !!activeOrgId || isSuperAdmin,
  });

  const campaignMap = useMemo(() => {
    const map: Record<string, string> = {};
    campaigns.forEach((c: any) => { map[c.id] = c.name; });
    return map;
  }, [campaigns]);

  const orgMap = useMemo(() => {
    const map: Record<string, string> = {};
    orgs.forEach((o: any) => { map[o.id] = o.name; });
    return map;
  }, [orgs]);

  // Unique states for filter
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    records.forEach((r) => { if (r.state) states.add(r.state); });
    return Array.from(states).sort();
  }, [records]);

  // Campaigns that actually appear in records (for filter dropdown)
  const recordCampaignIds = useMemo(() => {
    const ids = new Set<string>();
    records.forEach((r) => {
      if (r.campaign_ids?.length) r.campaign_ids.forEach((id) => ids.add(id));
      else if (r.last_campaign_id) ids.add(r.last_campaign_id);
    });
    return Array.from(ids);
  }, [records]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = records;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name?.toLowerCase().includes(s) ||
          r.phone.includes(s) ||
          r.email?.toLowerCase().includes(s)
      );
    }

    if (qualFilter === "qualified") result = result.filter((r) => r.qualified === true);
    else if (qualFilter === "disqualified") result = result.filter((r) => r.qualified === false);
    else if (qualFilter === "unknown") result = result.filter((r) => r.qualified == null);

    if (stateFilter !== "all") result = result.filter((r) => r.state === stateFilter);
    if (isSuperAdmin && orgFilter !== "all") result = result.filter((r) => r.org_id === orgFilter);

    if (campaignFilter !== "all") {
      result = result.filter((r) => {
        if (r.campaign_ids?.length) return r.campaign_ids.includes(campaignFilter);
        return r.last_campaign_id === campaignFilter;
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      const valA = a[sortField];
      const valB = b[sortField];
      if (valA == null && valB == null) cmp = 0;
      else if (valA == null) cmp = 1;
      else if (valB == null) cmp = -1;
      else if (typeof valA === "number" && typeof valB === "number") cmp = valA - valB;
      else if (typeof valA === "boolean" && typeof valB === "boolean") cmp = (valA ? 1 : 0) - (valB ? 1 : 0);
      else cmp = String(valA).localeCompare(String(valB));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [records, search, qualFilter, stateFilter, orgFilter, campaignFilter, sortField, sortDir, isSuperAdmin]);

  // Discover dynamic custom_fields keys from filtered records
  const dynamicKeys = useMemo(() => {
    const keyCounts: Record<string, number> = {};
    filtered.forEach((r) => {
      if (r.custom_fields && typeof r.custom_fields === "object") {
        Object.keys(r.custom_fields).forEach((k) => {
          if (r.custom_fields![k] != null) keyCounts[k] = (keyCounts[k] || 0) + 1;
        });
      }
    });
    // Only show keys that appear in at least 10% of filtered records or at least 2 records
    const threshold = Math.max(2, Math.floor(filtered.length * 0.1));
    return Object.entries(keyCounts)
      .filter(([, count]) => count >= threshold || (filtered.length <= 10 && count >= 1))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // max 5 dynamic columns
      .map(([key]) => key);
  }, [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const exportCsv = () => {
    const baseHeaders = ["Name", "Phone", "Email", "State", "Qualified", "Transferred", "Total Calls", "Last Contact", "Last Outcome", "Campaigns"];
    const allHeaders = [...baseHeaders, ...dynamicKeys.map(formatFieldName)];
    const rows = filtered.map((r) => {
      const base = [
        r.name || "", r.phone, r.email || "", r.state || "",
        r.qualified == null ? "" : r.qualified ? "Yes" : "No",
        r.transferred ? "Yes" : "No",
        r.total_calls,
        r.last_contacted_at ? format(new Date(r.last_contacted_at), "yyyy-MM-dd") : "",
        r.last_outcome || "",
        (r.campaign_ids?.length ? r.campaign_ids : r.last_campaign_id ? [r.last_campaign_id] : [])
          .map((id) => campaignMap[id] || id).join("; "),
      ];
      const dynamic = dynamicKeys.map((k) => r.custom_fields?.[k] ?? "");
      return [...base, ...dynamic];
    });
    const csv = [allHeaders.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-records-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </div>
    </TableHead>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM Records</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centralized repository of all contacts gathered across campaigns
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[200px]">
            <Megaphone className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {recordCampaignIds.map((id) => (
              <SelectItem key={id} value={id}>{campaignMap[id] || id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={qualFilter} onValueChange={setQualFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Qualification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="disqualified">Disqualified</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {uniqueStates.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSuperAdmin && (
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-[200px]">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Organizations</SelectItem>
              {orgs.map((o: any) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-muted-foreground">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading CRM records...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {records.length === 0
            ? "No CRM records yet. Records are created automatically when calls complete."
            : "No records match your filters."}
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {isSuperAdmin && <TableHead>Org</TableHead>}
                <SortHeader field="name">Name</SortHeader>
                <SortHeader field="phone">Phone</SortHeader>
                <SortHeader field="state">State</SortHeader>
                <SortHeader field="qualified">Qualified</SortHeader>
                <SortHeader field="last_contacted_at">Last Contact</SortHeader>
                <SortHeader field="total_calls">Calls</SortHeader>
                <TableHead>Campaigns</TableHead>
                <TableHead>Outcome</TableHead>
                {dynamicKeys.map((k) => (
                  <TableHead key={k} className="capitalize text-xs">
                    {formatFieldName(k)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedRecord(r)}
                >
                  {isSuperAdmin && (
                    <TableCell className="text-xs text-muted-foreground">
                      {orgMap[r.org_id] || r.org_id.slice(0, 8)}
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{r.name || "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{formatPhone(r.phone)}</TableCell>
                  <TableCell>{r.state || "—"}</TableCell>
                  <TableCell>
                    {r.qualified === true && (
                      <Badge variant="default">
                        <CheckCircle2 className="h-3 w-3 mr-1" />Qualified
                      </Badge>
                    )}
                    {r.qualified === false && (
                      <Badge variant="secondary">
                        <XCircle className="h-3 w-3 mr-1" />Disqualified
                      </Badge>
                    )}
                    {r.qualified == null && <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.last_contacted_at ? format(new Date(r.last_contacted_at), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.total_calls}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <CampaignBadges record={r} campaignMap={campaignMap} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">
                      {r.last_outcome || "—"}
                    </Badge>
                  </TableCell>
                  {dynamicKeys.map((k) => (
                    <TableCell key={k} className="text-sm text-muted-foreground truncate max-w-[120px]">
                      {r.custom_fields?.[k] != null ? String(r.custom_fields[k]) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Panel */}
      <CrmDetailDialog
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
        campaignMap={campaignMap}
        orgMap={orgMap}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}

function CampaignBadges({ record, campaignMap }: { record: CrmRecord; campaignMap: Record<string, string> }) {
  const ids = record.campaign_ids?.length ? record.campaign_ids : record.last_campaign_id ? [record.last_campaign_id] : [];
  if (ids.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  
  return (
    <div className="flex flex-wrap gap-1">
      {ids.slice(0, 3).map((id) => (
        <Badge key={id} variant="outline" className="text-xs truncate max-w-[100px]">
          <Megaphone className="h-2.5 w-2.5 mr-1 shrink-0" />
          {campaignMap[id] || id.slice(0, 6)}
        </Badge>
      ))}
      {ids.length > 3 && (
        <Badge variant="outline" className="text-xs">+{ids.length - 3}</Badge>
      )}
    </div>
  );
}

function CrmDetailDialog({
  record,
  onClose,
  campaignMap,
  orgMap,
  isSuperAdmin,
}: {
  record: CrmRecord | null;
  onClose: () => void;
  campaignMap: Record<string, string>;
  orgMap: Record<string, string>;
  isSuperAdmin: boolean;
}) {
  const { data: callHistory = [] } = useQuery({
    queryKey: ["crm-call-history", record?.org_id, record?.phone],
    queryFn: async () => {
      if (!record) return [];
      const { data } = await supabase
        .from("calls")
        .select("id, started_at, duration_seconds, outcome, campaign_id, transcript, extracted_data, recording_url")
        .eq("org_id", record.org_id)
        .order("started_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!record,
  });

  if (!record) return null;

  const standardFields = [
    { label: "Phone", value: formatPhone(record.phone), icon: Phone },
    { label: "Email", value: record.email },
    { label: "State", value: record.state },
    { label: "Consent Given", value: record.consent == null ? null : record.consent ? "Yes" : "No" },
    { label: "Transferred", value: record.transferred ? "Yes" : "No" },
  ];

  // Legacy ACA fields - only show if they have data
  const legacyFields = [
    { label: "Age", value: record.age },
    { label: "Household Size", value: record.household_size },
    { label: "Est. Annual Income", value: record.income_est_annual },
    { label: "Coverage Type", value: record.coverage_type },
  ].filter((f) => f.value);

  const customEntries = record.custom_fields && typeof record.custom_fields === "object"
    ? Object.entries(record.custom_fields).filter(([, v]) => v != null)
    : [];

  const campaignIds = record.campaign_ids?.length ? record.campaign_ids : record.last_campaign_id ? [record.last_campaign_id] : [];

  return (
    <Dialog open={!!record} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {record.name || "Unknown Contact"}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-6">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              {record.qualified === true && (
                <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Qualified</Badge>
              )}
              {record.qualified === false && (
                <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Disqualified</Badge>
              )}
              <Badge variant="outline"><Hash className="h-3 w-3 mr-1" />{record.total_calls} call{record.total_calls !== 1 ? "s" : ""}</Badge>
              {record.last_contacted_at && (
                <Badge variant="outline"><Calendar className="h-3 w-3 mr-1" />{format(new Date(record.last_contacted_at), "MMM d, yyyy")}</Badge>
              )}
              {isSuperAdmin && (
                <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />{orgMap[record.org_id] || record.org_id.slice(0, 8)}</Badge>
              )}
            </div>

            {/* Campaign Tags */}
            {campaignIds.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Campaigns</h3>
                <div className="flex flex-wrap gap-2">
                  {campaignIds.map((id) => (
                    <Badge key={id} variant="outline">
                      <Megaphone className="h-3 w-3 mr-1" />
                      {campaignMap[id] || id.slice(0, 8)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Standard Fields */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Contact Information</h3>
              <div className="grid grid-cols-2 gap-3">
                {standardFields.map(({ label, value }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium">{value || "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Legacy ACA fields (only if present) */}
            {legacyFields.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Standard Fields</h3>
                <div className="grid grid-cols-2 gap-3">
                  {legacyFields.map(({ label, value }) => (
                    <div key={label} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium">{value || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom / Dynamic Fields */}
            {customEntries.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Gathered Data</h3>
                <div className="grid grid-cols-2 gap-3">
                  {customEntries.map(([key, val]) => (
                    <div key={key} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{formatFieldName(key)}</p>
                      <p className="text-sm font-medium">{String(val)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Call History */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Call History</h3>
              {callHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No call records found.</p>
              ) : (
                <div className="space-y-2">
                  {callHistory.slice(0, 20).map((call: any) => (
                    <div key={call.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          {call.started_at ? format(new Date(call.started_at), "MMM d, yyyy h:mm a") : "Unknown date"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {call.campaign_id ? (campaignMap[call.campaign_id] || "Campaign") : "Test Lab"}
                          {call.duration_seconds ? ` · ${Math.round(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize text-xs">{call.outcome || "—"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Timeline info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>First contacted: {record.first_contacted_at ? format(new Date(record.first_contacted_at), "MMM d, yyyy h:mm a") : "—"}</p>
              <p>Record created: {format(new Date(record.created_at), "MMM d, yyyy h:mm a")}</p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

function formatFieldName(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
