

## Remove Teacher Briefing Feature

### What will be removed

1. **Delete `src/components/TeacherBriefingCard.tsx`** -- the entire component file

2. **Delete `supabase/functions/generate-teacher-briefing/index.ts`** -- the edge function, plus remove the deployed function from the backend

3. **Clean up `src/pages/UniversityPage.tsx`**:
   - Remove the `TeacherBriefingCard` import (line 11)
   - Remove `GraduationCap` from the lucide-react import (line 10) if unused elsewhere
   - Remove the `briefing` and `briefingLoading` state variables (lines 86-87)
   - Remove the `setBriefing(null)` and `setBriefingLoading(true)` calls and the entire `supabase.functions.invoke("generate-teacher-briefing", ...)` block in `handleRunTest` (lines 308-318)
   - Remove the `TeacherBriefingCard` JSX rendering block (lines 463-466)

4. **Remove `[functions.generate-teacher-briefing]` entry from `supabase/config.toml`** (lines 90-91)

No database changes needed -- the feature was entirely in-memory.

