

## Issue: User Feedback Prompt Not Appearing After Calls

After reviewing the code, the feedback input section exists in the `ResultCard` component (lines 1019-1082) and should display when `contact.status === "completed"`. The logic and code are intact.

### Likely Cause

The `TestContact` interface (lines 25-40) does **not** include `user_feedback` as a declared field. While the data is loaded from the database (line 257) and accessed via `(contact as any).user_feedback` (line 783), this is fragile. More importantly, for contacts loaded from history with status `"cancelled"`, the feedback section is hidden because the condition on line 858 strictly checks `contact.status === "completed"`.

However, the more likely issue is a rendering/visibility problem — the feedback section may be scrolled out of view below the improvements list, or there could be a state issue where `savedFeedback` and `editingFeedback` are in a state that hides both the input and the saved display.

### Plan

**File: `src/pages/UniversityPage.tsx`**

1. Add `user_feedback?: string | null` to the `TestContact` interface so it's properly typed
2. Update the feedback visibility conditions to also include `"cancelled"` status (both are terminal states from history)
3. Remove the `(contact as any)` cast on line 783 and use `contact.user_feedback` directly
4. Ensure the feedback section is always visible for any terminal-status contact (completed or cancelled) by changing `contact.status === "completed"` to a check like `["completed", "cancelled"].includes(contact.status)` on lines 858-859 and 905

These are small targeted changes within the existing `ResultCard` component.

