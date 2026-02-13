import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Search, ChevronDown, ChevronRight, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const PAGE_SIZE = 50;

const ACTION_CATEGORIES: Record<string, string[]> = {
  auth: ["user.created", "user.deleted", "user.login", "user.login_failed"],
  agents: ["agent_projects.created", "agent_projects.updated", "agent_projects.deleted", "agent_specs.created", "agent_specs.updated"],
  campaigns: ["campaigns.created", "campaigns.updated", "campaigns.deleted"],
  lists: ["dial_lists.created", "dial_lists.deleted"],
  inbound: ["inbound_numbers.created", "inbound_numbers.deleted"],
  team: ["org_invitations.created", "org_invitations.updated", "org_invitations.deleted"],
};

function getActionColor(action: string): string {
  if (action.includes("deleted") || action.includes("failed")) return "destructive";
  if (action.includes("created") || action.includes("login")) return "default";
  if (action.includes("updated")) return "secondary";
  return "outline";
}

function getEntityLabel(type: string | null): string {
  if (!type) return "—";
  return type.replace(/_/g, " ");
}

export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, search, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs" as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) {
        query = query.or(`user_email.ilike.%${search}%,entity_id.ilike.%${search}%,action.ilike.%${search}%`);
      }

      if (categoryFilter !== "all") {
        const actions = ACTION_CATEGORIES[categoryFilter];
        if (actions) {
          query = query.in("action", actions);
        }
      }

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: rows as any[], count: count ?? 0 };
    },
  });

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Track all user activities across the platform</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, entity ID, or action..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="auth">Auth</SelectItem>
            <SelectItem value="agents">Agents</SelectItem>
            <SelectItem value="campaigns">Campaigns</SelectItem>
            <SelectItem value="lists">Lists</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="team">Team</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Entity ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : !data?.rows?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No audit events found</TableCell>
              </TableRow>
            ) : (
              data.rows.map((row: any) => {
                const isExpanded = expandedRows.has(row.id);
                return (
                  <Collapsible key={row.id} asChild open={isExpanded} onOpenChange={() => toggleRow(row.id)}>
                    <>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(row.id)}>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <button className="p-1">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(row.created_at), "MMM d, yyyy HH:mm:ss")}
                        </TableCell>
                        <TableCell className="text-sm">{row.user_email || "system"}</TableCell>
                        <TableCell>
                          <Badge variant={getActionColor(row.action) as any} className="text-xs font-mono">
                            {row.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm capitalize">{getEntityLabel(row.entity_type)}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                          {row.entity_id || "—"}
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30 p-4">
                            <div className="space-y-2">
                              {row.ip_address && (
                                <p className="text-xs text-muted-foreground">IP: {row.ip_address}</p>
                              )}
                              <pre className="text-xs bg-background rounded p-3 overflow-auto max-h-64 border">
                                {JSON.stringify(row.details, null, 2)}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.count ?? 0)} of {data?.count ?? 0}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
