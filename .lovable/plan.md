
## Add Popular Area Codes to Purchase Dialog

### Current State
The "Buy Number" dialog currently uses a plain `<Input>` field where users type a 3-digit area code manually. When an area code has no available numbers, users get an error message suggesting alternatives like 213, 312, 469, 786.

### Proposed Solution
Replace the text input with a `<Select>` component that displays popular, known-available area codes. This improves UX by:
1. **Reducing friction** - Users don't need to guess valid area codes
2. **Improving success rate** - Pre-selected codes are known to work with Bland
3. **Maintaining flexibility** - Keep the text input as a fallback for advanced users

### Implementation Details

**Popular Area Codes to Include:**
- **213** (Los Angeles, CA)
- **312** (Chicago, IL)
- **415** (San Francisco, CA)
- **469** (Dallas-Fort Worth, TX)
- **516** (Long Island, NY)
- **604** (Vancouver, BC)
- **647** (Toronto, ON)
- **702** (Las Vegas, NV)
- **786** (Miami, FL)
- **905** (Greater Toronto, ON)

**UI Changes:**
- Replace the text `<Input>` with a `<Select>` component
- Display area code + city name (e.g., "213 - Los Angeles, CA")
- Keep the current validation logic that blocks purchase if area code is empty
- Add a helper text: "Select from popular area codes or enter a custom code"

**Code Changes:**
1. Add a constant defining popular area codes with their city mappings
2. Replace the Input element with Select/SelectItem components
3. Optionally add a custom input option for advanced users who want to try other area codes
4. Update state management if needed (currently areaCode state works for both input and select)

### Files to Modify
- `src/pages/InboundNumbersPage.tsx` - Replace Input with Select, add area code constants

### No Database or Backend Changes Required
The edge function `manage-inbound-numbers` already handles any area code, so this is purely a frontend UX improvement.
