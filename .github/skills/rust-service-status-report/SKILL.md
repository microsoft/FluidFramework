---
name: rust-service-status-report
description: 'Report progress for Rust service iterations and concurrent workstreams without disturbing agents. Use when asked to report status, check progress, inspect iteration worktrees, determine whether an agent is making progress, or summarize integration state for rust-service iterations.'
argument-hint: '[iteration, for example 0004]'
---

# Rust Service Status Report

Produce an evidence-based status report for one Rust service iteration while leaving every worktree and process untouched.

## Safety Rules

- This workflow is read-only. Do not edit, stage, commit, build, test, checkout, reset, rebase, clean, remove worktrees, send signals, or answer an interactive process.
- Never change another agent's current directory or terminal state.
- Treat generated files, terminal history, and old `/tmp` output as supporting evidence only. Current Git state and committed reports are authoritative.
- Do not infer active work from an open shell. Classify a shell with no child command as idle.
- Do not infer that a workstream is stalled merely because no process is running. A recent commit or completed validation may mean the agent is between steps.
- Never claim validation passed merely because tests exist. Require a report entry or retained command output with a clear successful result.

## Collect the Snapshot

From the primary repository checkout, run:

```bash
node .github/skills/rust-service-status-report/scripts/collect-status.mjs --summary NNNN
```

The script discovers worktrees from `git worktree list`, reads the iteration manifest and reports, inspects Git state, and scans `/proc` without modifying anything. `--summary` omits long commit histories and bounds report excerpts so the result remains directly readable by tool output. If no iteration is supplied, it selects the highest numbered iteration available in the integration checkout or primary repository.

Iteration manifests and reports live under `rust-service/historical/iterations/NNNN/`, including records for active iterations.
For worktrees that predate the archive move, the collector can still read the old `rust-service/iterations/NNNN/` location without modifying those worktrees.

After worktree cleanup, the collector can read retained reports from the primary checkout.
Unavailable workstream Git state does not by itself mean incomplete work.
If the integration worktree is gone, the fallback Git snapshot describes the primary checkout's current state, not the historical integration state.

Use `--integration-root <absolute-path>` only when the integration worktree cannot be discovered automatically:

```bash
node .github/skills/rust-service-status-report/scripts/collect-status.mjs --summary NNNN \
  --integration-root /workspaces/FluidFramework-rust-service-iteration-NNNN
```

Do not delegate the initial collection when this script is available. Delegated summaries that omit command output, checkout identity, or exact paths are not sufficient evidence.

Use the default full output only when compact evidence is insufficient:

```bash
node .github/skills/rust-service-status-report/scripts/collect-status.mjs NNNN
```

If full output exceeds the tool limit, do not parse the rendered overflow artifact as JSON because terminal wrapping may corrupt long string values. Return to `--summary`, then read a specific report or run one narrow Git command to resolve the missing detail.

## Resolve Ambiguity

After collecting, read only the reports needed to clarify changed or active workstreams. Prefer these sections:

- `Outcome`
- `Validation Evidence`
- `Remaining Work and Risks`
- `Deliverables and Commits`

Use narrow read-only Git commands when needed:

```bash
git -C <absolute-worktree> status --short
git -C <absolute-worktree> log -5 --date=iso-strict --format='%H|%ad|%s'
git -C <absolute-worktree> diff --stat
git -C <absolute-worktree> diff --cached --stat
```

For progress questions, compare concrete evidence: new commits, changed paths, report updates, validation artifacts, and timestamps. File modification times may establish chronology but do not prove correctness.

## Classify Status

Use conservative labels:

- **Complete**: report says `complete`, has no required TODO markers, and deliverables are committed; any remaining worktree is clean.
- **Implementation committed; report pending**: implementation is committed, but report completion or evidence remains.
- **In progress**: substantive uncommitted changes or an incomplete report exist.
- **Waiting**: report or charter explicitly names an unmet prerequisite and no substantive implementation has begun.
- **Blocked**: report records a concrete unresolved blocker or repeated failed validation.
- **Wave N integrated**: the integration report accepts the work and the accepted integration or primary-branch history contains the corresponding commits. A completed workstream branch alone is not integrated.
- **Integrated; worktree removed**: retained reports record acceptance and cleanup, and accepted history contains the deliverables. Verify recorded commits from the primary checkout; for cherry-picked or adapted work, use the recorded source-to-integrated mapping. Neither the original branch nor its worktree needs to remain.

Distinguish code presence, uncommitted implementation, committed implementation, completed report, and integration. Do not collapse these into one status.
If a worktree is absent without sufficient acceptance or cleanup evidence, report that evidence as unknown rather than assuming successful integration or lost work.

For target-specific transport work, report native server, native client, and browser-WASM status separately in the summary when they differ.

## Report Format

Always use this table shape:

```markdown
**Iteration 0004**

| Workstream | Status | Summary | Report |
|---|---|---|---|
| ... | ... | ... | /absolute/path/to/report.md |
```

Requirements:

- Start with `**Iteration NNNN**`, using the exact iteration returned by the collector.
- Include every active workstream from `manifest.json`, in manifest order.
- Add one final `Integration` row.
- Keep each summary concise and evidence-based: commit state, meaningful validation counts/results, and the next dependency or remaining gate.
- Put the exact absolute report path directly in the `Report` column. Do not turn sibling-worktree paths into Markdown links.
- If a report is absent, put the exact absolute worktree path in the `Report` column.
- After the table, mention active implementation/test processes only when observed. Distinguish them from idle shells.
- Mention manifest state and the principal remaining integration gate.
- Report unknown evidence as unknown; never reconstruct unsupported details.

## Interpreting Progress

When asked whether a workstream is progressing slowly or is stalled:

1. Identify prerequisite wait time from the charter, report, and prerequisite commits.
2. Identify the first substantive change and latest commit/report timestamps.
3. Quantify implementation scope with commit or diff statistics.
4. Separate implementation time from validation and report-writing time.
5. State the current remaining gate and whether a relevant process is active.
6. Avoid judging elapsed wall time without accounting for dependency waits and multi-target validation.

A browser-WASM WebTransport workstream commonly requires separate native Cargo validation, WASM compilation and binding generation, certificate setup, and a real headless-browser trace. Report those as distinct gates.

## Relationship to Coordination

Use this skill for observation and reporting.
Load `rust-service-coordination` for implementation or integration only when the user explicitly requests a "parallel iteration", or continues one already explicitly authorized.
Ordinary implementation, checkpoint work, and status questions do not trigger coordination or a workflow-selection prompt.
