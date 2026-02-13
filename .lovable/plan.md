

## Store Anthropic API Key and Prepare Claude Integration Points

### Step 1: Store the API Key
Securely save your Anthropic API key as `ANTHROPIC_API_KEY` in Lovable Cloud secrets. This makes it available as `Deno.env.get("ANTHROPIC_API_KEY")` in all backend functions.

### Step 2: Create a Shared AI Helper
Create a utility module (`supabase/functions/_shared/ai-client.ts`) that abstracts model selection. Any edge function can call it with a model preference, and it routes to either Lovable AI Gateway (Gemini) or the Anthropic API accordingly.

```text
ai-client.ts
  |
  |-- "gemini" --> Lovable AI Gateway (existing)
  |-- "claude" --> https://api.anthropic.com/v1/messages
```

### Step 3: Integration Points (Ready for Future Use)
No edge functions will be changed now. The key and helper will be ready for when you want to:

- **Advanced Evaluation** -- Use Claude for deeper transcript analysis (e.g., second-opinion scoring, nuanced humanness feedback)
- **Dynamic Prompt Generation** -- Use Claude to rewrite/optimize agent task prompts based on performance data
- **Humanization Coaching** -- Use Claude's conversational strengths for more natural coaching suggestions
- **Research Synthesis** -- Use Claude as an alternative distillation model in `research-and-improve`

### Files Created
- `supabase/functions/_shared/ai-client.ts` -- Shared helper with `callAI({ provider, model, messages, tools?, tool_choice? })` that returns a unified response format

### Files Modified
- None -- existing functions stay unchanged until you decide to activate Claude for specific tasks

### No Database Changes Needed

