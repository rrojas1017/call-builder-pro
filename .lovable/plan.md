

# Fix: Make Difficulty Selector Available on Live Practice Tab

## Problem
The difficulty dropdown and other config options are nested inside the Training tab content. When the user switches to the Live Practice tab, those controls vanish — so difficulty is stuck on the default "medium" with no way to change it.

## Fix

### `src/components/SimulationTraining.tsx`
Move the **Customer Difficulty** selector out of the Training tab and place it **above the Tabs component** (or between the Tabs header and content) so it's visible and usable regardless of which tab is active. The Training Mode, Rounds, and Calls per Round controls stay inside the Training tab since they're only relevant there.

Specifically:
1. Extract the difficulty `Select` from the `grid grid-cols-2` inside `TabsContent value="training"`
2. Place it above the `<Tabs>` component, after the description text
3. Keep the Training Mode select inside the Training tab (make it full-width since difficulty moved out)
4. The `difficulty` state is already shared and passed to `LiveSimulationChat` — no other changes needed

