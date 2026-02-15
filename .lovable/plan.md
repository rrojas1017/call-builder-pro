
## Add Manual Mode Override to Agent Creation Wizard

### Problem
The agent mode (Outbound / Inbound / Hybrid) is currently set entirely by the AI during spec generation, with no way for users to correct it if the AI misclassifies their agent.

### Solution
Add a mode selector in **Step 3 (Review & Save)** that shows the AI-detected mode and lets users override it. The override will be saved to the `agent_specs` table alongside the other settings.

### Changes

**File: `src/pages/CreateAgentPage.tsx`**

1. **Add state** for agent mode:
   - `const [agentMode, setAgentMode] = useState<"outbound" | "inbound" | "hybrid">("outbound");`

2. **Initialize from spec** -- when the spec is loaded in `handleSaveAnswers` (around line 116), set `agentMode` from `data.spec.mode`.

3. **Add a Mode selector card** in Step 3, placed right after the summary cards and before the Voice Provider section (~line 302). It will use the same button-card pattern already used for Voice Provider and Call Ending:
   - Three options: Outbound, Inbound, Hybrid
   - Each with an icon (Phone, PhoneIncoming, PhoneForwarded) and short description
   - Pre-selected to the AI-detected mode

4. **Save the override** -- in `handleSaveAgent` (line 141), include `mode: agentMode` in the `agent_specs` update call.

### UI Preview

The new section will look like the existing Voice Provider selector:

```text
+--------------------------------------------------+
| Agent Mode                                       |
| The AI detected this as [mode]. Change if needed.|
|                                                  |
| [Outbound]     [Inbound]      [Hybrid]          |
|  Makes calls    Receives       Both directions   |
|  to contacts    incoming calls                   |
+--------------------------------------------------+
```

### No backend or database changes needed
The `mode` column already exists on `agent_specs` and accepts these three values.
