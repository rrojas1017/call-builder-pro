import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, BarChart3, FlaskConical, ArrowLeft, Building2 } from "lucide-react";
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
  const [joinCode, setJoinCode] = useState("");
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

        // Check for pending invitations after login (only if user has no org yet)
        const { data: { user: loggedInUser } } = await supabase.auth.getUser();
        if (loggedInUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("org_id")
            .eq("id", loggedInUser.id)
            .maybeSingle();

          if (!profile?.org_id) {
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
        }

        navigate("/dashboard");
      } else {
        const metadata: Record<string, string> = { full_name: fullName };
        if (joinCode.trim()) {
          metadata.join_code = joinCode.trim().toUpperCase();
        }
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: metadata, emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (signUpError) throw signUpError;

        // Email auto-confirm is enabled — sign the user in immediately
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          // Fallback: account exists but couldn't auto-sign-in
          toast({ title: "Account created", description: "You can sign in now." });
          setIsLogin(true);
          return;
        }

        if (joinCode.trim()) {
          toast({
            title: "Request submitted",
            description: "Your request to join the company has been submitted. An admin will review and approve your access.",
          });
        } else {
          toast({ title: "Welcome!", description: "Your account has been created." });
        }
        navigate("/dashboard");
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
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

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
                  : "Enter a company code to join an existing team, or sign up to request access."}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-12 rounded-xl text-base"
              onClick={async () => {
                const { error } = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin,
                });
                if (error) {
                  toast({ title: "Error", description: String(error), variant: "destructive" });
                }
              }}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
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
                  <div className="space-y-2">
                    <Label htmlFor="joinCode" className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Company Code
                      <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="joinCode"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="e.g. A1B2C3"
                      maxLength={6}
                      className="h-12 rounded-xl bg-muted/50 border-border/60 uppercase tracking-widest font-mono text-center"
                    />
                    <p className="text-xs text-muted-foreground">
                      Ask your company admin for the join code to request access to their team.
                    </p>
                  </div>
                </>
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
                {isLogin ? "Sign In" : joinCode.trim() ? "Request Access" : "Create Account"}
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

            <p className="text-center text-xs text-muted-foreground/70">
              <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
              {" · "}
              <Link to="/terms" className="hover:underline">Terms of Service</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
