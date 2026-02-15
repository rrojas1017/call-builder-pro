import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Archive, Phone } from "lucide-react";

interface OutboundNumber {
  id: string;
  phone_number: string;
  label: string | null;
  status: string;
  notes: string | null;
  last_used_at: string | null;
  created_at: string;
}

export default function OutboundNumbersSection() {
  const { activeOrgId, isAdmin } = useOrgContext();
  const { toast } = useToast();
  const [numbers, setNumbers] = useState<OutboundNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OutboundNumber | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState("trusted");
  const [notes, setNotes] = useState("");

  const fetchNumbers = async () => {
    if (!activeOrgId) return;
    const { data } = await supabase
      .from("outbound_numbers")
      .select("*")
      .eq("org_id", activeOrgId)
      .order("created_at", { ascending: false });
    setNumbers((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchNumbers();
  }, [activeOrgId]);

  const resetForm = () => {
    setPhoneNumber("");
    setLabel("");
    setStatus("trusted");
    setNotes("");
    setEditing(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (num: OutboundNumber) => {
    setEditing(num);
    setPhoneNumber(num.phone_number);
    setLabel(num.label || "");
    setStatus(num.status);
    setNotes(num.notes || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!activeOrgId || !phoneNumber.trim()) return;
    setSaving(true);
    try {
      const digits = phoneNumber.replace(/\D/g, "");
      const formatted = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;

      if (editing) {
        const { error } = await supabase
          .from("outbound_numbers")
          .update({ phone_number: formatted, label: label || null, status, notes: notes || null } as any)
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Number updated" });
      } else {
        const { error } = await supabase
          .from("outbound_numbers")
          .insert({ org_id: activeOrgId, phone_number: formatted, label: label || null, status, notes: notes || null } as any);
        if (error) throw error;
        toast({ title: "Number added" });
      }
      setDialogOpen(false);
      resetForm();
      fetchNumbers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRetire = async (id: string) => {
    try {
      await supabase.from("outbound_numbers").update({ status: "retired" } as any).eq("id", id);
      toast({ title: "Number retired" });
      fetchNumbers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "trusted":
        return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/20">Trusted</Badge>;
      case "untrusted":
        return <Badge variant="secondary">Untrusted</Badge>;
      case "retired":
        return <Badge variant="outline" className="text-muted-foreground">Retired</Badge>;
      default:
        return <Badge variant="secondary">{s}</Badge>;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" /> Outbound Numbers
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Save numbers that came through clean so your agents reuse them.
          </p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAdd}>
                <Plus className="mr-1 h-4 w-4" /> Add Number
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Outbound Number" : "Add Outbound Number"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="e.g. (555) 123-4567" type="tel" />
                </div>
                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. AT&T Clean Line #1" />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trusted">Trusted</SelectItem>
                      <SelectItem value="untrusted">Untrusted</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. clean on AT&T, flagged on T-Mobile" rows={2} />
                </div>
                <Button onClick={handleSave} disabled={saving || !phoneNumber.trim()} className="w-full">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editing ? "Update" : "Add Number"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {numbers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          <Phone className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No outbound numbers saved yet.</p>
          <p className="text-xs mt-1">Add numbers that came through without spam flags to reuse them.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                {isAdmin && <TableHead className="w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.map((num) => (
                <TableRow key={num.id}>
                  <TableCell className="font-mono text-sm">{num.phone_number}</TableCell>
                  <TableCell className="text-sm">{num.label || "—"}</TableCell>
                  <TableCell>{statusBadge(num.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{num.notes || "—"}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(num)} className="h-8 w-8">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {num.status !== "retired" && (
                          <Button variant="ghost" size="icon" onClick={() => handleRetire(num.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
