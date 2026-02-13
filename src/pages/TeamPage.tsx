import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Trash2, Users, Plus } from "lucide-react";
import CreateUserDialog from "@/components/CreateUserDialog";

interface TeamMember {
  id: string;
  full_name: string | null;
  org_id: string | null;
  role: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export default function TeamPage() {
  const { user } = useAuth();
  const { activeOrgId } = useOrgContext();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("viewer");
  const [inviting, setInviting] = useState(false);

  const loadTeam = async () => {
    if (!user || !activeOrgId) return;

    // Get all profiles in the org
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, org_id")
      .eq("org_id", activeOrgId);

    // Get roles for those users
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const roleMap: Record<string, string> = {};
    (roles || []).forEach((r: any) => {
      roleMap[r.user_id] = r.role;
    });

    const teamMembers = (profiles || []).map((p: any) => ({
      ...p,
      role: roleMap[p.id] || "viewer",
    }));

    setMembers(teamMembers);

    // Load invitations
    const { data: invs } = await supabase
      .from("org_invitations")
      .select("*")
      .eq("org_id", activeOrgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    setInvitations((invs || []) as Invitation[]);
    setLoading(false);
  };

  useEffect(() => {
    loadTeam();
  }, [user, activeOrgId]);

  const handleInvite = async () => {
    if (!user || !activeOrgId || !inviteEmail) return;
    setInviting(true);
    try {
      const { error } = await supabase.from("org_invitations").insert({
        org_id: activeOrgId,
        email: inviteEmail.toLowerCase().trim(),
        role: inviteRole as "admin" | "analyst" | "viewer" | "super_admin",
        invited_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Invitation sent", description: `Invited ${inviteEmail} as ${inviteRole}` });
      setInviteEmail("");
      setInviteOpen(false);
      loadTeam();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    try {
      const { data, error } = await supabase.rpc("manage_team_member_role", {
        target_user_id: targetUserId,
        new_role: newRole as "admin" | "analyst" | "viewer" | "super_admin",
        action: "assign",
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      toast({ title: "Role updated" });
      loadTeam();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (targetUserId === user?.id) {
      toast({ title: "Error", description: "Cannot remove yourself", variant: "destructive" });
      return;
    }
    try {
      const { data, error } = await supabase.rpc("manage_team_member_role", {
        target_user_id: targetUserId,
        new_role: "viewer",
        action: "remove",
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      toast({ title: "Member removed" });
      loadTeam();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleCancelInvite = async (invId: string) => {
    try {
      const { error } = await supabase
        .from("org_invitations")
        .update({ status: "expired" })
        .eq("id", invId);
      if (error) throw error;
      toast({ title: "Invitation cancelled" });
      loadTeam();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case "super_admin": return "destructive";
      case "admin": return "default";
      case "analyst": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Team
          </h1>
          <p className="text-muted-foreground mt-1">Manage your organization's members and roles.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={() => setCreateUserOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create User
            </Button>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><UserPlus className="mr-2 h-4 w-4" /> Invite Member</Button>
              </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a Team Member</DialogTitle>
              <DialogDescription>Send an invitation to join your organization.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail} className="w-full">
                {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Invitation
              </Button>
            </div>
          </DialogContent>
        </Dialog>
          </div>
        )}
      </div>
      <CreateUserDialog
        open={createUserOpen}
        onOpenChange={setCreateUserOpen}
        orgId={activeOrgId!}
        onSuccess={loadTeam}
      />
      {/* Members Table */}
      <div className="surface-elevated rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  {m.full_name || "Unnamed"}
                  {m.id === user?.id && <span className="text-muted-foreground ml-2 text-xs">(you)</span>}
                </TableCell>
                <TableCell>
                  {m.id === user?.id ? (
                    <Badge variant={roleBadgeColor(m.role) as any}>{m.role}</Badge>
                  ) : (
                    <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="analyst">analyst</SelectItem>
                        <SelectItem value="viewer">viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {m.id !== user?.id && (
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Pending Invitations</h2>
          <div className="surface-elevated rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell><Badge variant="outline">{inv.role}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleCancelInvite(inv.id)}>
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
