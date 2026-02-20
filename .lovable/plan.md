
# Fix AliviaLabs Agent: Remove Address + Align Collect Fields to Transfer Goal

## Root Cause

The problem is in the **agent spec data stored in the database**, not in the prompt builder code. The `must_collect_fields` array for this agent was auto-generated during wizard creation and contains fields that contradict the agent's actual goal.

**Current `must_collect_fields` (wrong):**
1. Nombre completo del cliente
2. Malestar principal identificado
3. Interés en la oferta (Sí/No)
4. **Dirección de envío (si acepta)** ← the address — this is for order fulfillment, NOT pre-qualification
5. Cómo el malestar afecta su vida diaria
6. ¿Qué ingredientes o componentes específicos te interesan en un suplemento?
7. ¿Has probado suplementos naturales antes? ¿Cuáles?

**The stated goal (`success_definition`):** "El cliente acepta la oferta promocional, se recolectan sus datos de envío y muestra una actitud positiva."

**The actual operational goal (what the user wants):** Get the prospect to agree to speak with a specialist — a **warm transfer**, not a full data collection + order process.

The shipping address (`dirección de envío`) only makes sense if the agent is closing the sale directly. But this agent should be a pre-qualifier that **transfers to a human specialist** to close.

---

## Two Things to Fix

### Fix 1: Update `must_collect_fields` in the database

Remove `"Dirección de envío (si acepta)"` and the deep product-curiosity questions (ingredients, prior supplements) — these belong in the post-transfer human conversation, not the AI pre-qualifier. Keep only the minimum needed to qualify and warm-transfer.

**New `must_collect_fields` (aligned to transfer goal):**
1. Consentimiento para grabar la llamada
2. Nombre completo del cliente
3. Malestar principal o condición de salud
4. Interés en hablar con un especialista de Alivia Labs

**New `success_definition`:** "El cliente acepta ser transferido a un especialista de Alivia Labs para recibir una asesoría personalizada."

### Fix 2: Update the `opening_line` to use persona name template

The current `opening_line` is hardcoded as a verbatim script with a specific contact name ("Ramón") baked in — it will say "Ramón" to every caller. It needs to use `{{first_name}}` and `{{agent_name}}` placeholders:

**Current (wrong):**
> `"¡Hola! Soy María de Alivia Labs. ¿Habló con Ramón? Perfecto. Ramón, le llamo porque..."`

**Fixed:**
> `"¡Hola {{first_name}}! Soy {{agent_name}} de Alivia Labs. Le llamo porque había mostrado interés en suplementos naturales para la salud, y quería platicarle sobre cómo podemos ayudarle. ¿Tiene unos minutitos? Ah, y por reglamento, ¿me permite grabar la llamada?"`

### Fix 3: Set `persona_name` so `{{agent_name}}` resolves correctly

The current `persona_name` is `null` — so `{{agent_name}}` would be replaced with an empty string. The agent was originally created with "María" as the implied persona. We set `persona_name = 'María'`.

---

## Files / Data Changed

| What | Change |
|------|--------|
| `agent_specs` row (DB) | Update `must_collect_fields` → remove address and product-deep questions |
| `agent_specs` row (DB) | Update `success_definition` → align to transfer goal |
| `agent_specs` row (DB) | Update `opening_line` → use `{{first_name}}` and `{{agent_name}}` templates |
| `agent_specs` row (DB) | Set `persona_name = 'María'` |

No code changes needed — only the stored spec data needs to be corrected. The prompt builder, edge functions, and UI all already handle these fields correctly.

---

## How the Agent Will Behave After This Fix

**Before:**
1. Opens with hardcoded "Ramón" regardless of who answers
2. Collects: name → condition → interest → **shipping address** → ingredient preferences → supplement history
3. Agent tries to close an order, not transfer

**After:**
1. Opens naturally: "¡Hola [caller's name]! Soy María de Alivia Labs..."
2. Collects: consent → name → main health concern → interest in speaking with specialist
3. If interested → **transfers to specialist** who handles the rest (address, order, etc.)

The collect sequence goes from 7 deep fields down to 4 qualification fields — much faster, less friction, and correctly scoped to the pre-qualifier role.
