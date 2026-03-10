import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Square, Bot, User, Eye, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LiveSimulationChatProps {
  projectId: string;
  difficulty?: string;
  onClose?: () => void;
}

interface ChatMessage {
  speaker: "agent" | "customer";
  content: string;
  timestamp: number;
}

export default function LiveSimulationChat({ projectId, difficulty: externalDifficulty, onClose }: LiveSimulationChatProps) {
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [internalDifficulty, setInternalDifficulty] = useState("medium");
  const difficulty = externalDifficulty || internalDifficulty;
  const showDifficultyPicker = !externalDifficulty;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<"agent" | "customer" | null>(null);
  const [agentName, setAgentName] = useState("Agent");
  const [customerName, setCustomerName] = useState("Customer");
  const [turnCount, setTurnCount] = useState(0);

  const stoppedRef = useRef(false);
  const agentSystemRef = useRef("");
  const customerSystemRef = useRef("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentSpeaker]);

  const startSimulation = async () => {
    setRunning(true);
    setStopped(false);
    stoppedRef.current = false;
    setMessages([]);
    setTurnCount(0);
    setCurrentSpeaker(null);

    try {
      setCurrentSpeaker("agent");
      const { data: initData, error: initErr } = await supabase.functions.invoke("simulate-turn", {
        body: {
          action: "init",
          project_id: projectId,
          customer_difficulty: difficulty,
        },
      });

      if (initErr) throw initErr;

      const { agent_system, customer_system, opening_line, agent_name, customer_name: custName } = initData;
      agentSystemRef.current = agent_system;
      customerSystemRef.current = customer_system;
      setAgentName(agent_name || "Agent");
      setCustomerName(custName || "Customer");

      const firstMessage: ChatMessage = {
        speaker: "agent",
        content: opening_line,
        timestamp: Date.now(),
      };
      setMessages([firstMessage]);

      const chatHistory: ChatMessage[] = [firstMessage];

      const maxTurns = 12;
      for (let turn = 0; turn < maxTurns; turn++) {
        if (stoppedRef.current) break;

        // Customer turn
        setCurrentSpeaker("customer");
        await pause(800);

        if (stoppedRef.current) break;

        const { data: custData, error: custErr } = await supabase.functions.invoke("simulate-turn", {
          body: {
            action: "turn",
            role: "customer",
            agent_system: agentSystemRef.current,
            customer_system: customerSystemRef.current,
            history: chatHistory.map((m) => ({ speaker: m.speaker, content: m.content })),
          },
        });

        if (custErr) throw custErr;
        if (stoppedRef.current) break;

        const custMessage: ChatMessage = {
          speaker: "customer",
          content: custData.content,
          timestamp: Date.now(),
        };
        chatHistory.push(custMessage);
        setMessages((prev) => [...prev, custMessage]);
        setTurnCount(turn + 1);

        if (/\b(goodbye|bye|not interested|stop calling|hang up)\b/i.test(custData.content)) {
          break;
        }

        // Agent turn
        setCurrentSpeaker("agent");
        await pause(600);

        if (stoppedRef.current) break;

        const { data: agentData, error: agentErr } = await supabase.functions.invoke("simulate-turn", {
          body: {
            action: "turn",
            role: "agent",
            agent_system: agentSystemRef.current,
            customer_system: customerSystemRef.current,
            history: chatHistory.map((m) => ({ speaker: m.speaker, content: m.content })),
          },
        });

        if (agentErr) throw agentErr;
        if (stoppedRef.current) break;

        const agentMessage: ChatMessage = {
          speaker: "agent",
          content: agentData.content,
          timestamp: Date.now(),
        };
        chatHistory.push(agentMessage);
        setMessages((prev) => [...prev, agentMessage]);

        if (/\b(goodbye|bye|have a (great|good)|thank you for your time|take care)\b/i.test(agentData.content)) {
          break;
        }
      }

      setCurrentSpeaker(null);
      toast({ title: "Simulation complete", description: `${chatHistory.length} messages exchanged` });
    } catch (err: any) {
      toast({ title: "Simulation error", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setCurrentSpeaker(null);
    }
  };

  const stopSimulation = () => {
    stoppedRef.current = true;
    setStopped(true);
    setCurrentSpeaker(null);
  };

  return (
    <div className="surface-elevated rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Live Simulation</h2>
          {running && (
            <Badge variant="default" className="bg-green-500 text-white animate-pulse text-xs">
              LIVE
            </Badge>
          )}
          {!running && messages.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {messages.length} messages
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!running && showDifficultyPicker && (
            <Select value={difficulty} onValueChange={setInternalDifficulty}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          )}

          {!running ? (
            <Button onClick={startSimulation} size="sm">
              {messages.length > 0 ? (
                <><RotateCcw className="h-4 w-4" /> Restart</>
              ) : (
                <><Play className="h-4 w-4" /> Start</>
              )}
            </Button>
          ) : (
            <Button onClick={stopSimulation} variant="destructive" size="sm">
              <Square className="h-4 w-4" /> Stop
            </Button>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="p-4 h-[420px] overflow-y-auto space-y-3 bg-background/50">
        {messages.length === 0 && !running && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Eye className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              Click Start to watch your agent practice
            </p>
            <p className="text-xs text-muted-foreground/70">
              Two AIs will have a conversation — you'll see every message live
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.speaker === "customer" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] ${msg.speaker === "agent" ? "order-1" : "order-1"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {msg.speaker === "agent" ? (
                  <Bot className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  {msg.speaker === "agent" ? agentName : customerName}
                </span>
              </div>
              <p className={`text-sm rounded-xl px-3.5 py-2.5 ${
                msg.speaker === "agent"
                  ? "bg-primary/10 text-foreground rounded-tl-sm"
                  : "bg-muted text-foreground rounded-tr-sm"
              }`}>
                {msg.content}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {currentSpeaker && (
          <div className={`flex ${currentSpeaker === "customer" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[75%]">
              <div className="flex items-center gap-1.5 mb-1">
                {currentSpeaker === "agent" ? (
                  <Bot className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  {currentSpeaker === "agent" ? agentName : customerName}
                </span>
              </div>
              <div className={`flex items-center gap-1 rounded-xl px-4 py-3 ${
                currentSpeaker === "agent"
                  ? "bg-primary/10 rounded-tl-sm"
                  : "bg-muted rounded-tr-sm"
              }`}>
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Footer */}
      {messages.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
          <span>
            Turn {turnCount} of 12 max
          </span>
          <span>
            {messages.length} messages
          </span>
        </div>
      )}
    </div>
  );
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
