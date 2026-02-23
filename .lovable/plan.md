

# Fix: Agent Evolution Graph Not Showing

## Root Cause

The "Agent Humanness Progress" evolution graph is not appearing because **all call evaluations are failing**. The `evaluate-call` function uses your Anthropic API key to run Claude, but the Anthropic account has run out of credits:

> "Your credit balance is too low to access the Anthropic API"

Since no evaluations complete, there's no humanness/naturalness score data, and the chart is hidden (it only renders when data exists).

## Solution

Migrate the `evaluate-call` function from the direct Anthropic API to **Lovable AI**, which provides access to equivalent models without needing a separate API key. This eliminates the dependency on external API billing.

### Changes

**1. Update `supabase/functions/_shared/ai-client.ts`**
- Add a `callLovableAI` function that routes requests through the Lovable AI gateway (using the existing `LOVABLE_API_KEY` secret)
- Support the same interface as the current `callClaude` function

**2. Update `supabase/functions/evaluate-call/index.ts`**
- Switch from `callClaude` to `callLovableAI` using a supported model (e.g., `google/gemini-2.5-flash` or `openai/gpt-5-mini`) for evaluation
- Keep the same prompt structure and tool-calling pattern
- The evaluation logic, scoring rubric, and auto-graduation checks remain unchanged

**3. Add an empty state to the evolution graph in `src/pages/UniversityPage.tsx`**
- When there are completed test contacts but no evaluations yet, show a placeholder message like "Evaluations pending -- scores will appear here after calls are graded" instead of hiding the chart entirely
- This gives users visibility that the feature exists even before data populates

### Why Lovable AI?

The `LOVABLE_API_KEY` is already configured in your secrets. Models like `openai/gpt-5-mini` or `google/gemini-2.5-flash` provide strong reasoning capabilities sufficient for call evaluation, without requiring you to maintain a separate Anthropic billing account.

## Expected Result

After this change:
- Completed test calls will be automatically evaluated using Lovable AI
- The evolution graph will appear on the University/Test page showing humanness and naturalness trends
- No more dependency on Anthropic API credits for evaluations
