

# Add Transfer Configuration to Agent Creation

## What This Does
Adds a simple "Call Ending" section to the Review & Save step where you can choose what happens when the agent finishes qualifying someone:
- **Hang up** (default) -- the agent wraps up and ends the call
- **Transfer to a live person** -- the agent transfers the caller to a phone number you provide

## Changes

### 1. Add transfer config UI to Step 3 (Review & Save)
Add a new section between the summary cards and voice selection with two options:

- A toggle or radio choice: "End call normally" vs "Transfer to live agent"
- When transfer is selected, show a phone number input field
- Pre-populate from `spec.transfer_phone_number` if it already has a valid number

### 2. Save transfer settings on "Save Agent"
Update the `handleSaveAgent` function to include `transfer_required` and `transfer_phone_number` in the spec update. Validate the phone number has at least 10 digits before saving.

### 3. Update the Transfer Logic summary card
The existing "Transfer logic" summary card will update dynamically based on the toggle state instead of only reading from the spec.

## Technical Details

### File: `src/pages/CreateAgentPage.tsx`
- Add state: `transferEnabled` (boolean), `transferPhone` (string)
- Initialize from `spec.transfer_required` and `spec.transfer_phone_number` when spec loads
- Add UI section with radio/switch + phone input between summary cards and voice selection
- Update `handleSaveAgent` to include `transfer_required: transferEnabled` and `transfer_phone_number` (formatted with +1 prefix) in the spec update call
- Update the Transfer Logic summary card to reflect the current toggle/phone state

No database or edge function changes needed -- the columns and Bland API integration already exist.
