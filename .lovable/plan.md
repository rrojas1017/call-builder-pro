

## Add Personality Remark to Agent Profile Card

### What it does

Adds a short, witty 1-3 line personality description between the maturity bar and the stats row. This gives the agent character and makes the selection process more engaging -- like reading a bio on a trading card.

### Personality remarks by maturity level

| Level | Remark |
|---|---|
| training | "Fresh out of the academy. Eager, enthusiastic, and still figuring out when to stop talking." |
| developing | "Getting the hang of it. Handles objections with growing confidence and only occasionally panics." |
| competent | "A solid performer. Knows the script, reads the room, and rarely trips over their own words." |
| expert | "Battle-tested closer. Turns 'not interested' into 'tell me more' like it's second nature." |
| graduated | "The legend. Could sell ice to a penguin and make it feel like a favor." |

### Technical details

**File: `src/components/AgentProfileCard.tsx`**

1. Add a `personality` string field to the `maturityConfig` object for each level
2. Render the remark as a `<p>` tag with `text-xs text-muted-foreground italic` styling, placed between the maturity bar div and the stats grid div
3. Max 3 lines enforced via `line-clamp-3` utility class
4. No data fetching changes -- personality is derived purely from the existing `maturityLevel` prop

### Layout

```text
+------------------------------------------------------------+
| [====>                                   ] Developing  30%  |
| "Getting the hang of it. Handles objections with growing    |
|  confidence and only occasionally panics."                  |
+------------------------------------------------------------+
|  54    6     45.9/100   323    v37    36                    |
| Total Qual  Avg Score  Know  Vers  Improv                  |
+------------------------------------------------------------+
```

