

# Add Inline & General Feedback to Live Simulation Chat

## What Changes

**Single file**: `src/components/LiveSimulationChat.tsx`

### 1. New state variables
- `feedbackMessageIndex` — which message bubble has feedback open
- `feedbackText` — inline feedback input value
- `generalFeedback` — bottom coach box value
- `applyingFeedback` — loading state
- `feedbackApplied` — array of applied feedback strings (for counter badge)

### 2. New imports
- `Input`, `Textarea` from UI components
- `MessageCircle`, `Send`, `CheckCircle` from lucide-react

### 3. `handleSubmitFeedback` function
- Takes feedback text + optional context message
- If context message provided, wraps feedback with the message content for context
- Calls `apply-audit-recommendation` edge function with `project_id`, `recommendation`, `category: "user_feedback"`
- On success: shows toast with what changed, tracks in `feedbackApplied`, clears inputs
- On error: destructive toast

### 4. Message bubbles become clickable
- Clicking a message (when not running) toggles `feedbackMessageIndex`
- Selected message gets a ring highlight
- Small `MessageCircle` icon hint on each bubble when not running
- Below the selected message: an `Input` + send button appears for inline feedback
- Enter key submits, sends feedback with the clicked message as context

### 5. General "Coach Your Agent" feedback box
- Appears after `messages.length > 2` in the footer area
- `Textarea` (single row) + Send button
- Enter (without shift) submits general feedback (no specific message context)
- Shows green badge with count of applied feedback items

### No backend changes needed
Uses existing `apply-audit-recommendation` edge function which already handles mapping natural language feedback to spec changes.

