import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Phone, Bot, Megaphone, CheckCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

interface Stats {
  agents: number;
  campaigns: number;
  calls: number;
  completed: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ agents: 0, campaigns: 0, calls: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ full_name: string; org_id: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    
    const load = async () => {
      const { data: prof } = await supabase.from("profiles").select("full_name, org_id").eq("id", user.id).single();
      setProfile(prof);

      if (prof?.org_id) {
        const [agents, campaigns, calls, completed] = await Promise.all([
          supabase.from("agent_projects").select("id", { count: "exact", head: true }).eq("org_id", prof.org_id),
          supabase.from("campaigns").select("id", { count: "exact", head: true }),
          supabase.from("calls").select("id", { count: "exact", head: true }).eq("org_id", prof.org_id),
          supabase.from("calls").select("id", { count: "exact", head: true }).eq("org_id", prof.org_id).eq("outcome", "completed"),
        ]);
        setStats({
          agents: agents.count ?? 0,
          campaigns: campaigns.count ?? 0,
          calls: calls.count ?? 0,
          completed: completed.count ?? 0,
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const cards = [
    { label: "Agents", value: stats.agents, icon: Bot, color: "text-primary" },
    { label: "Campaigns", value: stats.campaigns, icon: Megaphone, color: "text-warning" },
    { label: "Total Calls", value: stats.calls, icon: Phone, color: "text-accent-foreground" },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-success" },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your phone agents.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="surface-elevated rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="surface-elevated rounded-xl p-8 text-center space-y-4">
        <Bot className="h-12 w-12 text-primary mx-auto" />
        <h2 className="text-xl font-semibold text-foreground">Create Your First Agent</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Build an AI phone agent in minutes. Write a prompt, answer a few questions, and start calling.
        </p>
        <Link
          to="/create-agent"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Create Agent
        </Link>
      </div>
    </div>
  );
}
