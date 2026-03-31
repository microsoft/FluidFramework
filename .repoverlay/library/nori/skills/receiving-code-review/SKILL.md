---
name: Code-Review-Reception
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
---

# Code Review Reception

## Overview

Code review requires technical evaluation, not emotional performance.

**Core principle:** Fetch feedback → Verify → Implement → Re-test → Push updates.

**Announce at start:** "I'm using the Nori Receiving Code Review skill to handle this feedback."

## The Process

### Step 0: Create Todo List

**For multi-item feedback, use TodoWrite:**

```
- [ ] Fetch and read all PR comments
- [ ] Clarify unclear items (if any)
- [ ] Fix item 1: [description]
- [ ] Fix item 2: [description]
...
- [ ] Run tests/lint/format
- [ ] Push updates
```

**Why:** Prevents skipping items and provides visibility to user.

### Step 1: Fetch PR Comments

**Determine PR number from context:**

- User mentions PR number: Use that
- Current branch: Run `gh pr view --json number -q .number`

**Fetch all comments:**

```bash
# View all comments (review + general)
gh pr view [PR-NUMBER] --comments
```

**Read completely before reacting.**

### Step 2: Understand and Clarify

**Apply these checks to each item:**

- [ ] Can I restate this requirement in my own words?
- [ ] Is this technically sound for THIS codebase?
- [ ] Does this break existing functionality?
- [ ] Is there a reason for the current implementation?

**CRITICAL:** If ANY item is unclear, STOP. Ask for clarification on ALL unclear items before implementing ANYTHING.

**Example:**

```
User: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.

✅ "Understand 1,2,3,6. Need clarification on 4 and 5 before implementing."
❌ Implement 1,2,3,6 now, ask about 4,5 later
```

### Step 3: Implement Changes

**Follow implementation order:**

1. Blocking issues (breaks, security)
2. Simple fixes (typos, imports)
3. Complex fixes (refactoring, logic)

**For each fix:**

- [ ] Implement one at a time
- [ ] Test individually
- [ ] Commit individually (frequent commits)

**YAGNI check:** If reviewer suggests "implementing properly", grep for actual usage:

```bash
grep -r "endpointName" .
```

If unused: "This endpoint isn't called. Remove it (YAGNI)?"

### Step 4: Run Tests, Lint, and Format

**Reference finishing-a-development-branch skill (Steps 1-2):**

See `{{skills_dir}}/finishing-a-development-branch/SKILL.md`

- [ ] Run tests: `npm test` (or project equivalent)
  - If tests fail, fix before proceeding
- [ ] Run type checks: `npm run lint:*-types` (if available)
  - If type errors, fix before proceeding
- [ ] Run formatter: `npm run format`
- [ ] Run linter: `npm run lint`
- [ ] Verify changes: `git diff --stat`

### Step 5: Push Updates

**Push changes to PR:**

```bash
git push
```

### Step 6: Summary and Next Action

**Report what changed:**

"Code review feedback addressed:

- Fixed [item 1]: [brief description]
- Fixed [item 2]: [brief description]
  ...

Changes pushed to PR. Options:

1. **Done** - PR is ready for re-review
2. **More feedback** - Additional changes needed
3. **Show changes** - Review diffs before marking done

Which would you like?"

## Quick Reference Checklist

- [ ] Create TodoWrite for all feedback items
- [ ] Fetch PR comments (`gh pr view --comments`)
- [ ] Clarify ALL unclear items before implementing ANY
- [ ] Implement in order: blocking → simple → complex
- [ ] Test each fix individually
- [ ] Run tests, type checks, formatting, linting (finishing-a-development-branch)
- [ ] Push updates
- [ ] Summarize changes and ask for next action

## Response Tone Guidelines

**Forbidden:**

- "You're absolutely right!" / "Great point!" / "Thanks for..." (performative agreement)
- Implementing before verifying against codebase
- Proceeding with unclear feedback

**Required:**

- Verify suggestions against codebase reality before implementing
- Push back with technical reasoning if suggestion breaks things or violates YAGNI
- Ask for clarification on ALL unclear items before implementing ANY items
- State fixes factually: "Fixed. [what changed]" or just show the code

**YAGNI check:** If reviewer suggests "implementing properly", grep for actual usage. If unused, ask: "This endpoint isn't called. Remove it (YAGNI)?"

**When wrong after pushing back:** "You were right - checked [X] and it does [Y]. Implementing now." No apology needed.

**External reviewers:** Check if technically correct for THIS codebase, works on all platforms, doesn't conflict with partner's prior decisions. If conflicts, discuss with partner first.

**Signal discomfort pushing back:** "Strange things are afoot at the Circle K"

## Common Mistakes

| Mistake                      | Fix                                 |
| ---------------------------- | ----------------------------------- |
| Performative agreement       | State requirement or just act       |
| Blind implementation         | Verify against codebase first       |
| Batch without testing        | One at a time, test each            |
| Assuming reviewer is right   | Check if breaks things              |
| Avoiding pushback            | Technical correctness > comfort     |
| Partial implementation       | Clarify all items first             |
| Can't verify, proceed anyway | State limitation, ask for direction |

## Red Flags

**Never:**

- Skip creating TodoWrite for multi-item feedback
- Implement without verifying against codebase
- Proceed with unclear feedback
- Skip tests/linting/formatting before pushing

**Always:**

- Read all feedback completely first
- Clarify unclear items before implementing
- Test each fix individually
- Run full verification before pushing
- Provide summary of changes to user
