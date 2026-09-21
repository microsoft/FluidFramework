# Iteration 0002 Retrospective

## What We Expected

We expected four independent workstreams to deepen model/fault coverage, durable snapshots, bounded transport, and valid-only Fluid sequencing from one kickoff. Shared APIs were expected to remain stable, while durable and network branches would consume the concurrently developed conformance additions during integration. Parallel worktrees, immutable shared lockfiles, and checkout-marked validation were expected to keep ownership and evidence reliable.

## What We Observed

All four workstreams completed concurrently, stayed within disjoint implementation paths, and integrated without cherry-pick conflicts. Their primary hypotheses held within stated models, and no shared API changed. Integration directly applied the new model to durable and network implementations; it found and corrected one durable error-classification defect. Negative boundaries remain material: injected failures are not process or power crashes, local typed transport is not process isolation, and process-local fencing is not deployment fencing.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- All four workstreams repeatedly received delegated output from sibling worktrees. Reports rejected that evidence and reran with absolute checkout markers and isolated targets. This consumed validation time but prevented false attribution; see each [Phase 2 report](phase-2/integration.md#accepted-work).
- The authoritative branch temporarily changed the lockfile by adding already-resolved workspace dependencies. It removed those dependencies and redesigned against existing direct dependencies; its final branch left the lockfile unchanged. The lesson is that a crate dependency-list change rewrites its lock entry even when package versions already exist.
- Integrated durable conformance initially failed because regression returned `Rejected` instead of `Conflict`. A local classification correction made the focused and full gates pass; see [integration adaptation](phase-2/integration.md#conflict-resolution-and-adaptation).
- Host reboot recovery and concurrent dispatch were handled from committed kickoff instructions and clean worktrees; no implementation was lost.

## Agentic Development Findings

The decomposition was effective: no implementation paths overlapped and all workstreams could run concurrently. Generated instructions still carried the prior approved source rather than actual kickoff provenance, but reports correctly recorded observed branches and commits. Checkout identity requirements caught every misrouted command, though terminal multiplexing remained costly. The user supplied one semantic clarification before iteration `0002`: stale or invalid Fluid operations reject before storage, reconnect uses a new session, and pending operations regenerate. Phase 3 required only scope selection, not implementation correction.

## Practices to Keep, Change, or Stop

- **Keep:** concurrent dispatch from one kickoff with disjoint writable paths; coordinator owns integration ordering.
- **Keep:** absolute checkout/branch markers, isolated Cargo targets, and immediate lockfile checks; every agent owns evidence rejection when markers disagree.
- **Change:** integration must directly invoke newly added conformance helpers against concurrently developed applicable implementations, not infer coverage from a workspace pass; coordinator owns this check. Defer skill automation until iteration `0003` shows a stable pattern.
- **Stop:** treating an already-resolved workspace dependency as lockfile-neutral; workstream agents must inspect package-entry changes in disposable copies.

## Durable Lessons

[LEARNINGS.md](../../LEARNINGS.md) now records that specialized fault suites do not replace shared semantic conformance, deterministic fault injection must not be presented as process/power-loss evidence, and valid-only service sequencing avoids conditional append only when fencing remains exclusive through append. These apply beyond the specific implementations in this iteration.

## Open Questions

- Can a deployment-backed authority enforce fence validation through append without a kernel atomic fenced-append primitive?
- Does abrupt process termination preserve every acknowledged append and snapshot lineage outcome currently supported by injected failures?
- Can a process-isolated client use opaque token positions with the synchronous `PositionCodec`, or is an asynchronous boundary irreducibly required?
- Which filesystem and deployment guarantees are prerequisites before durable or fencing claims can become production contracts?
