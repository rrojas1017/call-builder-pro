

# Fix: Auto-Scroll to Result Card When Clicking Call History

## Problem
When you click a row in the Call History table, the Result card (with transcript, recording player, and evaluation) loads **above** the history table. Since you're scrolled down to see the history, you don't see the result appear — it looks like nothing happened.

## Solution
Add auto-scroll behavior to `handleSelectHistory` so the page scrolls up to the Result card when a history row is clicked.

## Technical Details

### File: `src/pages/UniversityPage.tsx`

1. Add a `ref` to the Result card container (e.g., `resultRef = useRef<HTMLDivElement>(null)`)
2. In `handleSelectHistory`, after setting the contact state, call `resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })` with a small `setTimeout` to let React render first
3. Attach the ref to the Result card's wrapping div

This is a one-line behavioral fix — no layout changes needed.

