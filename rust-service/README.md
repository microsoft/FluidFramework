# Sea

Sea, short for Snapshotted Event Archive, is an experimental Rust service for systems built from:

- opaque, totally ordered application events;
- immutable blob trees and snapshots at known event positions; and
- recovery by loading a snapshot and replaying later data.

The application-independent `sea-core` contracts separate trusted archive storage from archive-bound user sessions.
Memory, buffered-file, and crash-durable file backends implement the storage contract.
`sea-sequencer` adds multi-user sessions and stable operation identities, while `sea-webtransport` carries the same session behavior over the versioned Sea protocol.
The minimal Fluid driver remains a downstream adapter.

This is a speculative learning project, not a proposed production replacement for an existing Fluid service.

## Approach

The current architecture is:

```text
Fluid and other application adapters
                 |
sea-webtransport: shared native/browser client and versioned framing
                 |
compression, encryption, or stateful-compression session decorators
                 |
sea-sequencer: authors, stable operations, snapshot participation, and streams
                 |
SeaStorage: memory, buffered-file, or durable-file
```

`EventPosition` is a stable ordered `u64` value inside one archive and has a canonical eight-byte encoding.
Snapshots may represent initial state or state through one event.
A load atomically selects a compatible snapshot and catch-up head, emits every later event through that head, emits a caught-up marker, and then continues live without a gap.
Uploaded content, events, and snapshots are retained in the initial implementation.

Snapshot streams declare immutable `ReadOnly`, `SeaSelected`, or `ClientSelected` participation.
Sea-selected publishers receive one deterministic fencing token only when no client-selected publisher is active.
Client-selected publishers retain application-managed election and scheduling; the regular Fluid `SeaDriver` uses this mode, while direct SharedTree integration uses Sea selection.
Nomination selects publication authority and never schedules snapshot generation.
See [Decision 0012](decisions/0012-fluid-snapshot-election-integration.md).

Development begins with an interactive foundation phase that creates the Rust workspace, core traits, initial tests, stub crates, and a project coordination skill while resolving design questions as they become concrete. Work that benefits from parallel implementation uses numbered iterations: each implementation agent works in an isolated branch and worktree, makes reviewable commits, and produces a structured report covering correctness, integration, architectural friction, complexity, and performance. Sequential fixes and experiments use a lighter current-branch workflow with focused validation and proportionate local evidence.

A third, interactive review phase integrates and synthesizes those reports before any shared abstractions or crate boundaries change. Approved adjustments, the numbered review report, updated coordination guidance, and new scoped instructions are committed separately before another parallel implementation iteration. The Phase 2/3 loop ends only when the reports, tests, documentation, and measurements justify making no further changes.

Because agentic development is itself part of the research, each approved iteration pre-registers hypotheses and retains structured reports, costly failures, human interventions, decisions, retrospectives, and skill changes. A validator makes those records part of the Phase 2 and Phase 3 completion gates. When an iteration could provide material value but the user did not request one, the coordinator explains the lightweight and iteration options and asks the user before choosing or initializing either workflow.

## Project Status

Phase 1 and iterations `0001` through `0012` are complete. Iterations `0001`
through `0006` established the kernel, storage implementations, wrappers,
service protocol, native and browser transports, Fluid driver, and real
SharedTree convergence. Their reports remain under [iterations/](iterations/).

Later iterations completed the end-to-end lifecycle and measurement work:

- [Iteration `0007`](iterations/0007/phase-3-report.md) proved Fluid read-to-write
    reconnect, ambiguity recovery, cold replay, and bounded native WebTransport
    shutdown.
- [Iteration `0008`](iterations/0008/phase-3-report.md) added atomic projected
    catch-up and live streaming with bounded buffering and explicit cancellation.
- [Iteration `0009`](iterations/0009/phase-3-report.md) measured equivalent
    full-driver single-writer SharedTree capacity across six service and storage
    configurations.
- [Iteration `0010`](iterations/0010/phase-3-report.md) replaced the growing-state
    workload with fixed-size numeric overwrites and documented the limits of
    notification-based operation accounting.
- [Iteration `0011`](iterations/0011/phase-3-report.md) audited every Rust workspace
    area and the minimal TypeScript driver, fixed six boundary and lifecycle defect
    classes, and expanded tests and operational documentation.
- [Iteration `0012`](iterations/0012/phase-3-report.md) documented hand-authored
    Rust and minimal-driver TypeScript declarations, added package and grouping
    READMEs, and introduced a lightweight documentation-structure check.

No next iteration is currently approved. Performance expansion, decoded-size
policy, awaitable Fluid teardown, retention, cross-host fencing, power-loss
qualification, production membership, authentication, and deployment work
remain explicit future triggers rather than incomplete iteration deliverables.

Each approved iteration uses a dedicated integration branch and one isolated branch/worktree per Phase 2 workstream. Workstream agents commit only their assigned scope and report; a coordinator integrates accepted commits and records Phase 3 decisions under a sequentially numbered `iterations/NNNN/` directory. Lightweight work does not create these artifacts. The next approved iteration starts from the applicable accepted repository state.

## Documents

- [PLAN.md](PLAN.md) defines the architecture, semantics, iterative work phases, reporting contract, review loop, and success criteria.
- [DEVELOPMENT.md](DEVELOPMENT.md) defines the pinned toolchain, lockfile policy, and required foundation commands.
- [WORKSTREAMS.md](WORKSTREAMS.md) records the current package graph and runtime composition.
- [BENCHMARKS.md](BENCHMARKS.md) defines initial workloads, measurement procedure, and required environment metadata.
- [BLOB_STORAGE.md](BLOB_STORAGE.md) proposes the unified content-addressed blob contract, retention model, filesystem implementation, and Fluid mapping.
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) tracks unresolved architecture and organization issues and their resolution status.
- [foundation-report.md](foundation-report.md) records Phase 1 hypotheses, decisions, costly issues, validation, and readiness.
- [LEARNINGS.md](LEARNINGS.md) indexes durable architecture and agentic-development findings with links to evidence.
- [decisions/](decisions/) contains append-only shared decision records.
- [iterations/](iterations/) contains iteration charters, workstream records, synthesis reports, retrospectives, and next-workstream instructions.
- [the coordination skill](../.github/skills/rust-service-coordination/SKILL.md) provides the executable workflow, templates, initializer, and artifact validator.
- [notes.md](notes.md) preserves the original brainstorming notes and implementation ideas.
- [notes2.md](notes2.md) records the project goals, target integrations, and stretch goals.

## Scope

The native server is a single-host experimental service with runtime-selected memory, buffered-file, or durable-file storage.
The durable backend demonstrates process-crash recovery, not power-loss or distributed durability.
Authentication, multi-tenant policy, garbage collection, cross-host fencing, replication, and production Fluid membership remain outside the current implementation and are tracked in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
