import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Wand2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ScriptBuilderProps {
  projectId: string;
  personaName: string;
  useCase: string;
  language: string;
  toneStyle: string;
  mustCollectFields: string[];
  currentOpeningLine: string;
  onApplyOpeningLine: (line: string) => void;
  onApplyTone?: (tone: string) => void;
}

interface ScriptResult {
  opening_line: string;
  tone_style: string;
  conversation_flow: string;
  tips: string[];
}

export function ScriptBuilder({
  projectId,
  personaName,
  useCase,
  language,
  toneStyle,
  mustCollectFields,
  currentOpeningLine,
  onApplyOpeningLine,
  onApplyTone,
}: ScriptBuilderProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerate = async (type: "opening_line" | "full_script") => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-script", {
        body: {
          project_id: projectId,
          type,
          persona_name: personaName,
          use_case: useCase,
          language,
          tone_style: toneStyle,
          must_collect_fields: mustCollectFields,
          current_opening_line: currentOpeningLine,
          user_prompt: userPrompt,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (err: any) {
      toast({ title: "Script generation failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleApplyOpeningLine = () => {
    if (result?.opening_line) {
      onApplyOpeningLine(result.opening_line);
      toast({ title: "Opening line applied!" });
    }
  };

  const handleApplyTone = () => {
    if (result?.tone_style && onApplyTone) {
      onApplyTone(result.tone_style);
      toast({ title: "Tone style applied!" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Wand2 className="h-3.5 w-3.5" />
          AI Script Builder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            AI Script Builder
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Generate an optimized opening line or full conversation script based on your agent's configuration and best practices.
            </p>
            <Textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              rows={2}
              placeholder="Optional: Add specific instructions (e.g. 'Make it more casual', 'Focus on Medicare advantages')"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => handleGenerate("opening_line")} disabled={loading} variant="outline" className="flex-1">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate Opening Line
            </Button>
            <Button onClick={() => handleGenerate("full_script")} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Build Full Script
            </Button>
          </div>

          {result && (
            <div className="space-y-4 pt-2 border-t border-border">
              {/* Opening Line */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Opening Line</p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(result.opening_line, "opening")}
                      className="h-7 px-2"
                    >
                      {copiedField === "opening" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="default" size="sm" onClick={handleApplyOpeningLine} className="h-7 px-2 text-xs">
                      Apply
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm text-foreground italic">"{result.opening_line}"</p>
                </div>
              </div>

              {/* Tone */}
              {result.tone_style && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Recommended Tone</p>
                    {onApplyTone && (
                      <Button variant="default" size="sm" onClick={handleApplyTone} className="h-7 px-2 text-xs">
                        Apply
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{result.tone_style}</p>
                </div>
              )}

              {/* Conversation Flow */}
              {result.conversation_flow && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Conversation Flow Guide</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(result.conversation_flow, "flow")}
                      className="h-7 px-2"
                    >
                      {copiedField === "flow" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <pre className="text-xs text-foreground whitespace-pre-wrap font-sans">{result.conversation_flow}</pre>
                  </div>
                </div>
              )}

              {/* Tips */}
              {result.tips && result.tips.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Best Practice Tips</p>
                  <ul className="space-y-1">
                    {result.tips.map((tip, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                        <span className="text-primary font-bold">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
