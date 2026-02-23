

# Fix Voice Selector to Show All Voices with Proper Scrolling

## Problem
The voice selector appears to show only ~8 voices because the Radix `ScrollArea` with `max-h-[420px]` doesn't properly enable scrolling. The `max-height` on the Root component doesn't constrain the Viewport, so either all voices render without a visible scrollbar, or the container clips content without scroll capability.

## Solution
Replace the Radix `ScrollArea` wrapper with a simple `div` that uses native CSS overflow scrolling. This is more reliable for dynamic content lists and guarantees scroll behavior.

## File Changed

| File | Change |
|------|--------|
| `src/components/VoiceSelector.tsx` | Replace `<ScrollArea className="max-h-[420px]">` with a plain `<div className="max-h-[420px] overflow-y-auto">` to ensure native scrolling works reliably for the full voice list. Remove the `ScrollArea` import since it's no longer needed. |

## Technical Details

**VoiceSelector.tsx:**
- Line 3: Remove `ScrollArea` from imports
- Line 188: Change `<ScrollArea className="max-h-[420px]">` to `<div className="max-h-[420px] overflow-y-auto">`
- Update matching closing tag from `</ScrollArea>` to `</div>`

This is a one-line fix. The native `overflow-y-auto` on a `div` with `max-h-[420px]` will show a scrollbar when content exceeds the height, allowing users to scroll through all available voices after applying language/gender filters.

