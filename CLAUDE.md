# How we work in this repo

Project memory for Claude Code. Read this before starting any non-trivial work in `/Users/sdawka/Code/learn/app`.

## What this project is

learn-pi is a proactive ZPD-calibrated language tutor built as a pi-mono extension. Markdown vault as source of truth, SQLite only for the concept graph, KLI + GIFT learning-science vocabulary throughout. The five working principles in `docs/PRINCIPLES.md` are not aspirational — they're enforced. If a change conflicts with a principle, the principle wins.

The full architecture lives in `docs/plan.md`. Read it once before touching unfamiliar code.

## Working principles you must respect

These are the constitution. The principles file expands them with code references and anti-patterns.

1. **Measure what the learner can do without scaffolds.** SM-2 ease is a scaffold reading. Mastery comes from unscaffolded probes only.
2. **Match instructional moves to knowledge types.** Facts get retrieval, skills get varied examples, principles get explanation prompts. Don't drill principles or explain facts.
3. **The vault is the source of truth, not the database.** Markdown over binaries. SQLite holds only what can't be expressed as text.
4. **Difficulty and pedagogy are orthogonal axes.** ZPD rung controls difficulty. Learning Event class controls pedagogy. Never conflate them.
5. **Every measurement must be falsifiable.** If the metric can't go bad, it's not a measurement. Cost-per-mastered-KC, learning curves, the gap report — all of these are designed to be capable of looking bad.

When you're about to add a feature, ask: which principle does it serve, which might it violate? If you can't answer, reconsider.

## Workflow

### Plans before code

For anything bigger than a typo fix:

1. Read the existing plan at `~/.claude/plans/jaunty-snuggling-starfish.md` if it's relevant. Overwrite if you're starting a fresh task.
2. Write a plan to that file with: Context (why), the design decision, files to touch, verification steps, out-of-scope. Keep it scannable.
3. Get user approval via `ExitPlanMode` before touching code.
4. Use `AskUserQuestion` for clarification, never for plan approval.

Plans should name the actual functions and file paths you'll touch, and reference existing helpers you can reuse (`Vault.readFrontmatter`, `gradeProbe`, `aggregateByTopic`, etc.). Don't propose new code when an existing function fits.

### Branch per change, PR via gh

Always work on a feature branch off `main`. Never commit to `main` directly. The pattern that's worked across PRs #1–#4:

```
git checkout main && git pull --ff-only
git checkout -b <descriptive-branch-name>
# ... do work, commit, push ...
gh pr create --title "..." --body "$(cat <<'EOF' ... EOF)"
```

Use squash-merge: `gh pr merge <N> --squash --delete-branch`.

### Parallel agents for verification before merge

Before merging any non-trivial PR, dispatch three parallel haiku verification agents. They run in the same message via parallel tool calls. The pattern that's worked:

