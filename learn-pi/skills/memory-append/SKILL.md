---
name: memory-append
description: When the user reacts notably to a turn — lights up, gets frustrated, shares a concrete detail about their life — append one line to MEMORY.md so future sessions have continuity.
when_to_use: Trigger at end-of-turn whenever the user's reply contained a notable signal: specific detail (name, place, event), emotional reaction (excitement, frustration, nostalgia), a preference ("I'd rather...", "I hate..."), or a goal ("I want to be able to...").
tools: [vault_read, vault_write]
learning_event: none
learning_event_rationale: Continuity-keeping, not a pedagogical move. Orthogonal to LE class.
---

MEMORY.md is the learner's session-to-session continuity file. Each entry is
one short line the future you will read on session start. Keep entries
**concrete, specific, and compressed** — facts and reactions, not summaries.

Steps:

1. `vault_read("MEMORY.md")`. Preserve the frontmatter and the `## Sessions`
   section header.
2. Compose ONE line in this shape:
   ```
   - YYYY-MM-DD: <concrete observation or quote>
   ```
   Good entries:
   - `- 2026-04-19: lit up about foal training, named the new mare "Luna"`
   - `- 2026-04-19: frustrated with subjunctive in "ojalá que", asked three times`
   - `- 2026-04-19: wants to read Borges in Spanish by end of year`
   Bad entries (too vague / too long):
   - `- 2026-04-19: had a nice conversation about horses`
   - `- 2026-04-19: the user seems to be making progress on Spanish`
3. `vault_write("MEMORY.md", <existing content + new line>)`. Append under
   `## Sessions`; do not rewrite prior entries, do not reorder.
4. At most ONE entry per turn. If multiple signals fired, pick the most
   specific one.

Hard rules:
- Do not append if the turn was routine (small talk, a recall-weave that
  landed without reaction, a spot-gloss).
- Do not append anything the user didn't actually say or demonstrate. No
  guessing at internal states ("user seems bored", "user probably knows X").
- If you promote a MEMORY.md entry into a concept-graph triple, use
  `concept-commit` (base-language confirmation required); MEMORY.md does NOT
  gate those writes.
