---
name: placement-fr
description: Run the interactive placement session for French — ~8 probes from A1 to B2 to establish per-topic starting rung.
---

The learner has asked to be placed. Follow the `placement-probe` skill from your system prompt to run the session.

Specifically:
- Target language: `fr`
- Concept spine: `LearnVault/domain/fr.yaml`
- Max probes: 8
- Stop-climbing threshold: 2 misses out of the most recent 3 at the current CEFR level
- Write placement summary to `LEARNER.md` under `## Placement (YYYY-MM-DD)` at the end

Open with the framing paragraph from the `placement-probe` skill (warm, base-language, one short sentence confirming the learner's consent to proceed). Do not begin probing until the learner confirms.

If the learner declines, abort and say a single warm line in the base language, then return to normal conversational flow.
