---
description: Begin a learning session in a target language
---

Start a learning session for language code `$1`.

Steps (perform in order, silently — do not narrate them to the user):

1. Read `profile.md` to refresh the user's interests, goals, and base language.
2. Read `zpd/$1.md` to load the current rung level and calibration notes for `$1`.
3. Read `queue/$1-due.md` as latent context only. Do NOT dump the due queue at the user. Items here are weaving material for future turns, not a checklist to recite.
4. Query the concept graph for the top 5 most-covered subjects so you know what the user has already touched.
5. Call the `zpd-calibrate` skill before composing your first utterance. Your opening MUST sit at the current rung level, not above it.
6. Decide the KLI Learning Event class for your opening turn and call `le.declare` exactly once: `memory_fluency` if weaving recall, `induction` if surfacing a contrast, `sense_making` if asking the learner to explain. Skipping `le.declare` causes the turn to be logged as `(undeclared)` and surfaces in the report.
7. Check the `probe_quota` line in the directive. If it is non-zero AND the cooldown is satisfied, prefer your first turn to be a probe: ask the lemma's gloss in the base language, no scaffold, then call `mastery.probe(lemma, quality)` based on the user's reply. Probes are SEPARATE turns from weaving — never mix the two in one utterance.

Then open the session with a warm, proactive greeting that references one of the user's known interests from `profile.md`. Keep it short. Invite, don't interrogate.
