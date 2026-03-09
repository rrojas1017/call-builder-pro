

# Make Voice Tuning AI-Only + Remove Advanced Editor + Simplify Qualification Rules

## Changes

### 1. Voice Tuning → Read-Only Display (lines 759-808)
Convert the Voice Tuning section from interactive sliders to a **read-only display**. Show current values with a note: *"These settings are automatically tuned by AI training based on call performance. No manual changes needed."* Remove the `Slider` components and replace with styled read-only value indicators (progress bars or static displays). Remove the state setters for `speakingSpeed`, `temperature`, and `interruptionThreshold` from `handleSave` — they stay in the DB but are only written by the AI optimization/training pipeline.

### 2. Remove Advanced Raw Spec Editor (lines 933-954)
Delete the entire `Collapsible` block for the raw spec editor. Remove the `showAdvanced`, `rawSpec` state variables and the `FileText`, `ChevronDown` imports if no longer used.

### 3. Simplify Qualification & Disqualification Rules (lines 622-647)
Replace the raw JSON textareas with a **plain-language input**. Instead of asking users to write JSON, provide:
- A simple textarea where users describe rules in natural language (e.g., "Age 18-64, recently moved, no employer coverage")
- The system converts this to JSON behind the scenes on save
- Display existing JSON rules as readable bullet points
- Add a helper note: *"Describe who qualifies or doesn't — AI will structure this for you."*

### Files Changed
- **`src/pages/EditAgentPage.tsx`** — All three changes above

