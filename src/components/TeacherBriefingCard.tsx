import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { GraduationCap, Loader2 } from "lucide-react";

interface TeacherBriefing {
  persona: { name: string; age: number; situation: string };
  challenges: string[];
  difficulty: string;
}

interface TeacherBriefingCardProps {
  briefing: TeacherBriefing | null;
  loading: boolean;
}

const difficultyColors: Record<string, string> = {
  Easy: "bg-green-500/15 text-green-400 border-green-500/30",
  Medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  Hard: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function TeacherBriefingCard({ briefing, loading }: TeacherBriefingCardProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating your briefing...
        </CardContent>
      </Card>
    );
  }

  if (!briefing) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            Teacher Briefing
          </CardTitle>
          <Badge variant="outline" className={difficultyColors[briefing.difficulty] || ""}>
            {briefing.difficulty}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Your Persona</p>
          <p className="text-sm text-foreground">
            <span className="font-semibold">{briefing.persona.name}, {briefing.persona.age}</span>
            {" — "}
            {briefing.persona.situation}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Challenge the AI</p>
          <div className="space-y-2">
            {briefing.challenges.map((challenge, i) => (
              <label key={i} className="flex items-start gap-2 cursor-pointer group">
                <Checkbox
                  checked={checked[i] || false}
                  onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [i]: !!v }))}
                  className="mt-0.5"
                />
                <span className={`text-sm transition-colors ${checked[i] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {challenge}
                </span>
              </label>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
