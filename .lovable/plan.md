

## Fix: Pipeline Audit Missing from Sidebar (Database Config Override)

### Root Cause

The `sidebar_config` table has a previously saved configuration that was created before "Pipeline Audit" was added to the defaults. When the sidebar loads, it fetches from the database and uses that config instead of the code defaults. The DB config's MONITOR section only has "Calls" and "University" — no "Pipeline Audit".

### Fix

**Update the saved sidebar config in the database** to include the Pipeline Audit item in the MONITOR section.

Run a SQL migration that updates the existing `sidebar_config` row to inject `{"label": "Pipeline Audit", "path": "/training-audit"}` into the MONITOR section's items array.

Additionally, **harden the `useSidebarConfig` hook** so that any new items added to the code defaults are automatically merged into the DB config, preventing this class of bug from recurring.

### Changes

| File | Change |
|------|--------|
| Database migration | Update the existing `sidebar_config` row to add Pipeline Audit to the MONITOR section |
| `src/hooks/useSidebarConfig.ts` | Add a merge step: after loading DB config, ensure any items from `DEFAULT_SECTIONS` that are missing in the DB config get added to their respective sections |

### Technical Details

**Migration SQL:**
```sql
UPDATE sidebar_config
SET sections = jsonb_set(
  sections::jsonb,
  -- Find the MONITOR section and append Pipeline Audit
  ...
)
WHERE id = '343c9187-7687-4c87-832a-79b64c167db6';
```

**Hook merge logic (useSidebarConfig.ts):**

After fetching DB sections, for each default section, check if any default items are missing from the DB version and append them. This ensures future sidebar additions automatically appear without needing a manual DB update every time.

```typescript
// Merge missing default items into DB-loaded sections
const merged = dbSections.map(dbSection => {
  const defaultMatch = DEFAULT_SECTIONS.find(d => d.label === dbSection.label);
  if (!defaultMatch) return dbSection;
  const dbPaths = new Set(dbSection.items.map(i => i.path));
  const missing = defaultMatch.items.filter(i => !dbPaths.has(i.path));
  return { ...dbSection, items: [...dbSection.items, ...missing] };
});
```

This two-part fix resolves the immediate issue and prevents it from happening again with future nav additions.
