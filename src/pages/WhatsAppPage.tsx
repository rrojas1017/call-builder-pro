import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { MessageSquare, Send, ArrowLeft, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Conversation = {
  id: string;
  wa_number: string;
  status: string;
  created_at: string;
  updated_at: string;
  project_id: string;
};

type Message = {
  id: string;
  conversation_id: string;
  direction: string;
  body: string;
  status: string;
  created_at: string;
};

export default function WhatsAppPage() {
  const { activeOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const { data: conversations = [], isLoading: convosLoading } = useQuery({
    queryKey: ["whatsapp-conversations", activeOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("org_id", activeOrgId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Conversation[];
    },
    enabled: !!activeOrgId,
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["whatsapp-messages", selectedConvoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", selectedConvoId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!selectedConvoId,
  });

  // Realtime subscription for new messages
  useEffect(() => {
    if (!selectedConvoId) return;
    const channel = supabase
      .channel(`whatsapp-msgs-${selectedConvoId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `conversation_id=eq.${selectedConvoId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", selectedConvoId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConvoId, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send reply
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const convo = conversations.find((c) => c.id === selectedConvoId);
      if (!convo) throw new Error("No conversation selected");
      const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: {
          to_number: convo.wa_number,
          project_id: convo.project_id,
          message: text,
          conversation_id: convo.id,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", selectedConvoId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!replyText.trim()) return;
    sendMutation.mutate(replyText.trim());
  };

  const selectedConvo = conversations.find((c) => c.id === selectedConvoId);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Conversation List */}
      <div className={cn(
        "w-80 border-r border-border flex flex-col bg-card",
        selectedConvoId && "hidden md:flex"
      )}>
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            WhatsApp Chats
          </h2>
        </div>
        <ScrollArea className="flex-1">
          {convosLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No WhatsApp conversations yet.</p>
              <p className="mt-1 text-xs">Messages will appear here when contacts message your agent on WhatsApp.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {conversations.map((convo) => (
                <button
                  key={convo.id}
                  onClick={() => setSelectedConvoId(convo.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors",
                    selectedConvoId === convo.id && "bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {convo.wa_number}
                    </span>
                    <Badge variant={convo.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {convo.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(convo.updated_at), "MMM d, h:mm a")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Message Thread */}
      <div className={cn(
        "flex-1 flex flex-col",
        !selectedConvoId && "hidden md:flex"
      )}>
        {!selectedConvoId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a conversation to view messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="p-4 border-b border-border flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSelectedConvoId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="font-medium text-sm">{selectedConvo?.wa_number}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedConvo?.status === "active" ? "Active conversation" : "Closed"}
                </p>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {msgsLoading ? (
                <div className="text-sm text-muted-foreground">Loading messages...</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direction === "outbound" ? "justify-end" : "justify-start"
                      )}
                    >
                      <Card
                        className={cn(
                          "max-w-[75%] px-3 py-2 shadow-sm",
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        <p className={cn(
                          "text-[10px] mt-1",
                          msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {format(new Date(msg.created_at), "h:mm a")}
                        </p>
                      </Card>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Reply Input */}
            <div className="p-4 border-t border-border flex gap-2">
              <Input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                disabled={sendMutation.isPending}
              />
              <Button
                onClick={handleSend}
                disabled={!replyText.trim() || sendMutation.isPending}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
