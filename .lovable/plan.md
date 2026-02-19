
# Agent Creation Wizard Overhaul

## Problems Identified

### 1. Redundant transfer phone number field
The wizard's AI-generated questions already ask "What phone number should qualified leads be transferred to?" (step 2), and then Step 3 (Review & Save) also has a standalone "Transfer Phone Number" input. Users are typing the same number twice. The wizard answer should pre-populate the final transfer field — the current `save-wizard-answers/index.ts` is supposed to do this but Step 3 always re-shows an empty field.

### 2. Wizard questions are too generic / not deep enough
The AI system prompt for `generate-spec` only asks for a max of 5 questions and the fallback questions are shallow. The questions focus on basics (goal, phone number, what to collect, disqualification, hours) but miss important agent-building context like:
- Company/product background
- Tone and persona details
- Common objections callers raise
- Specific language or phrases to use or avoid
- Compliance requirements
- What makes a call a "win" vs. just completing it

### 3. No prominent URL/document ingestion during wizard creation
The URL and file upload feature for knowledge bases only exists **after** an agent is created on the Knowledge page. There is no way to provide a company website or product page URL during the creation wizard itself, even though this would dramatically improve the agent's knowledge from day one.

---

## Solution

### Step 1: Fix duplicate transfer phone in wizard + Step 3
- When moving from Step 2 (wizard questions) to Step 3 (Review), if a transfer phone was detected from the wizard answers, **pre-populate** `transferPhone` and set `transferEnabled = true` automatically.
- Remove the redundant question about transfer phone from the AI's wizard question list by adding an explicit instruction in the `generate-spec` system prompt: "Do NOT ask for transfer phone number — that is collected separately in the UI."

### Step 2: Expand and improve wizard questions
Update the `generate-spec` system prompt to produce richer, more actionable questions — up to 8 instead of 5. The AI will be directed to ask about:
1. Company/product description (what does the company sell or offer?)
2. Who is the ideal customer / audience?
3. What are the most common objections callers raise?
4. What should the agent NEVER say?
5. What tone/persona should the agent have?
6. What makes a call a true success (beyond just collecting data)?
7. Compliance / legal caveats to be aware of?
8. Business hours / callback preferences

The `save-wizard-answers` function will be updated to map these richer answers into `humanization_notes`, `business_rules`, `tone_style`, and `disqualification_rules` instead of just the 5 hardcoded fields.

### Step 3: Add URL/knowledge source ingestion directly in the wizard (Step 1)
Add a "Company/Product URL" field to **Step 1** of the wizard (Build Your Agent screen). When the user enters a URL and clicks "Generate My Agent", the system will:
1. Pass the URL to `generate-spec`
2. After spec creation, automatically call `ingest-knowledge-source` to extract product and company knowledge from that page
3. Display a confirmation that knowledge was extracted

This removes the need to navigate to the Knowledge page separately just to provide basic company context.

---

## Files to Change

### `supabase/functions/generate-spec/index.ts`
- Increase question limit from 5 to 8
- Rewrite system prompt to exclude transfer phone, include product/persona/objections/compliance topics
- Map richer answers into agent spec fields

### `supabase/functions/save-wizard-answers/index.ts`
- Map new answer fields (tone, persona notes, objections, avoid phrases) into `humanization_notes`, `business_rules`, and `tone_style` columns

### `src/pages/CreateAgentPage.tsx`
- Add "Company or product URL" field in Step 1 (alongside the file upload)
- On step transition to Step 3, auto-populate `transferPhone` and `transferEnabled` from what `save-wizard-answers` returns
- Trigger `ingest-knowledge-source` after spec generation if a URL was provided
- Show a "Knowledge extracted from URL" success indicator

---

## Technical Details

### Updated generate-spec system prompt (key additions):
```
Rules:
- Ask 6-8 clarification questions covering: company/product context, target audience, common objections, 
  forbidden phrases, tone/persona, what defines success, compliance concerns, and calling hours.
- Do NOT ask for transfer phone number — that is captured separately in the UI.
- For compliance-sensitive topics (insurance, finance, healthcare), include a question about 
  legal disclosures or regulatory constraints.
- Map objection answers into objection_handling knowledge entries.
- Map tone/persona answers into humanization_notes.
```

### Updated save-wizard-answers mapping logic:
```typescript
// Detect question intent by content keywords rather than fixed order_index
for (const ans of answers) {
  const q = ans.question?.toLowerCase() || "";
  if (q.includes("company") || q.includes("product") || q.includes("offer")) {
    updates.business_rules = { ...updates.business_rules, company_context: ans.answer };
  }
  if (q.includes("tone") || q.includes("persona") || q.includes("style")) {
    updates.tone_style = ans.answer;
  }
  if (q.includes("never") || q.includes("avoid") || q.includes("forbidden")) {
    updates.humanization_notes = [...(updates.humanization_notes || []), `NEVER say: ${ans.answer}`];
  }
  if (q.includes("objection")) {
    // Store as knowledge entries
  }
  // ...etc
}
```

### Step 1 UI addition (CreateAgentPage.tsx):
```tsx
<div className="space-y-2">
  <Label>Company or product website (optional)</Label>
  <Input 
    value={knowledgeUrl} 
    onChange={e => setKnowledgeUrl(e.target.value)}
    placeholder="https://yourcompany.com/products"
    type="url"
  />
  <p className="text-xs text-muted-foreground">
    We'll automatically read this page to give your agent product knowledge from day one.
  </p>
</div>
```

After `generate-spec` completes:
```typescript
if (knowledgeUrl) {
  await supabase.functions.invoke("ingest-knowledge-source", {
    body: { project_id: project.id, url: knowledgeUrl }
  });
}
```
