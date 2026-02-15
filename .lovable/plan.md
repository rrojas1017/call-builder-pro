

## Fix: Pipeline Audit Missing from Sidebar

### Root Cause

The `iconMap` in `src/components/AppSidebar.tsx` does not have an entry for `/training-audit`. The sidebar rendering logic on line 200 does `if (!IconComp) return null;`, which silently hides any nav item without a mapped icon.

### Fix

**File: `src/components/AppSidebar.tsx`**

1. Import the `Brain` icon from `lucide-react` (already used on the TrainingAuditPage, fits the concept)
2. Add `/training-audit": Brain` to the `iconMap` object

That's it -- one file, two lines changed. The route, page, and sidebar config entry are all already in place and working.

### Technical Details

| Line | Change |
|------|--------|
| ~6 (import) | Add `Brain` to the lucide-react import |
| ~33 (iconMap) | Add `"/training-audit": Brain` entry |