1. **Code review pass** — read the diff, hunt for bugs, run typecheck and tests, verify contracts. Returns "READY TO MERGE" or a list of severity-classified findings.
2. **Functional test pass** — build a fresh fixture vault from scratch (not a reused one), run the affected scripts, verify edge cases (empty input, all-null usage, malformed JSON). Returns concrete PASS/FAIL per step.
3. **Principles audit** — does the change live up to its own claims? For each principle, find the code that enforces it (or doesn't). Returns ENFORCED / PARTIALLY ENFORCED / ASPIRATIONAL.

Frame agent prompts very explicitly: "EXECUTE IMMEDIATELY. You are NOT in plan mode. Do NOT enter plan mode." Without this they sometimes regress to writing plans instead of acting.

If an agent finds something fixable, apply a small **hardening pass** as a follow-up commit on the same branch before merging — don't open a separate PR for it. Examples: PR #3 hardened the zero-mastered case after the audit flagged it; PR #4 fixed an XSS in `data.lang` after code review caught it.

### Parallel agents for execution (when scope allows)

Streams of work that touch **disjoint files** can run in parallel via three execution agents. The pattern from PR #2 (KLI/GIFT activation):

- Stream A — turn planner / `learn-loop.ts` / prompts / skills
- Stream B — math + tests / `lib/*.ts` / `scripts/*.ts`
- Stream C — docs / README / PRINCIPLES / plan.md

Lock the **shared data contract upfront** in the plan file. Both producer and consumer must duplicate the type with a comment pointing at the plan section. Don't introduce a shared type file just for the contract — that creates a coordination point.

Caveats:
- If subagents land in plan mode despite explicit instructions, fall back to executing in the main context. This has happened repeatedly and the workaround is just doing it directly.
- Visual rendering work is best done in the main context with `agent-browser`, not delegated.
- `lib/cost.test.ts` style: object literals with `as const` on string-union fields, otherwise `tsc` rejects the implicit widening even though `vitest` runs.

### Verification before claiming done

Before claiming a feature is shipped:

1. `cd learn-pi && npm run typecheck` — must be clean
2. `npm test` — must show all tests passing
3. **End-to-end on a fresh fixture** — build a fixture vault from scratch (different from the existing `LearnVault`) and run the affected script against it. Confirm the numbers by hand.
4. Edge cases: empty input, null fields, malformed JSON. The report scripts should degrade gracefully, never crash.
5. For HTML output: open via `agent-browser` and screenshot. Read the screenshot. Confirm console + errors are clean.

Don't say "ready to merge" without running these. Don't trust the test count — actually look at the output.

## Code style

### File organization

- `learn-pi/lib/*.ts` — pure functions and types. No I/O except `vault.ts` and `concepts-db.ts` (the explicit boundaries). Test surface lives here.
- `learn-pi/extensions/*.ts` — pi-mono lifecycle hooks. Side-effecty. Tools registered here.
- `learn-pi/scripts/*.ts` — runnable via `tsx`, take a vault path argument, write output to a file or stdout.
- `learn-pi/skills/*/SKILL.md` — markdown with YAML frontmatter. Each declares a `learning_event` field.
- `learn-pi/prompts/*.md` — slash-command templates.

The top of each lib file gets a header comment like `// GIFT: Learner Module — knowledge state (ZPD rung + subscore)` so a reader can find the architectural role without grepping.

### TypeScript

- `import` from `.ts` extensions explicitly (the project uses tsx, not a bundler).
- Pure functions are the default. Side effects go in `extensions/` or at the boundary in `vault.ts`.
- Type duplications across producer/consumer are acceptable (and often correct) when they encode a protocol — comment at both sites pointing at the plan section that defines them.
- Test fixtures use `as const` on string-union literal fields to satisfy `tsc --noEmit`.

### Commits

- One-line title in conventional style (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).
- Body explains *why*, not *what*. The diff shows the what.
- No emojis. No AI attribution. Per the user's global instructions.
- Hardening passes get their own commit on the branch with a clear `fix:` prefix.

### Documentation

- The user's global instruction: "i really don't need comprehensive summaries. short summaries with action items and next steps are better." Honor this everywhere.
- Don't create new doc files unless asked. Append to `docs/plan.md` for status, update `README.md` for user-facing changes, update `docs/PRINCIPLES.md` only when adding or refining a principle.
- Reference learning-science papers by URL when introducing a new concept (KLI paper, GIFT description). The vocabulary in this project is technical and specific.
- Tone: terse, direct, principle-first. Read the existing prose in `docs/PRINCIPLES.md` for the voice.

## Frontend / UI work

When building visual surfaces:

- **No AI slop.** No purple gradients on white. No generic card layouts. No Inter / Roboto / Space Grotesk / system-font defaults. Distinctive typography only.
- The HTML dashboard uses Fraunces (display, variable serif) + JetBrains Mono (data, tabular numerals). Warm near-black background `#0f0e0c`, paper-white body `#f4f1e8`, one strong burnt-orange accent `#e4572e` reserved for regression signals only, sage green `#7a8b6f` for improvements. Per-`kc_type` palette: amber (fact), sage (skill), rust (principle).
- The accent is a signal, not a decoration. Every use must mean "something is wrong" or "look here, this is the falsifiability metric".
- Editorial data-journalism aesthetic: dense, asymmetric, hierarchical via type scale, generous use of horizontal rules and italic kickers.
- Verify visually with `agent-browser` before merging. Take screenshots. Read them. If you can't see what you built, you can't ship it.
- Always escape user-controlled data with `escapeHtml()` when interpolating into HTML templates. `data.lang`, `data.vaultPath`, lemma names, topic names — all attacker-influenced.

## Running things

```sh
cd /Users/sdawka/Code/learn/app/learn-pi

npm run typecheck                                      # tsc --noEmit
npm test                                               # vitest run

npx tsx scripts/learning-report.ts ~/LearnVault        # terminal report
npx tsx scripts/dashboard.ts ~/LearnVault report.html  # HTML dashboard
npx tsx scripts/backfill-frontmatter.ts --vault ~/LearnVault --dry-run  # legacy migration
```

The fixture vault for live testing lives at `/tmp/learn-ui-vault` (built by hand during PR #4). It has 10 items, 10 turns across 3 sessions, mixed LE classes including one undeclared, and a probe turn. Reuse it or rebuild it from scratch — both are fine.

## What not to do

- Don't commit to `main` directly. Always branch + PR.
- Don't merge a PR without running the three-agent verification pass on non-trivial changes.
- Don't add features the user didn't ask for. Don't add backwards-compat shims for code paths nobody is using yet.
- Don't recompute cost from tokens. pi-ai owns the pricing table; we ingest `cost.total` verbatim.
- Don't store learnable state in `concepts.db`. That's for user beliefs only.
- Don't introduce Inter, Roboto, or any system-font default in HTML output.
- Don't add metrics that monotonically increase. Vanity metrics violate Principle 5.
- Don't use emojis in commits, files, or PR bodies. Per the user's global instructions.
- Don't merge a PR if CI is red. Per the user's global instructions: "NEVER merge a PR unless ALL CI checks are green."
- Don't skip the empirical-discovery phase before instrumenting an external system (PR #3 used a Phase 0 to verify pi-mono's `message_end` payload shape before writing the producer). When in doubt about an upstream contract, read the upstream source first.

## When something feels wrong

Stop and reread `docs/PRINCIPLES.md`. The five-principle list usually tells you which constraint you're about to violate.
