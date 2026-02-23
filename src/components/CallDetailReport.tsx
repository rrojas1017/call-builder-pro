import { useState, useMemo } from "react";
import { format } from "date-fns";
import { FileText, ChevronDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface CallDetail {
  id: string;
  started_at: string | null;
  duration_seconds: number | null;
  cost_estimate_usd: number | null;
  org_id: string;
  project_id: string;
  outcome: string | null;
  direction: string;
}

interface CallDetailReportProps {
  calls: CallDetail[];
  orgNameMap: Record<string, string>;
  agentNameMap: Record<string, string>;
}

const PAGE_SIZE = 50;

export default function CallDetailReport({ calls, orgNameMap, agentNameMap }: CallDetailReportProps) {
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sorted = useMemo(() => {
    return [...calls].sort((a, b) => (b.cost_estimate_usd || 0) - (a.cost_estimate_usd || 0));
  }, [calls]);

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((c) => {
      const orgName = (orgNameMap[c.org_id] || "").toLowerCase();
      const agentName = (agentNameMap[c.project_id] || "").toLowerCase();
      return orgName.includes(q) || agentName.includes(q);
    });
  }, [sorted, search, orgNameMap, agentNameMap]);

  const visible = filtered.slice(0, visibleCount);

  const getCostColor = (cost: number) => {
    if (cost > 1) return "text-red-400 font-bold";
    if (cost > 0.5) return "text-amber-400 font-semibold";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Call Detail Report</h2>
          <Badge variant="secondary" className="text-xs">{filtered.length} calls</Badge>
        </div>
        <Input
          placeholder="Search org or agent..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
          className="w-52 h-8 text-sm"
        />
      </div>
      <div className="surface-elevated rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date/Time</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">$/Min</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Direction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {search ? "No matching calls" : "No call cost data"}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((c) => {
                const cost = c.cost_estimate_usd || 0;
                const dur = c.duration_seconds || 0;
                const minutes = dur / 60;
                const perMin = minutes > 0 ? cost / minutes : 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {c.started_at ? format(new Date(c.started_at), "MMM d, h:mm a") : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{orgNameMap[c.org_id] || "Unknown"}</TableCell>
                    <TableCell className="text-muted-foreground">{agentNameMap[c.project_id] || "Unknown"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{minutes.toFixed(1)}m</TableCell>
                    <TableCell className={`text-right font-mono ${getCostColor(cost)}`}>
                      ${cost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">${perMin.toFixed(3)}</TableCell>
                    <TableCell>
                      {c.outcome ? (
                        <Badge variant="outline" className="text-xs capitalize">{c.outcome}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{c.direction}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {visibleCount < filtered.length && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="gap-1"
          >
            <ChevronDown className="h-4 w-4" />
            Load more ({filtered.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
