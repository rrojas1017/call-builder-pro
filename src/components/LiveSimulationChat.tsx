import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Square, Bot, User, Eye, RotateCcw, GraduationCap, Zap, MessageCircle, Send, CheckCircle, BookmarkPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { detectBusinessRuleIntent } from "@/lib/detectBusinessRuleIntent";
import { addBusinessRule } from "@/lib/addBusinessRule";

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
  const { activeOrgId } = useOrgContext();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

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
  const [learning, setLearning] = useState(false);
  const [learnResult, setLearnResult] = useState<{ fixesApplied: number; score: number | null } | null>(null);

  // Feedback state
  const [feedbackMessageIndex, setFeedbackMessageIndex] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [applyingFeedback, setApplyingFeedback] = useState(false);
  const [feedbackApplied, setFeedbackApplied] = useState<string[]>([]);

  const stoppedRef = useRef(false);
  const agentSystemRef = useRef("");
  const customerSystemRef = useRef("");

  const invokeWithRetry = async (fnName: string, body: Record<string, any>) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke(fnName, { body });
        if (error) throw error;
        return data;
      } catch {
        if (attempt === 0) await pause(2000);
      }
    }
    return null;
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (isNearBottom.current) {
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
  }, [messages]);

  const handleSubmitFeedback = async (feedback: string, contextMessage?: ChatMessage) => {
    if (!feedback.trim() || applyingFeedback) return;
    setApplyingFeedback(true);

    try {
      let recommendation = feedback.trim();
      if (contextMessage) {
        const speaker = contextMessage.speaker === "agent" ? agentName : customerName;
        recommendation = `During a simulated call, the ${speaker} said: "${contextMessage.content.substring(0, 150)}". User feedback: ${feedback.trim()}`;
      }

      const { data, error } = await supabase.functions.invoke("apply-audit-recommendation", {
        body: {
          project_id: projectId,
          recommendation,
          category: "user_feedback",
        },
      });

      if (error) throw error;

      const desc = data?.action === "patch_spec"
        ? `Updated: ${data?.field || "agent config"}`
        : data?.action === "add_knowledge"
        ? "Added to agent knowledge"
        : "Noted for manual review";

      setFeedbackApplied((prev) => [...prev, feedback.trim()]);
      toast({ title: "Feedback applied!", description: desc });
      setFeedbackText("");
      setGeneralFeedback("");
      setFeedbackMessageIndex(null);
    } catch (err: any) {
      toast({ title: "Failed to apply feedback", description: err.message, variant: "destructive" });
    } finally {
      setApplyingFeedback(false);
    }
  };

  const startSimulation = async () => {
    setRunning(true);
    setStopped(false);
    stoppedRef.current = false;
    setMessages([]);
    setTurnCount(0);
    setCurrentSpeaker(null);
    setLearnResult(null);
    setFeedbackMessageIndex(null);
    setFeedbackApplied([]);

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
      let connectionLost = false;

      // Interruption chance by difficulty
      const interruptChance: Record<string, number> = { easy: 0.1, medium: 0.25, hard: 0.4 };
      const chance = interruptChance[difficulty] || 0.25;

      for (let turn = 0; turn < maxTurns; turn++) {
        if (stoppedRef.current) break;

        setCurrentSpeaker("customer");
        await pause(800);
        if (stoppedRef.current) break;

        const custData = await invokeWithRetry("simulate-turn", {
          action: "turn",
          role: "customer",
          agent_system: agentSystemRef.current,
          customer_system: customerSystemRef.current,
          history: chatHistory.map((m) => ({ speaker: m.speaker, content: m.content })),
        });

        if (!custData) { connectionLost = true; break; }
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

        setCurrentSpeaker("agent");
        await pause(600);
        if (stoppedRef.current) break;

        const agentData = await invokeWithRetry("simulate-turn", {
          action: "turn",
          role: "agent",
          agent_system: agentSystemRef.current,
          customer_system: customerSystemRef.current,
          history: chatHistory.map((m) => ({ speaker: m.speaker, content: m.content })),
        });

        if (!agentData) { connectionLost = true; break; }
        if (stoppedRef.current) break;

        let agentContent = agentData.content;
        let interrupted = false;

        // Roll for customer interruption
        if (Math.random() < chance && agentContent.length > 40) {
          interrupted = true;
          // Truncate at 40-70% of message at a word boundary
          const cutRatio = 0.4 + Math.random() * 0.3;
          const cutPoint = Math.floor(agentContent.length * cutRatio);
          const lastSpace = agentContent.lastIndexOf(" ", cutPoint);
          const truncAt = lastSpace > 20 ? lastSpace : cutPoint;
          agentContent = agentContent.slice(0, truncAt).replace(/[,.\s]+$/, "") + "—";
        }

        const agentMessage: ChatMessage = {
          speaker: "agent",
          content: agentContent,
          timestamp: Date.now(),
        };
        chatHistory.push(agentMessage);
        setMessages((prev) => [...prev, agentMessage]);

        if (!interrupted && /\b(goodbye|bye|have a (great|good)|thank you for your time|take care)\b/i.test(agentContent)) {
          break;
        }

        // If interrupted, immediately fire customer turn without waiting
        if (interrupted) {
          if (stoppedRef.current) break;
          setCurrentSpeaker("customer");
          await pause(300); // Quick interruption pause

          const intData = await invokeWithRetry("simulate-turn", {
            action: "turn",
            role: "customer",
            agent_system: agentSystemRef.current,
            customer_system: customerSystemRef.current,
            history: chatHistory.map((m) => ({ speaker: m.speaker, content: m.content })),
          });

          if (!intData) { connectionLost = true; break; }
          if (stoppedRef.current) break;

          const intMessage: ChatMessage = {
            speaker: "customer",
            content: intData.content,
            timestamp: Date.now(),
          };
          chatHistory.push(intMessage);
          setMessages((prev) => [...prev, intMessage]);
          setTurnCount(turn + 1);

          if (/\b(goodbye|bye|not interested|stop calling|hang up)\b/i.test(intData.content)) {
            break;
          }
        }
      }

      setCurrentSpeaker(null);
      if (connectionLost) {
        toast({ title: "Simulation ended early", description: "Connection issue — you can still Save & Learn from the partial conversation." });
      } else {
        toast({ title: "Simulation complete", description: `${chatHistory.length} messages exchanged` });
      }
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

  const handleSaveAndLearn = async () => {
    if (messages.length < 4) {
      toast({ title: "Not enough data", description: "Need at least a few exchanges to evaluate.", variant: "destructive" });
      return;
    }
    if (!activeOrgId) {
      toast({ title: "Missing organization", description: "Could not determine your organization.", variant: "destructive" });
      return;
    }

    setLearning(true);
    try {
      const transcript = messages
        .map((m) => `${m.speaker === "agent" ? "Agent" : "User"}: ${m.content}`)
        .join("\n");

      const { data: callRow, error: insertErr } = await supabase
        .from("calls")
        .insert({
          org_id: activeOrgId,
          project_id: projectId,
          transcript,
          voice_provider: "simulated",
          direction: "outbound",
          outcome: "simulated",
          duration_seconds: Math.round((messages[messages.length - 1].timestamp - messages[0].timestamp) / 1000),
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      const { data: evalData, error: evalErr } = await supabase.functions.invoke("evaluate-call", {
        body: { call_id: callRow.id },
      });

      if (evalErr) throw evalErr;

      const evaluation = evalData?.evaluation ?? evalData;
      const score = evaluation?.overall_score ?? null;
      let fixesApplied = 0;

      const recs = evaluation?.recommended_improvements ?? evaluation?.recommended_fixes ?? [];
      if (recs.length > 0) {
        const criticalRecs = recs.filter(
          (r: any) => r.severity === "critical" || r.severity === "important"
        );

        for (const rec of criticalRecs) {
          try {
            const { data: applyResult } = await supabase.functions.invoke("apply-audit-recommendation", {
              body: {
                project_id: projectId,
                recommendation: `${rec.reason}. Set ${rec.field} to: ${rec.suggested_value}`,
                category: "save_and_learn",
              },
            });
            if (applyResult?.success) fixesApplied++;
          } catch {
            // Non-critical
          }
        }
      }

      setLearnResult({ fixesApplied, score });
      toast({
        title: "Agent learned!",
        description: fixesApplied > 0
          ? `Score: ${score ?? "—"}/10. ${fixesApplied} improvement${fixesApplied > 1 ? "s" : ""} applied.`
          : `Score: ${score ?? "—"}/10. No critical fixes needed.`,
      });
    } catch (err: any) {
      toast({ title: "Learning failed", description: err.message, variant: "destructive" });
    } finally {
      setLearning(false);
    }
  };

  const conversationDone = !running && messages.length >= 4;

  return (
    <div className="surface-elevated rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Live Simulation</h2>
          {running && (
            <Badge variant="default" className="bg-primary text-primary-foreground animate-pulse text-xs">
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
      <div ref={scrollContainerRef} onScroll={handleScroll} className="p-4 h-[420px] overflow-y-auto space-y-3 bg-background/50">
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
          <div key={i} className="space-y-1">
            <div className={`flex ${msg.speaker === "customer" ? "justify-end" : "justify-start"}`}>
              <div
                onClick={() => {
                  if (!running) {
                    setFeedbackMessageIndex(feedbackMessageIndex === i ? null : i);
                    setFeedbackText("");
                  }
                }}
                className={`max-w-[80%] rounded-xl px-3.5 py-2.5 cursor-pointer transition-all ${
                  msg.speaker === "agent"
                    ? "bg-primary/10 border border-primary/20 hover:border-primary/40 rounded-tl-sm"
                    : "bg-muted border border-border hover:border-muted-foreground/30 rounded-tr-sm"
                } ${feedbackMessageIndex === i ? "ring-2 ring-primary/30" : ""}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {msg.speaker === "agent" ? (
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    {msg.speaker === "agent" ? agentName : customerName}
                  </span>
                  {!running && (
                    <MessageCircle className="h-3 w-3 text-muted-foreground/40 ml-auto" />
                  )}
                </div>
                <p className="text-sm text-foreground">{msg.content}</p>
              </div>
            </div>

            {/* Inline feedback input */}
            {feedbackMessageIndex === i && (
              <div className={`flex ${msg.speaker === "customer" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%] flex gap-1.5 items-center">
                  <Input
                    placeholder="Give feedback on this message..."
                    className="h-8 text-xs"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && feedbackText.trim()) {
                        handleSubmitFeedback(feedbackText, msg);
                      }
                    }}
                    disabled={applyingFeedback}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleSubmitFeedback(feedbackText, msg)}
                    disabled={!feedbackText.trim() || applyingFeedback}
                  >
                    {applyingFeedback ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            )}
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
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-xs text-muted-foreground">
              Turn {turnCount} of 12 max • {messages.length} messages
            </span>
            <div className="flex items-center gap-2">
              {feedbackApplied.length > 0 && (
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  <CheckCircle className="h-3 w-3 mr-0.5" />
                  {feedbackApplied.length} applied
                </Badge>
              )}
              {learnResult && (
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  <Zap className="h-3 w-3 mr-0.5" />
                  {learnResult.score != null && `${learnResult.score}/10`}
                  {learnResult.fixesApplied > 0 && ` • ${learnResult.fixesApplied} fix${learnResult.fixesApplied > 1 ? "es" : ""}`}
                </Badge>
              )}
              {conversationDone && !learnResult && (
                <Button size="sm" variant="outline" onClick={handleSaveAndLearn} disabled={learning}>
                  {learning ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Learning...</>
                  ) : (
                    <><GraduationCap className="h-3.5 w-3.5" /> Save & Learn</>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* General feedback box */}
          {messages.length > 2 && (
            <div className="px-5 pb-4 pt-1">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Coach Your Agent</span>
              </div>
              <div className="flex gap-2">
                <Textarea
                  placeholder="e.g. &quot;Stop using filler words&quot; or &quot;Ask for zip code before income&quot;"
                  className="text-xs min-h-0 resize-none"
                  value={generalFeedback}
                  onChange={(e) => setGeneralFeedback(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && generalFeedback.trim()) {
                      e.preventDefault();
                      handleSubmitFeedback(generalFeedback);
                    }
                  }}
                  disabled={applyingFeedback}
                  rows={1}
                />
                <Button
                  size="sm"
                  className="h-8 px-3 self-end"
                  onClick={() => handleSubmitFeedback(generalFeedback)}
                  disabled={!generalFeedback.trim() || applyingFeedback}
                >
                  {applyingFeedback ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
