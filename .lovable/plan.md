

## Add Campaign Filter to Calls Page

### What
Add a campaign dropdown filter to the filter bar so you can scope all calls, stats, and the map to a specific active campaign.

### How

**File: `src/pages/CallsPage.tsx`**

1. **New state**: Add `campaignFilter` (string, default `"all"`) and `campaigns` (array of `{id, name, status}`).

2. **Fetch campaigns**: In the existing `useEffect` data loader, add a third parallel query:
   ```
   supabase.from("campaigns").select("id, name, status").order("created_at", { ascending: false })
   ```

3. **Add `campaign_id` to the Call interface**: It already exists in the DB schema but is missing from the local `Call` type.

4. **Filter bar UI**: Add a `Select` dropdown (using the existing Radix Select component) between the search input and the direction tabs:
   - "All Campaigns" as default
   - Each campaign shown as `name` with a small status badge
   - Only campaigns with status `running`, `paused`, or `completed` shown (skip `draft`)

5. **Filter logic**: In the `filteredCalls` useMemo, add:
   ```
   if (campaignFilter !== "all" && c.campaign_id !== campaignFilter) return false;
   ```

6. **CSV export**: Add campaign name column to the CSV output.

### Technical Details

| Area | Change |
|------|--------|
| `Call` interface (line ~22) | Add `campaign_id: string \| null` |
| State declarations (~line 163) | Add `campaignFilter` + `campaigns` state |
| Data fetch useEffect (~line 205) | Fetch campaigns in parallel, store in state |
| `filteredCalls` useMemo (~line 272) | Add campaign_id filter condition |
| Filter bar JSX (~line 394) | Add Select dropdown for campaign |
| `exportCSV` helper (~line 121) | Add Campaign column |

Only `src/pages/CallsPage.tsx` is modified.
