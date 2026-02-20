import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Save, Eye, Bot, Phone, Megaphone, UserPlus } from "lucide-react";

interface Member {
  id: string;
  full_name: string | null;
  role: string;
}

export default function AdminCompanyDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { switchOrg } = useOrgContext();
  const { toast } = useToast();

  const [orgName, setOrgName] = useState("");
  const [balance, setBalance] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add User dialog
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [addingUser, setAddingUser] = useState(false);

  const loadMembers = async () => {
    if (!orgId) return;
    const [orgRes, profilesRes, rolesRes] = await Promise.all([
      supabase.from("organizations").select("name, credits_balance").eq("id", orgId).single(),
      supabase.from("profiles").select("id, full_name").eq("org_id", orgId),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    setOrgName(orgRes.data?.name ?? "");
    setBalance(orgRes.data?.credits_balance ?? 0);

    const roleMap: Record<string, string> = {};
    (rolesRes.data ?? []).forEach((r: any) => { roleMap[r.user_id] = r.role; });

    setMembers(
      (profilesRes.data ?? []).map((p) => ({
        ...p,
        role: roleMap[p.id] ?? "viewer",
      }))
    );
    setLoading(false);
  };

  useEffect(() => { loadMembers(); }, [orgId]);

  const handleSaveName = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("organizations").update({ name: orgName }).eq("id", orgId);
      if (error) throw error;
      toast({ title: "Company name updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const { data, error } = await supabase.rpc("manage_team_member_role", {
        target_user_id: userId,
        new_role: newRole as any,
        action: "assign",
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      toast({ title: "Role updated" });
      setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, role: newRole } : m));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleViewAs = () => {
    if (!orgId) return;
    switchOrg(orgId, orgName);
    navigate("/dashboard");
  };

  const handleAddUser = async () => {
    if (!newEmail || !newPassword || !orgId) return;
    setAddingUser(true);
    try {
      const res = await supabase.functions.invoke("create-user", {
        body: {
          email: newEmail,
          password: newPassword,
          full_name: newFullName,
          org_id: orgId,
          role: newRole,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "User created successfully" });
      setShowAddUser(false);
      setNewEmail("");
      setNewFullName("");
      setNewPassword("");
      setNewRole("viewer");
      await loadMembers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddingUser(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/companies")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Companies
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{orgName}</h1>
        <Button variant="outline" onClick={handleViewAs}>
          <Eye className="h-4 w-4 mr-1" /> View as this company
        </Button>
      </div>

      {/* Org Details */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <div className="flex gap-2">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              <Button onClick={handleSaveName} disabled={saving} size="icon">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Credit Balance</Label>
            <p className="text-2xl font-bold font-mono text-foreground">${balance.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={() => { switchOrg(orgId!, orgName); navigate("/agents"); }}>
            <Bot className="h-4 w-4 mr-1" /> Agents
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { switchOrg(orgId!, orgName); navigate("/campaigns"); }}>
            <Megaphone className="h-4 w-4 mr-1" /> Campaigns
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { switchOrg(orgId!, orgName); navigate("/calls"); }}>
            <Phone className="h-4 w-4 mr-1" /> Calls
          </Button>
        </div>
      </div>

      {/* Members */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Members ({members.length})</h2>
          <Button size="sm" onClick={() => setShowAddUser(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Add User
          </Button>
        </div>
        <div className="surface-elevated rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.full_name || "Unnamed"}</TableCell>
                  <TableCell>
                    <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">super_admin</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="analyst">analyst</SelectItem>
                        <SelectItem value="viewer">viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to {orgName}</DialogTitle>
            <DialogDescription>Create a new user and assign them to this company.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="analyst">Analyst</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddUser(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={addingUser || !newEmail || !newPassword}>
              {addingUser ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
