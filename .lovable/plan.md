

## Add Contact Detail Drawer to Campaign Detail Page

When you click a contact row in the contacts table, a slide-out panel (Sheet) will open showing the full call details -- transcript, evaluation scores, issues, suggestions, extracted data -- reusing the same layout patterns from the University results view.

### What changes

**File: `src/pages/CampaignDetailPage.tsx`**

1. **Expand the calls query** to fetch `transcript, recording_url, extracted_data, summary` in addition to the fields already selected (both in `fetchData` and the polling interval).

2. **Add state for selected contact**: `selectedContactId` (string | null) to track which contact row was clicked.

3. **Make contact rows clickable**: Add `cursor-pointer` and `onClick` to each `TableRow` in the contacts table that sets `selectedContactId`.

4. **Add a Sheet (slide-out drawer)** that opens when `selectedContactId` is set, showing:
   - Contact name, phone, status badge
   - Duration and outcome
   - Transcript (scrollable, monospace, same style as University)
   - Evaluation scores grid (Overall, Compliance, Objective, Humanness, Naturalness) -- reusing the same score card pattern
   - Issues detected list
   - Humanness suggestions list
   - Knowledge gaps list
   - Extracted data (JSON pre-formatted)
   - Recording URL link (if available)

5. **Import Sheet components** from `@/components/ui/sheet`.

### Technical detail

| Area | Change |
|---|---|
| Imports | Add `Sheet, SheetContent, SheetHeader, SheetTitle` from ui/sheet; add `FileText, Phone` icons |
| Calls query (lines 65, 115) | Change select to `"*"` or add `transcript, recording_url, extracted_data, summary` |
| State (line ~48) | Add `const [selectedContactId, setSelectedContactId] = useState<string \| null>(null)` |
| Contact table rows (line 582) | Add `onClick={() => setSelectedContactId(c.id)}` and `className="cursor-pointer hover:bg-muted/50"` |
| After contacts Card (~line 611) | Add `<Sheet>` component with call detail content |

The detail panel will look up the call data from the existing `callByContact` map using `selectedContactId`, so no additional API calls are needed.

