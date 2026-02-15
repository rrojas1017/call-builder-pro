

## Add VM / Non-Connect Summary Card

### What changes

**File: `src/pages/CampaignDetailPage.tsx`**

1. **Add non-connect stats** after the existing stats computation (around line 229):
   - Count `voicemail` contacts
   - Count `no_answer` contacts  
   - Count `busy` contacts
   - Sum all three as `nonConnect`

2. **Include non-connects in `processed` count** so the progress bar reflects reality:
   - Change `processed = completed + failed` to `processed = completed + failed + voicemail + noAnswer + busy`

3. **Add two new KPI cards** to the existing KPI row:
   - "Voicemail" -- shows voicemail count
   - "Non-Connect" -- shows total of voicemail + no_answer + busy
   - Insert these after "Failed" in the kpis array

4. **Update grid layout** from `lg:grid-cols-7` to `lg:grid-cols-9` to accommodate the two new cards

### Technical detail

| Area | Change |
|---|---|
| Stats (line ~228) | Add `voicemail`, `noAnswer`, `busy`, `nonConnect` counters |
| `processed` (line 230) | Include voicemail + noAnswer + busy in processed total |
| `kpis` array (line 283) | Add `{ label: "Voicemail", value: voicemail }` and `{ label: "Non-Connect", value: nonConnect }` after "Failed" |
| Grid class (line 402) | Change `lg:grid-cols-7` to `lg:grid-cols-9` |

This is a ~10 line change, no new files or dependencies.

