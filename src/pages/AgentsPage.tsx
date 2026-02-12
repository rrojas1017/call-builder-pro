import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Bot, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  use_case?: string;
}

export default function AgentsPage() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("agent_projects")
        .select("id, name, description, created_at")
        .order("created_at", { ascending: false });
      setAgents(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agents</h1>
          <p className="text-muted-foreground mt-1">Manage your AI phone agents.</p>
        </div>
        <Link to="/create-agent">
          <Button><Plus className="mr-2 h-4 w-4" /> New Agent</Button>
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="surface-elevated rounded-xl p-12 text-center space-y-4">
          <Bot className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No agents yet. Create your first one!</p>
          <Link to="/create-agent">
            <Button><Plus className="mr-2 h-4 w-4" /> Create Agent</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              to={`/campaigns?project=${agent.id}`}
              className="surface-elevated rounded-xl p-5 space-y-3 hover:border-primary/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground">{new Date(agent.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              {agent.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
