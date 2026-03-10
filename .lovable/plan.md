

## Remove "Test 1 Call" Button

**File: `src/components/SimulationTraining.tsx`**

Remove the "Test 1 Call" button and its associated logic:

1. **Remove the button** — Delete the `<Button variant="outline" onClick={handleSingleSimulation} ...>` element (around line 236-238)
2. **Remove `handleSingleSimulation` function** (around lines 157-168)
3. **Remove `singleResult` and `singleRunning` state** (around lines 76-77)
4. **Remove `SingleResultCard` component** at the bottom of the file
5. **Remove the `singleResult` rendering block** (around line 253-255)
6. **Remove `singleRunning` from `isDisabled`** check and tab disable conditions

The full training loop already covers this use case — users can set rounds=1, calls=1 for a quick test.

