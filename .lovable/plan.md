

# Simplify Agent Creation: Save Agent + Move Tuning to Test Lab

## Problem
Step 3 (Review) is overloaded with voice selection, voice tuning sliders, pronunciation guide, test lab, AND campaign launch -- all on one screen. There's no "Save Agent" button, so users feel forced to either test or launch. Voice tuning controls belong in the testing phase, not the creation phase.

## Solution
Restructure the flow into two clear phases:
1. **Create and Save** -- configure the basics, then save the agent
2. **Test and Improve** -- tune voice settings based on actual test call feedback

## Changes

### 1. Simplify Step 3 (Review) to focus on saving
Remove from Step 3:
- Voice Tuning section (temperature, interruption threshold, speaking speed sliders)
- Pronunciation Guide table
- Test Lab section
- Campaign Launch section (users can launch from the Campaigns page)

Keep in Step 3:
- Agent summary cards (who it calls, what it says, etc.)
- Voice selection (pick a voice preset or custom ID -- this is a basic config choice)
- "Edit Details" toggle for raw spec

Replace the bottom buttons with:
- **"Save Agent"** button (primary) -- saves the agent and navigates to the agent's detail/test page
- "Back" button

### 2. Move voice tuning into the Test Lab
Update `TestLabSection` to include an expandable "Voice Tuning" panel with:
- Temperature, Interruption Threshold, Speaking Speed sliders
- Pronunciation Guide manager
- These load current values from `agent_specs` on mount
- Changes save immediately to DB so the next test call uses them

This way, users configure tuning **after hearing test calls**, not before. The test-then-tune loop becomes the natural workflow.

### 3. Add "Save Agent" functionality
Create a `handleSaveAgent` function that:
- Updates the voice selection in `agent_specs` (already happens on click)
- Shows a success toast: "Agent saved! Run test calls to fine-tune."
- Navigates to `/agents` (or a future agent detail page)

### 4. Use creator's phone for test calls
Update the Test Lab to pre-populate with the logged-in user's phone number (from profiles table if available), making it clear the creator will receive the test calls. Add a note: "You'll receive the test call on your phone to evaluate quality."

## Technical Details

### Files to modify:
- **`src/pages/CreateAgentPage.tsx`**: Remove voice tuning, pronunciation guide, test lab, and campaign launch sections from Step 3. Add "Save Agent" button with navigation.
- **`src/components/TestLabSection.tsx`**: Add collapsible voice tuning panel that loads/saves `temperature`, `interruption_threshold`, `speaking_speed`, and `pronunciation_guide` from `agent_specs`. Import Slider and related UI components.
- No database changes needed -- all columns already exist.
- No edge function changes needed.

### New flow summary:
```text
Step 1: Describe Agent --> Step 2: Answer Questions --> Step 3: Review + Save
                                                              |
                                                              v
                                                     Agents List Page
                                                              |
                                                              v
                                                    Test Lab (per agent)
                                                     - Run test calls
                                                     - Adjust voice tuning
                                                     - Apply AI-recommended fixes
                                                     - Repeat until satisfied
                                                              |
                                                              v
                                                     Launch Campaign
```

