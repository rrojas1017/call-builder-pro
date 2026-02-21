import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RetellAgentConfig {
  agent_id: string;
  agent_name: string;
  voice_id: string | null;
  language: string;
  webhook_url: string | null;
  agent_type?: string;
  is_transfer_agent?: boolean;
  response_engine?: { type: string; llm_id?: string };
}

export function useRetellAgent(agentId: string | null | undefined) {
  const [config, setConfig] = useState<RetellAgentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("manage-retell-agent", {
        body: { action: "get", agent_id: id },
      });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setConfig(data);
    } catch (e: any) {
      setError(e.message);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agentId) fetchAgent(agentId);
    else setConfig(null);
  }, [agentId]);

  const createAgent = async (cfg: {
    agent_name?: string;
    voice_id?: string;
    language?: string;
  }): Promise<RetellAgentConfig | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("manage-retell-agent", {
        body: { action: "create", config: cfg },
      });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setConfig(data);
      return data;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateAgent = async (
    id: string,
    cfg: { agent_name?: string; voice_id?: string; language?: string }
  ): Promise<RetellAgentConfig | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("manage-retell-agent", {
        body: { action: "update", agent_id: id, config: cfg },
      });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setConfig(data);
      return data;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const switchToOutbound = async (id: string): Promise<RetellAgentConfig | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("manage-retell-agent", {
        body: { action: "switch_to_outbound", agent_id: id },
      });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setConfig(data);
      return data;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { config, loading, error, createAgent, updateAgent, switchToOutbound, refetch: fetchAgent };
}
