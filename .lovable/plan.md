
# Recording Intelligence: Upload Post-Transfer Call Recordings as Agent Training Data

## What the User Wants

After a successful transfer (agent qualifies someone and hands them off to a human closer/agent), there is a second conversation between the human agent and the prospect. That second recording — the "after-transfer" conversation — contains high-value signals:

- How does the human agent open the conversation after the handoff?
- What objections come up that the AI agent did NOT handle?
- What language closes effectively?
- Where does the human agent re-qualify or lose the lead?

Uploading these recordings and having the system transcribe + extract knowledge from them provides the AI agent with direct, battle-tested intelligence from real successful conversion conversations.

---

## How It Works — The Full Pipeline

```text
User uploads .mp3 / .mp4 / .wav recording
         ↓
File stored in agent_knowledge_sources bucket
         ↓
New edge function: transcribe-and-ingest
         ↓
Calls Bland AI /v1/audio/transcribe (or converts to text via AI)
         ↓
Claude Sonnet 4 analyzes transcript for insights
(What happened after transfer? What closed the deal?)
         ↓
Knowledge entries saved to agent_knowledge table
with source_type = "transfer_recording"
and categories: objection_handling, winning_pattern,
conversation_technique
         ↓
Agent picks up these entries in next buildTaskPrompt call
```

---

## Bland API — Transcription Capability

From the Bland API docs, each call returns:
- `recording_url` — URL to call audio if `record: true`
- `concatenated_transcript` — full text transcript of the call
- `warm_transfer_call` — contains transfer metadata (state = MERGED means transfer happened)

However, the recordings to upload here are NOT Bland calls — they are recordings made by the human agent or recorded by the user's own telephony platform (e.g. a CRM export). These are external audio files.

For transcription, we will use Gemini's multimodal capability via the AI gateway — it supports audio-to-text natively in Gemini 2.5 Flash, meaning no additional API key is needed.

---

## Database Changes

### New `source_type` value: `"transfer_recording"`

No schema change required — the `source_type` column in `agent_knowledge` already accepts any text value. We simply add `"transfer_recording"` as a new badge in the UI.

### New storage path

Recordings are uploaded to the existing `agent_knowledge_sources` bucket under a `recordings/` sub-path:
```
recordings/{project_id}/{timestamp}_{filename}.mp3
```

---

## New Edge Function: `transcribe-and-ingest`

This is a new edge function that handles the two-step pipeline:

**Step 1 — Transcription using Gemini 2.5 Flash (audio input)**

Gemini 2.5 Flash supports audio as a base64 part in the messages array via the OpenAI-compatible gateway. We download the audio file from storage, base64-encode it, and send it to the AI with a prompt asking for a full transcript. This costs no additional API keys — uses the existing `LOVABLE_API_KEY` via the Lovable AI Gateway.

```
POST to ai.gateway.lovable.dev/v1/chat/completions
Model: google/gemini-2.5-flash
Messages: [
  {
    role: "user",
    content: [
      {
        type: "input_audio",
        input_audio: { data: <base64>, format: "mp3" }
      },
      {
        type: "text",
        text: "Transcribe this call recording verbatim. Include speaker labels if possible. This is a sales call recording."
      }
    ]
  }
]
```

**Step 2 — Knowledge Extraction using Claude Sonnet 4**

Once the transcript is available, Claude Sonnet 4 (already used for high-reasoning tasks in this system) analyzes it specifically as a post-transfer conversation:

```
System: You are analyzing a recording of a sales conversation that happened AFTER a qualified prospect was transferred from an AI pre-qualifier. Extract insights that would help the AI pre-qualifier do a better job — specifically: objections that emerged after transfer, phrases the human agent used to close, rapport techniques, any re-qualification that was needed, and patterns that seemed to lead to success or failure.

Return a JSON array of knowledge entries with categories:
- "objection_handling": objections that appeared or persisted after transfer
- "winning_pattern": specific phrases, transitions, or techniques that worked
- "conversation_technique": pacing, rapport, or conversational structure insights
- "product_knowledge": any product/service details that were clarified post-transfer
```

