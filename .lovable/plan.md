

## Add Humanness and Naturalness Scores + Trend Chart

### Part 1: Add Missing Scores to Quick Test Results

Currently, the score grid on QuickTestPage only shows 3 scores (Compliance, Objective, Overall). We'll expand it to show all 5 scores including Humanness and Naturalness.

**Changes to `src/pages/QuickTestPage.tsx`:**
- Expand the score grid from 3 columns to 5 columns (`grid-cols-5`)
- Add two new `ScoreCard` components for `humanness_score` and `naturalness_score`
- Add a section to display `humanness_suggestions` (tips the AI recommends for sounding more human)
- Add a section to display `knowledge_gaps` if any are detected

### Part 2: Humanness Trend Chart

Add a trend chart below the Quick Test form that shows humanness score history across past test calls for the selected agent.

**Changes to `src/pages/QuickTestPage.tsx`:**
- Query `test_run_contacts` joined with `test_runs` for the selected agent, pulling `evaluation` data from completed calls
- Use `recharts` (already installed) to render a line chart showing humanness score over time
- Chart appears below the test form, updates when agent selection changes
- X-axis: call date/time, Y-axis: humanness score (0-100)
- Add a reference line at score 80 (the threshold that triggers auto-improvement)

### Technical Details

**Score grid update (lines 253-258):**
```tsx
<div className="grid grid-cols-5 gap-2">
  <ScoreCard label="Compliance" score={contact.evaluation.compliance_score} />
  <ScoreCard label="Objective" score={contact.evaluation.objective_score} />
  <ScoreCard label="Overall" score={contact.evaluation.overall_score} />
  <ScoreCard label="Humanness" score={contact.evaluation.humanness_score} />
  <ScoreCard label="Naturalness" score={contact.evaluation.naturalness_score} />
</div>
```

**New sections after issues:**
- Humanness suggestions list (similar styling to issues but with a lightbulb icon)
- Knowledge gaps list (with a book icon)

**Trend chart query:**
```sql
SELECT trc.evaluation, trc.created_at
FROM test_run_contacts trc
JOIN test_runs tr ON tr.id = trc.test_run_id
WHERE tr.project_id = :agentId
  AND trc.status = 'completed'
  AND trc.evaluation IS NOT NULL
ORDER BY trc.created_at DESC
LIMIT 20
```

**Chart component:** A `LineChart` from recharts with:
- Line for humanness score (primary color)
- Optional line for naturalness score (secondary color)
- Reference line at 80 (auto-improvement threshold)
- Responsive container, dark-theme friendly

All changes are contained in `src/pages/QuickTestPage.tsx` -- no new files needed.
