

# Fix Sofia's Accent Switching Mid-Call

## Problem

The Custom LLM WebSocket (`retell-llm-ws`) generates agent responses via Lovable AI (Gemini), but it never tells the AI **what language to respond in**. So mid-conversation, the AI defaults to English. When Sofia's Spanish voice reads English text, her accent shifts from Hispanic to American.

## Root Cause

1. The `run-test-run` function passes `metadata` to the Retell call (test_run_id, project_id, etc.) but **does not include the agent's language setting**
2. The `retell-llm-ws` WebSocket receives this metadata but has no language info to work with
3. The system prompt loaded from the DB may not contain an explicit "respond in Spanish" instruction
4. Gemini defaults to English, causing the TTS voice to switch accents

## Fix (2 files)

### 1. Pass language in call metadata

**File**: `supabase/functions/run-test-run/index.ts`

Add the agent spec's `language` field to the metadata object passed to the Retell call:

```text
metadata: {
  test_run_id, test_run_contact_id: contact.id,
  org_id: testRun.org_id, project_id: testRun.project_id,
  spec_version: testRun.spec_version,
  language: spec?.language || "en-US",   // <-- ADD THIS
}
```

### 2. Inject language instruction into the AI system prompt

**File**: `supabase/functions/retell-llm-ws/index.ts`

When processing the call metadata, read the `language` field and append a strict language instruction to the system prompt:

```text
// After loading systemPrompt from DB...
const language = metadata.language || "en-US";
if (language.startsWith("es") || language === "multi") {
  systemPrompt += "\n\nCRITICAL: You MUST respond ENTIRELY in Spanish. 
  Every word you say must be in Spanish. Never switch to English 
  under any circumstances.";
} else if (!language.startsWith("en")) {
  // Handle other non-English languages similarly
  systemPrompt += `\n\nCRITICAL: Respond in the language matching 
  locale code "${language}". Never switch to English.`;
}
```

This ensures the AI model always generates text in the correct language, so the voice never has to switch accents.

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/run-test-run/index.ts` | Add `language` to Retell call metadata |
| `supabase/functions/retell-llm-ws/index.ts` | Read language from metadata, append language enforcement to system prompt |

## Expected Result

Sofia will maintain her natural Hispanic Spanish accent throughout the entire call because every AI-generated response will be in Spanish.
