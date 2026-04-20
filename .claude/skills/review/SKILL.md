---
name: review
description: "Use when asked to review code, review a branch, or do a code review. Spawns Breaker (correctness) and API Analyst (compatibility/conventions) sub-agents while the orchestrator reviews architecture, tests, performance, and security."
argument-hint: "[branch-name]"
---
```text
/review                              # review current branch vs main
/review my-feature-branch            # review a specific branch vs main
```

Spawns dedicated Breaker (correctness) and API Analyst (compatibility/conventions) sub-agents in parallel while the orchestrator performs the Inspector pass (architecture, tests, performance, security). Depth is user-selected.

Optimize for high-confidence, concise findings. Silence is better than speculation.

## Input

Target: `$ARGUMENTS`

Parse `$ARGUMENTS`:

1. Review target (positional argument):
   - Non-empty text (e.g., `my-feature-branch`) -> diff that branch vs main
   - Empty -> diff current branch vs main

## Step 1: Confirm Mode

Before doing anything, ask the user:

> I can run a code review on your branch. Pick a depth (fastest to slowest):
>
> 1. Skip — skip the review
> 2. Quick — single-pass by orchestrator, all areas, no sub-agents
> 3. Standard — full swarm: Breaker + API Analyst sub-agents + Inspector
> 4. Deep — Standard + reads full changed files (not just diffs) for deeper analysis

Wait for the user's response. If they say skip, stop here.

<required>
Immediately after the user picks a mode, create one task per applicable step using TaskCreate — before doing any other work. Mark each task in_progress when you start it and completed when you finish.

Tasks to create by mode:

- Quick: Gather changes -> Read diffs -> Perform single-pass review -> De-duplicate and classify -> Report
- Standard: Gather changes -> Read diffs -> Detect API surface changes -> Extract sections for sub-agents -> Perform review (spawn Breaker + API Analyst, run Inspector) -> De-duplicate and classify -> Report
- Deep: Gather changes -> Read diffs and full files -> Detect API surface changes -> Extract sections for sub-agents -> Perform review (spawn Breaker + API Analyst, run Inspector) -> De-duplicate and classify -> Report
</required>

## Step 2: Setup & Gather Changes

```bash
git fetch origin main && git log origin/main..HEAD --oneline && git diff --stat origin/main...HEAD
```

If a branch name was provided as argument, replace `HEAD` with `origin/<branch-name>` and add it to the fetch:

```bash
git fetch origin main <branch-name> && git log origin/main..origin/<branch-name> --oneline && git diff --stat origin/main...origin/<branch-name>
```

If on `main` and no branch name was provided, ask the user which branch to review.

Store the commit log, file list from `--stat`, and total `$LINES_CHANGED`.

Empty diff gate: Zero changed files -> report "No changes to review" and stop.

Size gate: >10,000 lines changed -> ask user to narrow scope before proceeding.

## Step 3: Read Diffs and Source Files

Exclude non-reviewable files from the file list: type declarations (`.d.ts`), lockfiles (`pnpm-lock.yaml`, `package-lock.json`), images, fonts, binaries, `.map` files, and generated API report files (`*.api.md`).

Read per-file diffs in batches (~50 files or ~500 changed lines per batch, whichever is smaller):

```bash
git diff origin/main...HEAD -- <file1> <file2> ...
```

For named branches, use `origin/main...origin/<branch>`.

### Standard mode: selective full-file reads

After reading diffs, identify files where fuller context is needed — typically where the change touches a function that references shared state, calls other functions in the same file, or has fragmented hunks. Read those files in one batch using the Read tool.

### Deep mode: full-file reads for all changed files

Read every changed file in full (the version on the review branch). Use `git show HEAD:<file>` or `git show origin/<branch>:<file>` as appropriate.

### Shared plumbing trap

If a change threads a new prop, callback, flag, or data field through a shared component or helper, read every changed call site and adjacent wrapper that accepts or forwards it.

Compute `$LINES_REVIEWED`: Count total unique lines reviewed — diff lines for diff-only files, full line counts for fully-read files. This is always >= `$LINES_CHANGED`.

No code gate: If no executable logic files remain after exclusions (only docs/config changed), skip Breaker. API Analyst does a reduced pass. Inspector only.

## Step 4: Detect API Surface Changes

