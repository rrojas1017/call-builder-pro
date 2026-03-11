import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESET_TRAITS, parseHumanizationNotes, buildHumanizationNotes } from "@/lib/personalityTraits";

interface PersonalityTraitSelectorProps {
  value: string[];
  onChange: (notes: string[]) => void;
}

export function PersonalityTraitSelector({ value, onChange }: PersonalityTraitSelectorProps) {
  const [customInput, setCustomInput] = useState("");
  const { selectedLabels, customDirectives } = parseHumanizationNotes(value);

  const toggleTrait = (label: string) => {
    const next = selectedLabels.includes(label)
      ? selectedLabels.filter(l => l !== label)
      : [...selectedLabels, label];
    onChange(buildHumanizationNotes(next, customDirectives));
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed || customDirectives.includes(trimmed)) return;
    onChange(buildHumanizationNotes(selectedLabels, [...customDirectives, trimmed]));
    setCustomInput("");
  };

  const removeCustom = (idx: number) => {
    const next = customDirectives.filter((_, i) => i !== idx);
    onChange(buildHumanizationNotes(selectedLabels, next));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESET_TRAITS.map((trait) => {
          const selected = selectedLabels.includes(trait.label);
          return (
            <button
              key={trait.label}
              type="button"
              onClick={() => toggleTrait(trait.label)}
              title={trait.directive}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              {trait.label}
            </button>
          );
        })}
      </div>

      {customDirectives.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customDirectives.map((d, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-[200px] truncate">{d}</span>
              <button type="button" onClick={() => removeCustom(i)} className="rounded-full p-0.5 hover:bg-muted">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Add a custom personality trait..."
          className="text-sm"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustom} disabled={!customInput.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
