

## Upgrading the Coaching AI: Model Analysis and Implementation Plan

### Current State

Your platform uses AI in 4 critical coaching roles:

| Role | Current Model | Function |
|---|---|---|
| Call Evaluation (scoring + fixes) | Gemini 3 Flash | `evaluate-call` |
| Spec Generation | Gemini 3 Flash | `generate-spec` |
| Success Pattern Extraction | Gemini 3 Flash (via ai-client) | `learn-from-success` |
| Research Distillation | Gemini 3 Flash | `research-and-improve` |

All four use the same fast, cheap model. That's fine for research and spec generation, but **evaluation is the cornerstone** -- if scoring is inaccurate, every downstream fix is wrong, and the agent never improves meaningfully.

---

### Model Comparison for Coaching/Evaluation

| Model | Reasoning Depth | Structured Output | Speed | Cost | Best For |
|---|---|---|---|---|---|
| **Gemini 3 Flash** (current) | Good | Good | Very fast | Very low | Bulk tasks, research |
| **Gemini 2.5 Pro** | Excellent | Excellent | Medium | Medium | Complex analysis |
| **Claude Sonnet 4** (you have the key) | Excellent | Excellent | Medium | Medium | Nuanced judgment, coaching |
| **GPT-5** (via Lovable AI) | Excellent | Excellent | Slow | High | Deep reasoning |
| **MiniMax M2.5** | Good for coding | Decent | Very fast | Very low | Bulk/speed tasks |

### Verdict

**MiniMax is not the right choice for coaching.** It excels at coding benchmarks and bulk speed, but lags behind Claude and GPT-5 in nuanced judgment, long-context reasoning, and structured evaluation quality -- which is exactly what your auditor needs.

**The best option: Claude Sonnet 4 for evaluation, Gemini Flash for everything else.**

Why Claude for the evaluator:
- You already have `ANTHROPIC_API_KEY` configured and the `ai-client.ts` abstraction ready
- Claude excels at **nuanced text analysis** -- detecting subtle conversational failures, not just keyword matching
- Claude is stronger at **consistent scoring** -- less score drift between identical transcripts
- Claude produces more **specific, non-repetitive coaching suggestions** -- the exact problem you're experiencing
- Cost is reasonable for this use case since evaluations happen per-call, not per-token-stream

Gemini Flash remains ideal for research distillation, knowledge compression, and spec generation where speed matters more than deep judgment.

---

### Implementation Plan

#### 1. Upgrade `evaluate-call` to use Claude via `ai-client.ts`

**File: `supabase/functions/evaluate-call/index.ts`**

- Replace the direct Lovable AI Gateway fetch with `callAI({ provider: "claude", ... })`
- This uses the existing `ai-client.ts` abstraction and the already-configured `ANTHROPIC_API_KEY`
- Remove the raw `fetch()` call and use the shared client for cleaner code
- Keep all existing prompt content, tool schemas, and scoring rubric unchanged

#### 2. Enhance the evaluation prompt for Claude's strengths

**File: `supabase/functions/evaluate-call/index.ts`**

Claude responds better to explicit reasoning instructions. Add to the system prompt:

- **Chain-of-thought scoring**: "Before assigning each score, write a brief internal rationale (2-3 sentences) explaining your reasoning. Then assign the numeric score."
- **Anti-repetition directive**: "Check your suggested improvements against the RECENT CHANGE HISTORY. If a similar suggestion was already applied without improvement, you MUST suggest a fundamentally different approach -- not a variation of the same fix."
- **Severity tiers for improvements**: Tag each recommendation as `critical` (blocking agent success), `important` (noticeably hurts performance), or `minor` (polish). This helps users prioritize.

#### 3. Add improvement severity to the tool schema

**File: `supabase/functions/evaluate-call/index.ts`**

Add a `severity` field to each `recommended_improvement`:

```
{
  field: "opening_line",
  current_value: "...",
  suggested_value: "...",
  reason: "...",
  severity: "critical" | "important" | "minor"
}
```

#### 4. Update `learn-from-success` to use Claude

**File: `supabase/functions/learn-from-success/index.ts`**

This function compares successful vs. unsuccessful call transcripts -- exactly the kind of nuanced pattern recognition Claude excels at. Switch from `provider: "gemini"` to `provider: "claude"` in the existing `callAI()` call.

#### 5. Keep Gemini Flash for speed-critical functions

These stay on Gemini 3 Flash (no changes):
- `generate-spec` -- speed matters for onboarding UX
- `research-and-improve` -- bulk article processing
- `summarize-agent-knowledge` -- simple compression task

#### 6. Frontend: Display improvement severity badges

**Files: `src/pages/GymPage.tsx`, `src/components/TestResultsModal.tsx`, `src/pages/CallsPage.tsx`**

When rendering `recommended_improvements`, show severity badges:
- Red badge for `critical`
- Yellow badge for `important`  
- Gray badge for `minor`

Sort improvements by severity (critical first) so users fix the most impactful issues first.

---

### Architecture After Changes

```text
evaluate-call ──────► Claude Sonnet 4  (deep judgment, coaching)
learn-from-success ─► Claude Sonnet 4  (pattern recognition)
generate-spec ──────► Gemini 3 Flash   (speed, onboarding)
research-and-improve► Gemini 3 Flash   (bulk processing)
summarize-knowledge ► Gemini 3 Flash   (compression)
```

### What This Solves

1. **Repetitive suggestions**: Claude's stronger reasoning + the anti-repetition directive stops circular fixes
2. **Inaccurate scoring**: Claude produces more consistent, calibrated scores across calls
3. **Vague coaching**: Claude generates more specific, actionable improvements with severity tiers
4. **No wasted effort**: Users see which fixes matter most (critical vs. minor) and act accordingly

