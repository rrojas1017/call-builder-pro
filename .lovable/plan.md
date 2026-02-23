
# Rename "Agent Name" to "Agent Profile" with Subtitle

## Overview
Change the first field label in the agent creation wizard from "Agent Name" to "Agent Profile" to better distinguish it from the persona name field. The actual input field stays the same -- only the label text changes.

## Changes

### File: `src/pages/CreateAgentPage.tsx`

Update the `agentNameLabel` string in all 6 language translation objects:

| Language | Current | New |
|----------|---------|-----|
| English | "Agent Name" | "Agent Profile" |
| Spanish | "Nombre del Agente" | "Perfil del Agente" |
| French | "Nom de l'Agent" | "Profil de l'Agent" |
| Portuguese | "Nome do Agente" | "Perfil do Agente" |
| German | "Agentenname" | "Agentenprofil" |
| Italian | "Nome dell'Agente" | "Profilo dell'Agente" |

Also update the rendering section (~line 560-562) to show a smaller "Agent Name" subtitle beneath the "Agent Profile" heading, making it clear the input is for the agent's internal/project name:

```text
Agent Profile
Agent Name
[ Health Insurance Pre-Qualifier    ]

Agent Persona Name
[ Sofia                             ]
This is the name your agent will introduce itself as on the call.
```

The label becomes a slightly larger heading ("Agent Profile") with a smaller sub-label "Agent Name" directly above the input, so users understand this is the profile/project name -- not the name spoken on calls.
