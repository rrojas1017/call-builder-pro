

## Analysis: Save & Learn Already Applies Improvements

After reviewing the current code in `src/components/LiveSimulationChat.tsx` (lines 291-367), the `handleSaveAndLearn` function **already implements the exact behavior you described**:

1. **Line 303-305**: Builds transcript from messages
2. **Line 307-321**: Inserts into `calls` table
3. **Line 323-327**: Calls `evaluate-call` with the call ID
4. **Line 329-330**: Extracts score from evaluation
5. **Line 333-337**: Filters `recommended_improvements` for `critical` and `important` severity
6. **Line 339-352**: Loops through and sends each to `apply-audit-recommendation`
7. **Line 355-361**: Sets `learnResult` and shows toast with score + fix count

This was added in a previous update. The agent **does** learn from watched conversations — critical and important fixes are auto-applied via the same `apply-audit-recommendation` pipeline used by the training loop and user feedback.

**No code changes are needed.** If improvements aren't being applied in practice, the issue would be upstream — either the evaluation isn't returning `recommended_improvements` with the expected structure, or `apply-audit-recommendation` isn't matching them to spec fields. That would require debugging the edge function responses rather than a frontend change.

Would you like me to investigate whether the edge functions are returning the expected data structure instead?

