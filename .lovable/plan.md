

# Test: Create Append Agent, then Optimize with AI

## What to Do (Step-by-Step)

1. **Navigate to the agent's edit page** (you're already on `/agents/f153e2b5-55f0-4441-8de8-71cb67723e6b/edit`)

2. **Create the Append Agent**
   - In the "Voice Provider" section, click the **"Create Append Agent"** button
   - Wait for the toast confirmation showing the new Agent ID
   - The RetellAgentManager card should switch to the "Append Agent Connected" status view

3. **Save the agent** by clicking the Save button at the bottom -- this persists the new `retell_agent_id` to the database

4. **Click "Optimize with AI"** in the top-right header
   - Wait for the AI analysis to complete (uses Gemini 3 Pro)
   - The modal should open showing the optimization score and recommendations

5. **Click "Apply All Auto-Applicable Optimizations"**
   - This time, since a Retell agent exists, it should patch the **live Retell Agent API** and **Retell LLM API** directly
   - The green success banners should show "Applied X agent settings" and/or "Applied X LLM settings" (NOT the yellow "saved to spec" banner)

## What Success Looks Like

- Green banner: "Applied N agent settings" (patches sent to Retell Agent API)
- Green banner: "Applied N LLM settings" (patches sent to Retell LLM API)
- Toast: "Optimizations applied! N settings updated."
- No yellow "saved to spec" fallback banner

## No Code Changes Needed

The existing implementation already handles both paths:
- **With `retell_agent_id`**: Patches are sent directly to the Retell API (`update-agent` and `update-retell-llm` endpoints)
- **Without `retell_agent_id`**: Falls back to saving to local `agent_specs` table

The only prerequisite is creating the agent first (step 2) so the `retell_agent_id` is populated.

