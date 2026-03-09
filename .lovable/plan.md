

# Fix ACA New Mover Agent — Doubled Name + Flow Issues

## Root Cause: Doubled Name Bug

The `runtimeGuardOpeningLine` function uses `(\w+)` regex which only captures a single word. After `{{agent_name}}` resolves to "Jonathan Stone", the pattern `\bthis is (\w+)` matches only "Jonathan". Since "Jonathan" !== "Jonathan Stone", the guard replaces "Jonathan" with "Jonathan Stone" — producing "Jonathan Stone Stone".

This is a **platform-wide bug** affecting any agent with a multi-word persona name.

## Changes

### 1. Fix multi-word name guard (platform bug)

**`src/lib/openingLineGuard.ts`** — In both `guardOpeningLine` and `runtimeGuardOpeningLine`, change the comparison logic: if the found single-word name is a prefix/first-word of the persona name, treat it as a match and skip. This prevents the guard from "correcting" an already-correct name.

**`supabase/functions/_shared/buildTaskPrompt.ts`** — Same fix in `runtimeGuardResolvedLine`.

### 2. Update agent opening line + fields (database)

Current opening line: `"Hey {{first_name}}, this is {{agent_name}} calling about your recent move — do you have a quick moment?"`

This is actually decent but missing the disclosure and doesn't explain the enrollment opportunity. Update to:

> "Hey {{first_name}}, this is {{agent_name}}. I'm reaching out because it looks like you've recently moved, and that could qualify you for a Special Enrollment Period to get health coverage — do you have a quick minute?"

Update `must_collect_fields` to a proper ordered sequence that explains purpose before collecting data:
1. consent (recording disclosure)
2. Confirm recent move and new state/zip
3. Coverage status
4. Household size
5. Income estimate
6. Email (before transfer)

### 3. Files changed

- **`src/lib/openingLineGuard.ts`** — Fix prefix matching for multi-word names
- **`supabase/functions/_shared/buildTaskPrompt.ts`** — Same fix in edge function copy
- **Database migration** — Update `agent_specs` row for project `0144f838-ece5-4a6d-a9ac-a676ae7f3f4f`: new `opening_line`, expanded `must_collect_fields`, add `qualification_rules` and `disqualification_rules` for move-based SEP logic

