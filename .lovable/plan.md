
## Make Agent Introduction Sound More Human and Less Scripted

### Problem Analysis
The current opening line on line 193 of `supabase/functions/tick-campaign/index.ts`:
```
"Hey {{first_name}}, this is just a quick follow-up on the health coverage info you were looking into. Got a sec?"
```

Issues:
1. **"this is just a quick follow-up"** — Too formal/scripted; sounds like a automated system reading a script
2. **"health coverage info you were looking into"** — Clunky phrasing; too much detail upfront
3. **"Got a sec?"** — Good casual ending, but the whole sentence feels disjointed
4. The test revealed it comes across as "automated assistance calling" because the phrasing is too polished and formal

### Root Cause
The opening is trying to be too explanatory. Real people don't explain what they're calling about in such detail on the first second. They get straight to the point in a conversational, natural way.

### Solution: More Natural Opening Lines

The best option is to **drop the explanation entirely** and just acknowledge them naturally:

**Recommended (Most Human):**
```
"Hey {{first_name}}, you got a quick minute? I'm calling about the health coverage thing you looked at."
```
*Why: Flips the order (ask permission first), "health coverage thing" is casual, no overexplaining*

**Alternative 1 (Shortest/Punchiest):**
```
"{{first_name}}, hey! Quick question about your health coverage — you got a sec?"
```
*Why: Very casual, minimal phrasing, sounds like a real person*

**Alternative 2 (Conversational):**
```
"Hey {{first_name}}, it's about that health coverage — you have like a minute?"
```
*Why: Drops "following up" and "info," uses "like a minute" (very conversational)*

**Alternative 3 (Narratively Human):**
```
"Hey {{first_name}}, so I'm reaching out to folks about health coverage options. You free for just a quick second?"
```
*Why: Explains the context naturally without sounding scripted, "reaching out" is more personal than "following up"*

### Implementation
Update line 193 in `supabase/functions/tick-campaign/index.ts` to use the recommended opening:
```
spec.opening_line || "Hey {{first_name}}, you got a quick minute? I'm calling about the health coverage thing you looked at."
```

### Why This Works Better
- **Removes formality**: No "this is just" or "following up"
- **Casual language**: "health coverage thing" instead of "health coverage info"
- **Permission-first**: Asking if they have time before diving in (more respectful, more human)
- **Shorter sentences**: Easier for voice model to deliver naturally without stuttering
- **Conversational flow**: Sounds like someone calling a friend, not a system reading prompts

### Files to Modify
- `supabase/functions/tick-campaign/index.ts` (line 193)

### Testing
After update, run a Gym test call to verify the opening no longer sounds like "automated assistance calling."
