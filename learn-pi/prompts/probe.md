---
description: Probe a concept node to expand the belief graph
---

Probe the concept subject `$1`.

1. Call `concepts.query({subject: "$1"})` to see what is already known about this subject in the belief graph.
2. Invoke the `concept-probe` skill scoped to `$1`, using the query result as seed context so you don't re-ask what's already answered.

Two-map rule: probe questions MUST be asked in the user's base language, not the target language. Probing is about eliciting facts and preferences, not language practice — mixing the two corrupts both maps.
