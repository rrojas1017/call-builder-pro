

# Add Drag-to-Reorder for Must-Collect Fields

## What We're Building
Add the ability to drag and reorder the Must-Collect Fields badges in the Conversation Flow section of the Edit Agent page. Since these fields define the order the agent asks questions during a call, reordering is essential.

## Approach
Use simple drag-and-drop with native HTML5 drag events (no new library needed — keeps it lightweight). Each badge gets `draggable`, and we track drag source/target to swap positions on drop. Add a subtle grip icon to indicate draggability.

## Changes

### `src/pages/EditAgentPage.tsx`
- Add `draggedIndex` state to track which field is being dragged
- Add `onDragStart`, `onDragOver`, `onDragEnd`, `onDrop` handlers to reorder the `mustCollectFields` array
- Add a `GripVertical` icon (from lucide-react) to each Badge to indicate it's draggable
- Set `draggable` attribute on each badge wrapper
- Visual feedback: highlight drop target position with a border/opacity change during drag

The existing `mustCollectFields` state array and the save flow already preserve order, so no backend changes are needed.

### Files Changed
- **`src/pages/EditAgentPage.tsx`** — Add drag-and-drop reordering to Must-Collect Fields badges

