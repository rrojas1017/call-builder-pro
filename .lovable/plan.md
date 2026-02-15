

## Enhance Call Data Collection: Zip Validation + Email Capture

### What Changes

Two improvements to how the agent collects information on calls:

1. **Zip code validation**: Instead of just saying "must be 5 digits," the agent will be instructed to repeat the zip back to the caller for confirmation and re-ask if it doesn't sound like a valid US zip.

2. **Email address collection**: The agent will ask for the caller's email near the end of the call, framed naturally as: *"What's the best email to reach you at? That way we can send you a summary of what we discussed and any next steps."* This gives a genuine, helpful reason rather than sounding like a data grab.

### How It Works

Both `buildTaskPrompt` files (frontend preview + backend edge functions) will be updated:

- **Zip validation prompt** -- Replace the current one-liner `ZIP: Must be exactly 5 digits.` with stronger instructions that tell the agent to read it back and re-ask if unclear.
- **Email auto-injection** -- Similar to how we already auto-inject "Can I confirm your full name?", the system will auto-inject an email collection step near the end of the fields list if one isn't already present. The prompt will include the natural framing reason.

### Technical Details

| File | Change |
|---|---|
| `src/lib/buildTaskPrompt.ts` | Replace zip validation line with expanded instructions. Add email auto-injection logic after the name injection block. |
| `supabase/functions/_shared/buildTaskPrompt.ts` | Same changes -- this is the backend copy used for actual calls. |

#### Zip Validation (replaces current single line)
```
ZIP CODE: Must be exactly 5 digits. After caller says it, repeat it back: "Just to confirm, that's [zip], correct?" If unclear or fewer/more than 5 digits, ask again: "I want to make sure I have that right -- could you repeat your zip code?"
```

#### Email Auto-Injection Logic
- Check if any field already mentions "email"
- If not, insert near the end of the fields list (before the last field): `"What's the best email address to reach you at? We'll send you a quick summary of what we covered and any next steps."`
- This keeps the flow natural -- email comes after qualification questions but before wrap-up

### What This Fixes
- Zip codes won't be mis-heard or partially captured -- the agent confirms them verbally
- Every qualified call will capture an email for follow-up, increasing lead value
- The reason given ("send you a summary") is genuine and non-pushy

