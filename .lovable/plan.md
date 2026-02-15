

## Fix: "fields.find is not a function" Error

### Root Cause

`detected_fields` in the `dial_lists` table is stored as a JSON object (or empty object `{}`), not an array. Line 117 of `CampaignsPage.tsx` casts it as `string[]` and immediately calls `.find()` on it, which crashes because plain objects don't have array methods.

### Fix

On line 117 of `src/pages/CampaignsPage.tsx`, add a safety check to coerce `detected_fields` into an array regardless of its stored format:

- If it's already an array, use it as-is
- If it's an object, use `Object.keys()` to extract the field names
- If it's null/undefined, default to an empty array

### Technical Details

| File | Change |
|---|---|
| `src/pages/CampaignsPage.tsx` | Line 117: Replace `const fields = (listMeta as any)?.detected_fields as string[] \|\| [];` with a safe extraction that handles objects, arrays, and nulls |

Single line change:
```typescript
const rawFields = (listMeta as any)?.detected_fields;
const fields: string[] = Array.isArray(rawFields) ? rawFields : (rawFields && typeof rawFields === "object" ? Object.keys(rawFields) : []);
```

No backend changes. No new files.
