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
import { Search, Download, Phone, Calendar, Hash, CheckCircle2, XCircle, ArrowUpDown, User, Building2 } from "lucide-react";
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
}

type SortField = "name" | "phone" | "state" | "last_contacted_at" | "total_calls" | "qualified";
type SortDir = "asc" | "desc";

export default function CRMPage() {
  const { activeOrgId, isSuperAdmin } = useOrgContext();
  const [search, setSearch] = useState("");
  const [qualFilter, setQualFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
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

  // Fetch campaigns for display
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
  }, [records, search, qualFilter, stateFilter, orgFilter, sortField, sortDir, isSuperAdmin]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const exportCsv = () => {
    const headers = ["Name", "Phone", "Email", "State", "Age", "Household Size", "Income", "Coverage", "Qualified", "Transferred", "Total Calls", "Last Contact", "Last Outcome"];
    const rows = filtered.map((r) => [
      r.name || "", r.phone, r.email || "", r.state || "", r.age || "",
      r.household_size || "", r.income_est_annual || "", r.coverage_type || "",
      r.qualified == null ? "" : r.qualified ? "Yes" : "No",
      r.transferred ? "Yes" : "No",
      r.total_calls,
      r.last_contacted_at ? format(new Date(r.last_contacted_at), "yyyy-MM-dd") : "",
      r.last_outcome || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
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
            Centralized repository of all contacts gathered across campaigns and test runs
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
                <TableHead>Campaign</TableHead>
                <TableHead>Outcome</TableHead>
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
                  <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                    {r.last_campaign_id ? (campaignMap[r.last_campaign_id] || "—") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">
                      {r.last_outcome || "—"}
                    </Badge>
                  </TableCell>
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
  // Fetch call history for this phone
  const { data: callHistory = [] } = useQuery({
    queryKey: ["crm-call-history", record?.org_id, record?.phone],
    queryFn: async () => {
      if (!record) return [];
      // We'll search calls by matching phone from contacts table or by org
      const { data } = await supabase
        .from("calls")
        .select("id, started_at, duration_seconds, outcome, campaign_id, transcript, extracted_data, recording_url")
        .eq("org_id", record.org_id)
        .order("started_at", { ascending: false })
        .limit(50);

      // Filter to calls matching this phone (from contacts table or extracted_data)
      // For now return all org calls - in practice you'd filter by contact_id or phone
      return data || [];
    },
    enabled: !!record,
  });

  if (!record) return null;

  const fields = [
    { label: "Phone", value: formatPhone(record.phone), icon: Phone },
    { label: "Email", value: record.email },
    { label: "State", value: record.state },
    { label: "Age", value: record.age },
    { label: "Household Size", value: record.household_size },
    { label: "Est. Annual Income", value: record.income_est_annual },
    { label: "Coverage Type", value: record.coverage_type },
    { label: "Consent Given", value: record.consent == null ? null : record.consent ? "Yes" : "No" },
    { label: "Transferred", value: record.transferred ? "Yes" : "No" },
  ];

  const customEntries = record.custom_fields && typeof record.custom_fields === "object"
    ? Object.entries(record.custom_fields).filter(([, v]) => v != null)
    : [];

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

            {/* Gathered Fields */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Gathered Information</h3>
              <div className="grid grid-cols-2 gap-3">
                {fields.map(({ label, value }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium">{value || "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Fields */}
            {customEntries.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Additional Fields</h3>
                <div className="grid grid-cols-2 gap-3">
                  {customEntries.map(([key, val]) => (
                    <div key={key} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
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
