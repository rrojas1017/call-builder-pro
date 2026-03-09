

# Fix: Empty `{}` Showing in Qualification Rules Textareas

## Problem
When qualification/disqualification rules are empty objects `{}` in the database, the loading logic stringifies them to `"{}"` and displays that in the textarea. Users see cryptic curly braces instead of the helpful placeholder text.

## Fix
In `src/pages/EditAgentPage.tsx` lines 163-167, add a check: if the stringified result is `"{}"` or `"null"`, treat it as empty string so the placeholder shows instead.

```typescript
// Before
setQualificationRules(qr?.description || (qr && typeof qr === "object" ? JSON.stringify(qr, null, 2) : ""));

// After — also filter out empty objects
const qrStr = qr?.description || (qr && typeof qr === "object" ? JSON.stringify(qr, null, 2) : "");
setQualificationRules(qrStr === "{}" || qrStr === "null" ? "" : qrStr);
```

Same fix for disqualification rules on the next line.

### File Changed
- **`src/pages/EditAgentPage.tsx`** — 2-line fix in the data loading section

