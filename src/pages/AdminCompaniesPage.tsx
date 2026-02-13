import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Search, Eye, Users } from "lucide-react";
import { format } from "date-fns";

interface OrgRow {
  id: string;
  name: string;
  credits_balance: number;
  created_at: string;
  memberCount: number;
  agentCount: number;
}

export default function AdminCompaniesPage() {
  const { switchOrg } = useOrgContext();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const [orgsRes, profilesRes, agentsRes] = await Promise.all([
        supabase.from("organizations").select("id, name, credits_balance, created_at"),
        supabase.from("profiles").select("org_id"),
        supabase.from("agent_projects").select("org_id"),
      ]);

      const memberCounts: Record<string, number> = {};
      (profilesRes.data ?? []).forEach((p) => {
        if (p.org_id) memberCounts[p.org_id] = (memberCounts[p.org_id] ?? 0) + 1;
      });

      const agentCounts: Record<string, number> = {};
      (agentsRes.data ?? []).forEach((a) => {
        agentCounts[a.org_id] = (agentCounts[a.org_id] ?? 0) + 1;
      });

      const enriched = (orgsRes.data ?? []).map((o) => ({
        ...o,
        memberCount: memberCounts[o.id] ?? 0,
        agentCount: agentCounts[o.id] ?? 0,
      }));

      setOrgs(enriched);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleViewOrg = (org: OrgRow) => {
    switchOrg(org.id, org.name);
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" /> Companies
        </h1>
        <p className="text-muted-foreground mt-1">View and manage all organizations.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="surface-elevated rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Agents</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" /> {org.memberCount}
                  </Badge>
                </TableCell>
                <TableCell>{org.agentCount}</TableCell>
                <TableCell className="font-mono">${org.credits_balance.toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(org.created_at), "MMM dd, yyyy")}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleViewOrg(org)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/companies/${org.id}`)}>
                      Manage
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No companies found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
