

## Reorder Default Sidebar: Dashboard on Top, Admin at Bottom

### Change

Update the default sidebar section order in `src/hooks/useSidebarConfig.ts` so the hardcoded fallback (and initial state before any DB config exists) reflects the desired journey:

1. **BUILD** — Dashboard, Agents, Create Agent, Knowledge Base
2. **DEPLOY** — Campaigns, Lists, Phone Numbers
3. **MONITOR** — Calls, University
4. **SYSTEM** — Settings, Team, Billing
5. **ADMIN** (super admin only) — moved to bottom instead of being prepended at the top

### Technical Details

**File: `src/hooks/useSidebarConfig.ts`** — No changes needed to `DEFAULT_SECTIONS` (BUILD/DEPLOY/MONITOR/SYSTEM order is already correct with Dashboard first inside BUILD).

**File: `src/components/AppSidebar.tsx`** — One line change at ~line 118:

Current code prepends ADMIN at the top:
```typescript
const allSections = isSuperAdmin
  ? [adminSection, ...displaySections]
  : displaySections;
```

Change to append ADMIN at the bottom:
```typescript
const allSections = isSuperAdmin
  ? [...displaySections, adminSection]
  : displaySections;
```

That's it — one line change. The drag-and-drop edit mode index calculations for the admin section exclusion already handle this correctly since the admin section is filtered out of `editSections` regardless of position.

