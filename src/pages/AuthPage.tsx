import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, BarChart3, FlaskConical } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import appendifyLogo from "@/assets/appendify-logo.png";

const valueProps = [
  { icon: MessageSquare, text: "Natural, human-like conversations" },
  { icon: BarChart3, text: "Scale to thousands of calls instantly" },
  { icon: FlaskConical, text: "AI-powered testing and improvement" },
];

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Check for pending invitations after login
        const { data: { user: loggedInUser } } = await supabase.auth.getUser();
        if (loggedInUser) {
          const { data: invitations } = await supabase
            .from("org_invitations")
            .select("id")
            .eq("email", email.toLowerCase().trim())
            .eq("status", "pending")
            .limit(1);
          if (invitations && invitations.length > 0) {
            const { data: result } = await supabase.rpc("accept_invitation", {
              invitation_id: invitations[0].id,
            });
            const r = result as any;
            if (r?.success) {
              toast({ title: "Invitation accepted", description: "You've joined the organization." });
            }
          }
        }

        navigate("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "We sent you a confirmation link." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center p-16">
        {/* Mesh gradient background */}
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[150px]" />

        <div className="relative z-10 max-w-md">
          <Link to="/" className="flex items-center gap-3 mb-12">
            <img src={appendifyLogo} alt="Appendify Voz" className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold tracking-tight">Appendify Voz</span>
          </Link>

          <h2 className="text-4xl font-bold tracking-[-0.02em] leading-tight mb-5">
            Build AI Voice Agents{" "}
            <span className="text-gradient-primary">in Minutes</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
            Create, test, and deploy intelligent phone agents that handle real conversations at scale.
          </p>

          <div className="space-y-6">
            {valueProps.map((vp) => (
              <div key={vp.text} className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <vp.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-foreground/80">{vp.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center space-y-2 mb-10">
            <Link to="/" className="inline-flex items-center gap-2">
              <img src={appendifyLogo} alt="Appendify Voz" className="h-10 w-10 object-contain" />
              <span className="text-xl font-bold tracking-tight">Appendify Voz</span>
            </Link>
          </div>

          <div className="glass-card rounded-2xl p-8 space-y-7">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {isLogin ? "Welcome back" : "Create your account"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isLogin
                  ? "Sign in to manage your AI voice agents."
                  : "Start building AI voice agents for free."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    className="h-12 rounded-xl bg-muted/50 border-border/60"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="h-12 rounded-xl bg-muted/50 border-border/60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-12 rounded-xl bg-muted/50 border-border/60"
                />
              </div>
              <Button type="submit" className="w-full h-12 rounded-xl text-base mt-2" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="font-medium text-primary hover:underline"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
