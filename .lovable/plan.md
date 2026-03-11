

# Fix: Business Rules Not Visible After Adding Long First Rule

## Problem
The business rules list renders inside a `ScrollArea` with `max-h-[400px]`. When the first rule is long enough to fill that space, newly added rules are appended at the bottom of the list but the scroll container doesn't auto-scroll down — so they look like they weren't added.

## Fix

### `src/pages/EditAgentPage.tsx`

1. Add a `ref` to the ScrollArea's inner container
2. After adding a new rule (in both the Enter key handler and the Add button click), scroll the container to the bottom so the newly added rule is visible
3. Apply the same auto-scroll after importing rules from a document

Specifically:
- Create a `useRef` for the scroll container div inside the ScrollArea
- After every `setBusinessRules([...businessRules, r])` call, use a `setTimeout(() => ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }), 50)` to scroll to the new item
- This affects 3 locations: the Enter keydown handler (line 781), the Add button click (line 787), and the document import (line 816)

| File | Change |
|------|--------|
| `src/pages/EditAgentPage.tsx` | Add scroll-to-bottom ref + auto-scroll after rule addition |

