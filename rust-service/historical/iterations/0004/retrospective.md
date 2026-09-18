# Iteration 0004 Retrospective

## What We Expected

We expected six workstreams in three dependency waves to assemble the first runnable service, prove native/browser WebTransport parity, model explicit client recovery, establish reproducible measurements, and test encryption and bounded stateful compression without changing the kernel. Isolated worktrees, path ownership, exact disposable copies, and central root-manifest ownership were expected to keep parallel work integrable.

## What We Observed

All six workstreams integrated. Service, native and browser transport, lifecycle, encryption, and bounded dictionary compression passed their scoped checks. The adaptive predecessor-compression design was rejected because arbitrary resume after retention would require unavailable history. Benchmark throughput and persisted sizes were useful; short startup/read/reconnect measurements were too noisy for rankings. Canonical service reads and live `RecoveryRequired` resolution emerged as protocol gaps above a stable kernel.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Delegated commands repeatedly executed or summarized the wrong sibling worktree. Identity-marked absolute paths, isolated targets, and exact disposable copies recovered reliable evidence; this motivated the new status-report skill.
- Service integration exposed a decoder return mismatch and strict-Clippy handler-size failure missed by isolated validation. Commit `fcdb949094a` repaired both before the full gate.
- Browser behavior passed before its harness exited cleanly because profile deletion raced Chromium shutdown. The harness awaited process exit and the fresh rerun passed.
- The benchmark initially assumed one historical record per accepted submission. A 200-submission service returned 201 canonical records because session records are also durable; partial result sets were rejected and schema v2 reports the public surface honestly.
- Stateful compression rejected adaptive predecessor history before implementation and retained independent immutable-dictionary frames.
- The first integrated status-skill validation wrapper assumed `python`; validation was rerun with Node, and compact-output assertions were corrected to use the documented 12-character `shortHead` field.

Supporting evidence is in [Phase 2 integration](phase-2/integration.md) and the six reports under [phase-2](phase-2/).

## Agentic Development Findings

Path decomposition produced conflict-free implementation cherry-picks, while dependency waves correctly delayed WebTransport, lifecycle integration, and the benchmark matrix. Shared terminal state remained a recurring source of misleading delegated evidence; absolute checkout identity must be part of every accepted result. The user clarified the full native/browser transport target, approved adding encryption and stateful compression, selected iteration `0005` scope, corrected the assumption that all four next deliverables could run independently, approved the Node-injected/browser-authoritative WASM test split, and supplied the status-report skill for Phase 3 inclusion.

## Practices to Keep, Change, or Stop

- **Keep:** disjoint worktrees, coherent workstream commits, central lockfile ownership, direct shared conformance, and dependency waves. The coordinator owns enforcement.
- **Keep:** explicit client ambiguity and caller-owned retry; do not convert transport loss into hidden resubmission.
- **Change:** use the status-report collector for observation before ad hoc multi-worktree commands. Status checks remain read-only.
- **Change:** every delegated validation result must identify absolute checkout, branch, HEAD, and restricted-file state; reject summaries that omit them.
- **Change:** distinguish parallel deliverables from dependency-independent execution. Instructions must identify what may begin concurrently and what waits for an integrated prerequisite.
- **Stop:** treating canonical sequencer records as projected Fluid operations or short noisy timing cells as stable rankings.

## Durable Lessons

[LEARNINGS.md](../../../LEARNINGS.md) now records that public service history must not leak private canonical decoding into clients, live ambiguity must remain explicit until authoritatively resolved, browser transport requires browser evidence even when portable client logic runs in Node, and dependency-wave language must distinguish concurrent groundwork from independent completion. These findings apply to future drivers and multi-agent iterations.

## Open Questions

- What projected-operation cursor and page contract handles administrative-only canonical spans without gaps or loops?
- What authenticated request identity safely authorizes repeated live ambiguity resolution?
- What atomic manifest and reference model is sufficient for summaries before retention/GC exists?
- Which WASM/TypeScript boundary minimizes copies while remaining mockable in Node and faithful in Chromium?
- Which subset of the Fluid driver interfaces is sufficient for the first real application trace?
- Can service concurrency be added without weakening the fence held through validation and append?
