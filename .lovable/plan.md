

## Reorganize Sidebar with Section-Based Grouping

### Overview
The current sidebar has a flat list of navigation items. The reference design organizes items into logical sections (BUILD, DEPLOY, MONITOR, SYSTEM) with section headers and better visual hierarchy. This makes navigation more intuitive and reduces cognitive load for users.

### Design Approach (Based on Reference Image)

**Proposed Section Structure:**

1. **BUILD** - Agent creation and configuration
   - Dashboard
   - Agents
   - Create Agent
   - Knowledge Base

2. **DEPLOY** - Campaigns, contact management, and inbound setup
   - Campaigns
   - Lists
   - Phone Numbers (Inbound)

3. **MONITOR** - Execution, testing, and quality assurance
   - Calls
   - Gym (Test/QA)

4. **SYSTEM** - Account management and settings
   - Settings

### Technical Implementation

**File to modify: `src/components/AppSidebar.tsx`**

1. **Restructure data**: Replace flat `navItems` array with a `navSections` object containing:
   ```
   {
     BUILD: [items...],
     DEPLOY: [items...],
     MONITOR: [items...],
     SYSTEM: [items...]
   }
   ```

2. **Update render logic**: Loop through sections and render:
   - Section header with gray/muted styling (uppercase, small font, similar to reference)
   - Items within that section with spacing
   - Consistent spacing between sections

3. **Styling adjustments**:
   - Section headers: `text-xs font-semibold text-muted-foreground uppercase tracking-wider`
   - Add `mt-6 mb-3` to section headers (more spacing above, less below)
   - Remove `space-y-1` from nav wrapper, replace with section-specific spacing
   - Keep all existing item styling (active states, hover effects, icons)

4. **No new dependencies needed** - uses existing Tailwind and lucide-react icons

### Benefits
- Better mental model for users (organized by workflow stage)
- Cleaner visual hierarchy
- Easier to find related features
- Matches modern SaaS navigation patterns (like the reference image)

### What Stays the Same
- Active route highlighting
- Logo and branding
- Sign Out button at bottom
- Responsive layout and styling system
- All routing behavior

