import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, CheckCircle2, ChevronDown, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { useRetellAgent } from "@/hooks/useRetellAgent";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface RetellAgentManagerProps {
  retellAgentId: string;
  onAgentIdChange: (id: string) => void;
  personaName?: string;
  voiceId?: string;
  language?: string;
}

export function RetellAgentManager({
  retellAgentId,
  onAgentIdChange,
  personaName,
  voiceId,
  language,
}: RetellAgentManagerProps) {
  const { toast } = useToast();
  const { config, loading, error, createAgent, switchToOutbound } = useRetellAgent(
    retellAgentId || null
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mapLanguage = (lang?: string) => {
    const map: Record<string, string> = {
      en: "en-US", es: "es-ES", fr: "fr-FR", pt: "pt-BR", de: "de-DE", it: "it-IT",
    };
    return map[lang || "en"] || "en-US";
  };

  const handleCreate = async () => {
    const result = await createAgent({
      agent_name: personaName || "Appendify Agent",
      voice_id: voiceId || undefined,
      language: mapLanguage(language),
    });
    if (result?.agent_id) {
      onAgentIdChange(result.agent_id);
      toast({ title: "Append agent created!", description: `Agent ID: ${result.agent_id}` });
    } else if (error) {
      toast({ title: "Failed to create agent", description: error, variant: "destructive" });
    }
  };

  // No agent yet — show create button
  if (!retellAgentId) {
    return (
      <div className="space-y-3">
        <Button onClick={handleCreate} disabled={loading} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Create Append Agent
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          We'll create a new agent with your current settings and auto-configure the webhook.
        </p>

        {/* Manual fallback */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto">
            <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-180")} />
            Or enter an existing Agent ID manually
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            <Input
              value={retellAgentId}
              onChange={(e) => onAgentIdChange(e.target.value)}
              placeholder="e.g. agent_abc123"
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  // Agent exists — show read-only status card
  const isTransferAgent = config?.is_transfer_agent === true || 
    (config as any)?.agent_type === "transfer";

  return (
    <div className="space-y-3">
      {/* Status card (read-only) */}
      {config && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-foreground">Append Agent Connected</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Agent ID</span>
            <span className="text-foreground font-mono truncate">{config.agent_id}</span>
            <span className="text-muted-foreground">Name</span>
            <span className="text-foreground">{config.agent_name || "—"}</span>
            <span className="text-muted-foreground">Voice</span>
            <span className="text-foreground">{config.voice_id || "Default"}</span>
            <span className="text-muted-foreground">Language</span>
            <span className="text-foreground">{config.language || "en-US"}</span>
            <span className="text-muted-foreground">Webhook</span>
            <span className="text-foreground truncate">{config.webhook_url ? "✓ Configured" : "✗ Missing"}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Settings are synced automatically when you save changes.
          </p>
        </div>
      )}

      {/* Transfer agent warning */}
      {isTransferAgent && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
              Transfer agent detected
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Transfer agents cannot make outbound calls. This agent needs to be reconfigured as an outbound agent.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-400"
            onClick={async () => {
              const result = await switchToOutbound(retellAgentId);
              if (result) {
                toast({ title: "Switched to outbound!", description: "This agent can now make outbound calls." });
              } else if (error) {
                toast({ title: "Failed to switch", description: error, variant: "destructive" });
              }
            }}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
            Switch to Outbound
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {loading && !config && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Advanced: manual ID override */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-180")} />
          Advanced: Change Agent ID
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          <Label className="text-xs">Agent ID</Label>
          <Input
            value={retellAgentId}
            onChange={(e) => onAgentIdChange(e.target.value)}
            placeholder="e.g. agent_abc123"
            className="font-mono text-sm"
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
