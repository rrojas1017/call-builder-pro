

## Fix: Edit Agent Page Crash

### Root Cause

The crash is caused by this line in `EditAgentPage.tsx` (the Outbound Number select):

```text
<SelectItem value="">Auto (rotate from trusted pool)</SelectItem>
```

Radix UI's `<Select.Item>` throws an error when `value` is an empty string (`""`). This is by design -- empty string is reserved for clearing the selection back to the placeholder.

### Fix

Replace the empty-string `SelectItem` with a sentinel value like `"auto"`, and map it back to empty string when saving:

1. **Change the SelectItem value** from `""` to `"auto"`
2. **Update the save logic** to convert `"auto"` back to `null`/empty before writing to the database

### File: `src/pages/EditAgentPage.tsx`

- Change `<SelectItem value="">` to `<SelectItem value="auto">`
- On load, default `fromNumber` to `"auto"` instead of `""` when the spec has no `from_number`
- In `handleSave`, convert `fromNumber === "auto"` to `null` before saving

This is a 3-line fix, no new files or dependencies needed.

