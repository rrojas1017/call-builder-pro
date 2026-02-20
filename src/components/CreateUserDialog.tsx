import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Check } from "lucide-react";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onSuccess: () => void;
}

export default function CreateUserDialog({ open, onOpenChange, orgId, onSuccess }: CreateUserDialogProps) {
  const { toast } = useToast();
  const { isSuperAdmin } = useOrgContext();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [creating, setCreating] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail("");
    setFullName("");
    setPassword("");
    setRole("viewer");
    setCreatedCreds(null);
    setCopied(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleCreate = async () => {
    if (!email || !password) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email, password, full_name: fullName, org_id: orgId, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCreatedCreds({ email, password });
      toast({ title: "User created successfully" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdCreds) return;
    await navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{createdCreds ? "User Created" : "Create User"}</DialogTitle>
          <DialogDescription>
            {createdCreds
              ? "Share these credentials with the new team member."
              : "Create a new user with login credentials."}
          </DialogDescription>
        </DialogHeader>

        {createdCreds ? (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border bg-muted p-4 space-y-2 font-mono text-sm">
              <p><span className="text-muted-foreground">Email:</span> {createdCreds.email}</p>
              <p><span className="text-muted-foreground">Password:</span> {createdCreds.password}</p>
            </div>
            <Button onClick={handleCopy} className="w-full" variant={copied ? "secondary" : "default"}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copied!" : "Copy Credentials"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="user@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder="Minimum 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="analyst">Analyst</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={creating || !email || !password} className="w-full">
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create User
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
