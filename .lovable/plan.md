
# Add "Apply Fix" Button to Test Results Modal

## Overview
Enhance the `TestResultsModal.tsx` component to allow users to apply recommended improvements from evaluation results, automatically patch the agent spec, and re-run tests with the updated configuration.

## Architecture & Flow

### Current State
- `TestResultsModal.tsx` displays evaluation results with recommended improvements
- Each improvement has: `field`, `reason`, `suggested_value`
- `apply-improvement` edge function already exists and handles spec versioning
- Test runs are isolated from campaigns via metadata routing

### Proposed Changes

#### 1. **TestResultsModal.tsx Enhancements**
**Add state variables:**
- `applyingFixId`: Track which improvement is being applied (show loading state)
- `appliedFixes`: Track applied fixes to prevent duplicate clicks
- Need reference to `projectId` (passed via props)
- Need reference to `testRunId` (already available)

**New handler function: `handleApplyFix(improvement)`**
- Extract improvement data (field, suggested_value, reason)
- Call `apply-improvement` edge function with:
  ```typescript
  {
    project_id: projectId,
    improvement: {
      field: improvement.field,
      suggested_value: improvement.suggested_value,
      reason: improvement.reason
    }
  }
  ```
- On success:
  - Show toast: "Fix applied! Agent spec updated to version X."
  - Mark improvement as applied (disable button or visual indicator)
  - Optionally trigger auto-retest OR show "Re-run Test" button
- On error:
  - Show destructive toast with error message

**UI Changes in detail view:**
- For each recommended improvement item, add:
  - "Apply Fix" button (primary variant, right-aligned)
  - Button disabled if: already applied, currently applying, or test still running
  - Show loading spinner while applying
  - Visual indicator (checkmark or badge) after successful application

**Optional: Auto-retest logic**
- After applying a fix, either:
  - Automatically re-run the test (simple but noisy)
  - Show a "Re-run with Updated Spec" button (gives user control)
  - Recommend: Show a highlighted banner like "Fix applied! Re-run tests to verify improvement." with a "Re-run" button

#### 2. **Props Update**
Add to `TestResultsModalProps`:
```typescript
interface TestResultsModalProps {
  testRunId: string;
  projectId: string;  // NEW - required for apply-improvement
  open: boolean;
  onClose: () => void;
}
```

#### 3. **Integration Point: TestLabSection.tsx**
Pass `projectId` when rendering `TestResultsModal`:
```typescript
<TestResultsModal
  testRunId={testRunId}
  projectId={projectId}  // NEW
  open={showResults}
  onClose={() => setShowResults(false)}
/>
```

## Implementation Details

### Apply Fix Handler
```typescript
const handleApplyFix = async (improvement: any) => {
  try {
    setApplyingFixId(improvement.field);
    const { data, error } = await supabase.functions.invoke("apply-improvement", {
      body: {
        project_id: projectId,
        improvement: {
          field: improvement.field,
          suggested_value: improvement.suggested_value,
          reason: improvement.reason
        }
      }
    });
    if (error) throw error;
    
    // Mark as applied
    setAppliedFixes(prev => [...prev, improvement.field]);
    
    // Show success
    toast({
      title: "Fix applied!",
      description: `Agent spec updated to version ${data.to_version}.`
    });
    
    // Optional: Show re-test prompt
    // Could auto-trigger re-test or show button
  } catch (err: any) {
    toast({
      title: "Failed to apply fix",
      description: err.message,
      variant: "destructive"
    });
  } finally {
    setApplyingFixId(null);
  }
};
```

### UI Rendering in Detail View
In the improvements section (lines 178-191):
```typescript
{selected.evaluation.recommended_improvements?.length > 0 && (
  <div className="space-y-1">
    <p className="text-xs font-medium text-muted-foreground">Recommended Improvements</p>
    <ul className="text-xs text-foreground space-y-2">
      {selected.evaluation.recommended_improvements.map((imp: any, i: number) => (
        <li key={i} className="rounded-lg bg-muted/30 border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="font-medium">{imp.field}</p>
              <p className="text-muted-foreground text-xs mt-1">{imp.reason}</p>
              <p className="mt-2">Suggested: <span className="text-primary">{imp.suggested_value}</span></p>
            </div>
            <Button
              onClick={() => handleApplyFix(imp)}
              disabled={applyingFixId === imp.field || appliedFixes.includes(imp.field)}
              size="sm"
              variant={appliedFixes.includes(imp.field) ? "ghost" : "default"}
              className="shrink-0"
            >
              {applyingFixId === imp.field && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {appliedFixes.includes(imp.field) ? (
                <>
                  <CheckCircle className="mr-1 h-3 w-3" /> Applied
                </>
              ) : (
                "Apply Fix"
              )}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  </div>
)}
```

## Files to Modify

1. **src/components/TestResultsModal.tsx**
   - Add `projectId` to interface
   - Add state: `applyingFixId`, `appliedFixes`
   - Add `handleApplyFix()` function
   - Update improvement item UI with button and visual indicators
   - Update imports (add `CheckCircle` icon, already imported)

2. **src/components/TestLabSection.tsx**
   - Pass `projectId` prop to `TestResultsModal`

## Design Decisions

- **Visual Feedback**: Button changes to "Applied ✓" with checkmark after success, preventing accidental re-applies
- **No Auto-retest**: Give users control; they can re-run manually via the "Run Tests" button if desired
- **Single Fix at a Time**: Each fix is applied individually (allows seeing the impact before next fix)
- **Disabled While Running**: Apply button is disabled while test is still running (prevents spec changes mid-test)
- **Toast Notifications**: Show version number to confirm spec was updated
- **Error Handling**: Clear error messages if fix fails (e.g., invalid field, invalid value type)

## Testing Flow

1. Create agent, answer questions, reach Step 3
2. Enter 2-3 manual contacts
3. Run test, wait for results
4. View details of a completed call
5. Click "Apply Fix" on a recommended improvement
6. Verify:
   - Button shows loading spinner
   - Toast shows success with new version number
   - Button changes to "Applied ✓" and is disabled
7. Optionally re-run tests to verify improvement
