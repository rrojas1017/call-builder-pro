

## Make AI Simulation Training & Extracted Data Collapsible

Two sections will be wrapped in `Collapsible` components so they're collapsed by default and expandable on demand.

### Changes

**File: `src/pages/UniversityPage.tsx`**

1. **Add imports**: Import `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` from `@/components/ui/collapsible`, and `ChevronDown`, `BrainCircuit`, `Database` from lucide-react (some may already be imported via `SimulationTraining`)

2. **AI Simulation Training (lines 596-603)**: Wrap `<SimulationTraining>` in a `Collapsible` (default closed). The trigger will be a styled glass-card header row with `BrainCircuit` icon, "AI Simulation Training" label, a "No Phone Needed" badge, and a rotating chevron. The `<SimulationTraining>` component goes inside `<CollapsibleContent>`.

3. **Extracted Data (lines 1086-1092)**: Wrap the extracted data `<pre>` block in a `Collapsible` (default closed). The trigger replaces the current `<h5>` with a clickable row showing "Extracted Data" and a rotating chevron. The `<pre>` block goes inside `<CollapsibleContent>`.

Both use the same pattern: compact clickable header → content revealed on click, with a `transition-transform` rotating chevron to indicate state.

