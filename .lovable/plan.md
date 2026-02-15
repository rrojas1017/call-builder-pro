

## Add Qualified Count and Conversion Rate to Campaign KPIs

### What changes

Replace the "Completed" KPI card with "Qualified" and replace "Success Rate" with "Conversion Rate" (qualified + transferred / total called).

### Technical details

**File: `src/pages/CampaignDetailPage.tsx`**

1. **Add qualified count** (from `calls` data, since `outcome` lives on the `calls` table):
```typescript
const qualified = calls.filter((c) => c.outcome === "qualified").length;
```

2. **Add conversion rate** -- qualified (and transferred) divided by total contacts that were actually called (not queued):
```typescript
const called = contacts.filter((c) => c.status !== "queued").length;
const conversionRate = called > 0 ? Math.round((qualified / called) * 100) : 0;
```

3. **Update the KPI array** (lines 324-334):
   - Change `{ label: "Completed", value: completed }` to `{ label: "Qualified", value: qualified }`
   - Change `{ label: "Success Rate", value: successRate% }` to `{ label: "Conversion Rate", value: conversionRate% }`

### Result

| Before | After |
|---|---|
| Completed: 3 | Qualified: 2 |
| Success Rate: 43% | Conversion Rate: 25% (2 qualified / 8 called) |

All other KPI cards (Total Contacts, In Progress, Terminal, Retryable, Failed, Avg Duration, Avg Score) remain unchanged.

