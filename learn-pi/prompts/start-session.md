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

Then open the session with a warm, proactive greeting that references one of the user's known interests from `profile.md`. Keep it short. Invite, don't interrogate.
