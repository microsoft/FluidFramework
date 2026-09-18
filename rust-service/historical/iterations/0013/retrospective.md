# Iteration 0013 Retrospective

## What We Expected

Fourteen dependency-independent workstreams, one per workspace crate, would make a broad low-risk pass over documentation, code, and tests. Exclusive crate ownership, a shared kickoff, and crate-scoped validation were expected to keep changes independently reviewable and integration conflict-free. Mature crates were allowed to report no worthwhile change.

## What We Observed

All workstreams completed and integrated without conflict. Five local defects were fixed, and every crate gained meaningful documentation or edge-case coverage. Shared APIs, dependencies, wire formats, persistence formats, and manifests remained unchanged. Full integration validation passed after two mechanical Biome repairs.

The main negative result was execution infrastructure interference: delegated commands repeatedly ran in or reported output from sibling worktrees, and several Cargo or pnpm invocations exited 130. Absolute manifest paths, direct Git inspection, dedicated recovery runs, and integration-level repository gates produced trustworthy final evidence.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Shared terminal routing affected most workstreams. Commands sometimes named a sibling branch after an earlier guard, or were interrupted during compilation. No source was lost, but validation commonly required two or three attempts. The individual reports retain exact events and rejected evidence.
- Worktree-local pnpm setup was disproportionate and repeatedly interrupted. Repository policy and `build:fast` were therefore centralized at integration, where one frozen install supported all consumer gates.
- The first integration artifact check searched beneath the invoking minimal-driver package. Reading `build-wasm.mjs` showed that declared outputs live under `crates/sea-webtransport/pkg` and `test-support/pkg`; exact files there were nonzero and direct Node consumption had already passed.
- The first explicit `build:fast` result found the generated iteration manifest and a source-base browser test out of Biome format. A two-file mechanical repair passed focused Biome validation and the full 1,878-task rerun.
- A cleanup summary incorrectly reported a clean tree while coordinator changes were pending. Direct `git -C` status and log checks preserved the changes and prevented an unsupported commit decision.
- Elapsed time and token use are unknown. The user supplied the plan and requested the iteration; no semantic intervention was needed.

## Agentic Development Findings

One crate per workstream was an effective decomposition: all changed paths were disjoint, 29 commits cherry-picked without conflict, and direct object review found no ownership violation. The common stopping rules prevented discovered durability, browser, and recovery questions from turning into unplanned redesign.

The generated instructions were sufficient, but execution isolation was unreliable at this concurrency level. Reports correctly rejected ambiguous output and preserved failures as process evidence. Centralized Node setup and repository gates were more efficient and authoritative than repeating them in Rust-only worktrees.

## Practices to Keep, Change, or Stop

- **Keep:** exclusive crate ownership, common kickoff, report-first provenance, direct Git-object acceptance, and integration-level canonical gates. Owner: coordination workflow.
- **Keep:** inventory every function and method, while allowing justified no-test dispositions for trivial or unreachable behavior. Owner: crate-cleanup instructions.
- **Change:** bind every delegated command itself to the absolute worktree with `git -C`, `--manifest-path`, or an equivalent command-local mechanism; a prior shell guard alone is insufficient. Owner: coordinator and workstream agents.
- **Change:** centralize repository pnpm policy/build gates in a provisioned integration checkout unless a workstream directly changes a registered Node package. Owner: iteration charter.
- **Stop:** accepting summaries that omit exact artifacts, Git objects, exit status, or checkout provenance. Owner: coordinator.

## Durable Lessons

Promoted one lesson: validate bounded or framed external inputs at their owning API boundary before arithmetic, allocation, decoding, or channel construction. Five independent crate findings show this prevents panics and ambiguous corruption handling without requiring shared-format changes.

No new worktree-process lesson was added because existing entries already require checkout identity, direct object inspection, artifact verification, and explicit cleanup.

## Open Questions

- Which deferred crash-point and fault-injection fixtures provide enough value to justify broader ownership?
- Should browser transport disconnect explicitly close the browser `WebTransport`, and what real-browser evidence should define success?
- Should shared cancellation and ambiguous-append recovery semantics be specified before deeper sequencer cleanup?
- Is direct 32-bit CI coverage warranted for binary framing and overflow-sensitive code?
