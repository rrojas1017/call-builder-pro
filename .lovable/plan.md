

# Fix: Minor Dialog Text Cleanup in InboundNumbersPage

## Current State
The Inbound Numbers page is already correctly configured to use Retell exclusively with $2.00 pricing. The purchase handler calls `manage-retell-numbers`, there is no provider toggle, and the cost displays "$2.00 billed through Append".

## Issue Found
One small leftover: the dialog description on line 208 still reads "Choose a provider and area code to purchase a new phone number." Since there is no longer a provider choice, this text should be updated.

## Change

### `src/pages/InboundNumbersPage.tsx` (line 208)
Update the `DialogDescription` text from:
- "Choose a provider and area code to purchase a new phone number."

To:
- "Select an area code to purchase a new phone number."

This is a single-line cosmetic fix. No logic changes needed -- the purchase flow is already fully migrated to Retell.