Check whether any API report files changed (names only, not content — these are excluded from diff reading in Step 3):

```bash
git diff --name-only origin/main...HEAD | grep -E '\.api\.md$' || true
```

If any matched, flag those packages for the API Analyst (triggers extra scrutiny on release tags, breaking changes, and conventions).

## Step 5: Extract Sections for Sub-agents (Standard and Deep only)

Skip this step in Quick mode.

For files read in full that are >200 lines, extract only: modified functions (complete bodies), their callers (same file), and shared state. Format:

```
### file.ts (extracted — N lines from M total)
// Fields
#cache: Map<string, Promise<Foo>> = new Map();
// Modified: someMethod() — line 816
async someMethod(arg) { ... }
// Caller: #helperMethod — line 1118
async #helperMethod(arg) { ... }
```

Files <=200 lines: embed in full. Store as `$EXTRACTED_SECTIONS`.

## Step 6: Perform Review

### Review Areas

All reviews cover these areas. The mode determines whether sub-agents handle some of them.

- Correctness — Logic bugs, null/undefined dangers, race conditions, error handling, edge cases, distributed systems concerns (op ordering, eventual consistency, merge conflicts), DDS lifecycle (attach/detach, summarization), SharedTree patterns (schema validation, tree transactions)
- API Quality — Breaking changes, release tag correctness, naming conventions, type design, ergonomics, cross-package impact, deprecation patterns (informed by `api-conventions.md`)
- Architecture — Readability, structure, API surface, stale references
- Tests — Coverage, edge cases, assertion quality, test-code consistency
- Performance — Algorithmic complexity, memory leaks, telemetry correctness (are events firing with the right data?)
- Security — Injection, input validation, PII leaks, token handling

### High-confidence gate

Before a finding can appear in the report, verify ALL of these:

1. The affected code path (changed or directly impacted adjacent path) is identified.
2. The failure mechanism or violated invariant is concrete, not hypothetical.
3. The claimed impact is proportional to the evidence.
4. The suggested fix addresses the exact issue.

If a claim depends on generic hardening advice, guessed nullability, speculative behavior, or an unverified assumption about a dependency, read more context or drop it.

Output format for all findings: `[SEVERITY] file:line — description — suggested fix` (CRITICAL, HIGH, MEDIUM).

---

### Quick mode

The orchestrator covers all areas in a single pass, then proceeds to Step 7.

### Standard and Deep mode

Two parallel tracks:

| Area | Owner |
|------|:-----:|
| Correctness | The Breaker (sub-agent) |
| API Quality | The API Analyst (sub-agent) |
| Architecture, Tests, Performance, Security | The Inspector (orchestrator) |

#### The Breaker — owns Correctness

> Think like a chaos monkey working on a distributed systems framework. Your sole focus is finding ways this code produces wrong results, crashes, or behaves unexpectedly.
>
> You are NOT here to praise good code. You are here to BREAK things.
>
> Your mindset:
> - "What if two clients send conflicting ops simultaneously?"
> - "What if the network dies mid-operation?"
> - "What if I attach, detach, then reattach?"
> - "What happens at the edges — empty collections, maximum sizes, zero-length ops?"
> - "What if the dependency changes or a guard was removed but its siblings weren't?"
> - "What if summarization runs while ops are in flight?"
> - "What if I call this before the container is connected?"

#### The API Analyst — owns API Quality

> Think like a developer advocate who deeply understands TypeScript API design. Your sole focus is ensuring this code presents a clean, consistent, user-friendly API surface that follows Fluid Framework conventions.
>
> You are NOT here to praise good code. You are here to find API design problems.
>
> Your mindset:
> - "Would a new user understand this API from IntelliSense alone?"
> - "Does this naming follow our conventions?"
> - "Is this a breaking change? Is the release tag correct?"
> - "Are generics earning their keep or just adding noise?"
> - "Does this type design play well with others — plain data, JSON-compatible?"
> - "Will this deprecation path actually work for consumers?"
> - "Is there unnecessary complexity that could be a simpler overload?"