---

## UI Changes

### 1. `UploadSourcesDialog.tsx` — New "Recording" tab

Add a third tab: `🎙️ Post-Transfer Recording`

```
┌──────────────────────────────────────────────────────────┐
│  Upload Files  |  Paste URL  |  🎙️ Call Recording        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   [ Drop recording here or browse ]                      │
│   Supports .mp3, .wav, .mp4, .m4a — up to 20MB         │
│                                                          │
│   Label (optional)                                       │
│   [ "Closing call with John - Jan 2026" __________ ]    │
│                                                          │
│   💡 Upload recordings from successful calls that       │
│      happened AFTER your agent transferred a prospect.  │
│      We'll transcribe and extract sales insights.        │
│                                                          │
│   [ Process Recording ]                                  │
└──────────────────────────────────────────────────────────┘
```

The flow:
1. User drops an audio file
2. File uploads to `agent_knowledge_sources` bucket under `recordings/` path
3. `transcribe-and-ingest` edge function is called with `{ project_id, file_path, source_label }`
4. A progress indicator shows: "Transcribing..." → "Extracting insights..." → "Done! X insights added"

### 2. `AgentKnowledgePage.tsx` — New badge for `transfer_recording` source type

Add a new badge in the `sourceTypeBadge` function:
```tsx
if (type === "transfer_recording") return (
  <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20">
    🎙️ Recording
  </Badge>
);
```

Also update the stats counter in `LearningProgressBar` to count recording-sourced entries separately from other types.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/transcribe-and-ingest/index.ts` | New edge function: download audio from storage, transcribe with Gemini 2.5 Flash, extract knowledge with Claude Sonnet 4, insert into `agent_knowledge` as `transfer_recording` |
| `supabase/config.toml` | Add `[functions.transcribe-and-ingest]` with `verify_jwt = false` |
| `src/components/UploadSourcesDialog.tsx` | Add third "Call Recording" tab with audio file upload, label field, progress states, and call to `transcribe-and-ingest` |
| `src/pages/AgentKnowledgePage.tsx` | Add `transfer_recording` badge and recording count in stats |

---

## Technical Notes

### Audio format handling
Gemini 2.5 Flash via the gateway supports inline base64 audio in the `input_audio` content part type. We support .mp3, .wav, .m4a, and .mp4 (audio-only). Max file size 20MB (already enforced by storage).

### Truncation strategy
If audio exceeds what Gemini can handle in a single call (unlikely for typical sales calls of 5-20 min), the edge function will:
1. First attempt the full audio
2. If the response is an error about content limits, truncate to the first 10 minutes (roughly first 10MB of audio)

### Token budget
A 15-minute call produces ~2,000-4,000 word transcript. Feeding this to Claude Sonnet 4 is well within limits and should produce 8-15 high-quality knowledge entries.

### Progress UX
Since transcription can take 15-30 seconds for longer recordings, the upload dialog will show three distinct states:
- "Uploading file..." (storage upload)
- "Transcribing recording..." (Gemini call)
- "Extracting insights..." (Claude call)
- "Done! 12 insights added to knowledge base."

The `onIngested` callback fires at the end so the knowledge list auto-refreshes.

### Why not use Bland's own recording URL?
Bland's `recording_url` field is only populated for calls where `record: true` was set at call time. The recordings the user wants to upload are the post-transfer conversations that happened in THEIR telephony system (their CRM, Zoom, GoHighLevel, etc.), not the pre-transfer Bland call. This is why manual upload is the right approach.

### Where these insights show up
Once saved to `agent_knowledge` with category `objection_handling`, `winning_pattern`, or `conversation_technique`, they are automatically included in the next `buildTaskPrompt` call via `buildCompactKnowledge()`. No additional wiring needed — the knowledge system already pulls all entries regardless of source_type.
