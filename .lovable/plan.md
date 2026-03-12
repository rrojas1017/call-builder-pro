

## Fix: Make Business Rules Section Scrollable

The ScrollArea is already in place (line 779) with `max-h-[400px]`, but it may not be activating properly because the Radix ScrollArea viewport needs the container to have a definite height. The fix:

1. **`src/pages/EditAgentPage.tsx`** — Change the ScrollArea from `max-h-[400px]` to a more reliable approach: add `overflow-hidden` on the wrapper and ensure the viewport gets `overflow-y-auto`. Also increase or make the max-height responsive so all rules are visible in the available space.

2. **Ensure long rule text wraps** — Add `break-words` / `whitespace-pre-wrap` to the rule `<span>` so lengthy rules like the FPL rule don't overflow horizontally and are fully readable.

### Changes
- **Line 779**: Update ScrollArea to `className="max-h-[400px] overflow-hidden"` and ensure proper scrollbar visibility
- **Line 805**: Add `whitespace-pre-wrap break-words` to the rule text span so long rules wrap and display fully