The API Analyst receives the contents of `api-conventions.md` (in this skill's directory) as part of its prompt.

Read `api-conventions.md`:
```bash
cat .claude/skills/review/api-conventions.md
```

#### The Inspector (orchestrator)

While sub-agents run, perform the Architecture, Tests, Performance, and Security pass yourself using full diff context and cross-file reasoning.

---

### Spawning Sub-agents

Spawn all sub-agents in a single parallel batch using the Agent tool.

Each sub-agent prompt includes — literally pasted into the prompt text:

1. Persona description (from above)
2. Changed file list
3. Full diff from Step 3 — paste the entire diff output
4. Extracted sections from Step 5 — paste the full extracted code
5. API conventions (API Analyst only) — paste the contents of `api-conventions.md`
6. Output format: `[SEVERITY] file:line — description — suggested fix`
7. Review mode instruction:
   - If reviewing the current branch: `"This is a LOCAL review — the workspace checkout matches the code under review. You may read workspace files for additional context (callers, type definitions, adjacent logic) when the embedded material is insufficient."`
   - If reviewing a named branch: `"This is a REMOTE review — the workspace checkout may be on a different branch. Do NOT read workspace files. ALL code you need is embedded above. Base your analysis ONLY on the diff and extracted sections provided."`

Perform the Inspector pass yourself while sub-agents run. Wait for all to complete.

## Step 7: De-duplicate and Classify

Classify each finding and adjust severity:

| Area | Max Severity | Adjustment |
|------|:---:|:---:|
| Correctness | CRITICAL | Promote +1 level (MEDIUM->HIGH, HIGH->CRITICAL) |
| API Quality | CRITICAL | Promote +1 level (MEDIUM->HIGH, HIGH->CRITICAL) |
| Performance | HIGH | Cap |
| Architecture | HIGH | Cap |
| Tests | HIGH | Cap |
| Security | MEDIUM | Cap |

Multi-area findings: classify in whichever area gives higher severity. Drop uncertain findings. If a concern depends on guesswork, hypothetical misuse, or hardening beyond an already-enforcing layer, omit it.

## Step 8: Report

Deduplicate on file:line, sort by severity. Drop "looks correct" findings.

Output routing:
- 5 or fewer findings: Print the full report to the terminal.
- More than 5 findings: Write the full report to `/tmp/review-report.md` and print a summary to the terminal: verdict line, finding counts by area, and the file path.

Always print: `Review report written to /tmp/review-report.md` when writing to file.

If zero findings remain after the evidence gate, use the exact summary line:
`0 CRITICAL, 0 HIGH, 0 MEDIUM — No high-confidence issues found in the current diff.`

### Report Template

````markdown
# Code Review Report

**Target**: Branch: <branch-name>
**Mode**: quick | standard | deep
**Lines reviewed**: $LINES_REVIEWED ($LINES_CHANGED changed)

## Verdict: Approve | Approve with suggestions | Request changes

N CRITICAL, N HIGH, N MEDIUM — one-line summary of the overall assessment.

### Findings

| Sev | # | Area | File | What | Fix |
|---|---|---|---|---|---|
| :red_circle: | C1 | Correctness | file.ts:42 | Description of violation and impact | Concrete fix suggestion |
| :orange_circle: | H1 | API Quality | file.ts:80 | Description | Fix |
| :yellow_circle: | M1 | Tests | file.test.ts:12 | Description | Fix |

**By area:** Correctness: 1:red_circle:  API Quality: 1:orange_circle:  Tests: 1:yellow_circle:

### Changes Overview

Table of each changed file -> what changed and why.

### Suggestions

Optional, non-blocking improvements. Each must propose a **concrete action** — never just describe what's already there. Omit this section if there are none.

---
Generated with review (mode)
````

### Verdict rules

After severity caps and promotions:

- Approve: 0 CRITICAL, 0 HIGH
- Approve with suggestions: 0 CRITICAL, 0 HIGH in Correctness/API Quality, some HIGH/MEDIUM elsewhere
- Request changes: 1+ CRITICAL, or 1+ HIGH in Correctness/API Quality, or 3+ HIGH across other areas

## Step 9: Offer Next Steps

```text
What next?
1. Explain a specific finding
2. Fix all critical/high issues
3. Re-review after changes
```

## Edge Cases

- Empty diff: Report "No changes to review" and stop.
- >10,000 lines changed: Ask user to narrow scope.
- On main with no branch argument: Ask which branch to review.
- No executable code after exclusions: Skip Breaker. API Analyst reduced pass. Inspector only.
- Sub-agent timeout: Note "Review incomplete" for that area.
