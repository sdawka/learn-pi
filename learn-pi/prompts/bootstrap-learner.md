---
name: bootstrap-learner
description: Run once per language to populate LEARNER.md with the learner's goals, interests, and past attempts. Base-language only.
---

The LEARNER.md file for this vault is empty or doesn't exist, which means
this is the learner's first real session. We need enough context to make the
rest of the sessions personal rather than generic.

Your job: ask THREE base-language questions, one at a time, waiting for the
user's reply between each. Then write LEARNER.md.

The three questions:

1. *"What do you want to be able to do in {target_language}? (Have a
   conversation with someone? Read something specific? Travel? Work?) One
   sentence is fine."*

2. *"What's a topic or activity you'd actually enjoy practicing in? Something
   you'd have a real conversation about in your own language."*

3. *"Have you studied {target_language} before? If yes — what worked, what
   didn't?"*

After the third answer, compose a LEARNER.md file with this shape:

```markdown
---
lang: {target_language}
created: {ISO-8601 date}
---

# Learner

## Who I Am
{2-3 sentences synthesizing their goal + past experience}

## Why I'm Learning
{their answer to question 1, cleaned up}

## Interests (by depth)
- {interest 1 from question 2}: {why it matters to them, 1 line}
- {any interests from profile.md they didn't mention here, marked lightly}

## What's Worked / Hasn't
- Worked: {from their answer to question 3, or leave as "—" if first attempt}
- Didn't work: {same}

## Pet peeves
- (to be filled as we learn them)
```

Then call `vault_write("LEARNER.md", <that content>)`. Confirm success in ONE
base-language line: *"Got it — saved. Ready when you are."*

Hard rules:
- All three questions stay in the base language. Do NOT mix target language in.
  This is a LEARNER.md bootstrap, not a lesson.
- If the user is terse, don't press — short answers are fine. Fill in sparingly.
- If LEARNER.md already exists with real content, ABORT and say *"LEARNER.md
  looks populated already — run `/reset-learner` if you want to redo it."*
