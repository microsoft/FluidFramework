# Sea Core Model Migration

## Status

- **Plan status:** Ready for implementation; no implementation checkpoint has started.
- **Execution mode:** One coordinating agent, sequential checkpoints on the current branch.
- **Scope:** Replacement of the old core model and alignment of its implementations and consumers within `rust-service/`.
- **Preparation completed:** `85e6cf96430` introduced `sea_core::next`, removed `SeaCollection`, and added default `SeaStorage::create_view` and `open_view` methods.
- **Completed checkpoint:** API-only preparation; the six implementation checkpoints below remain open.
- **Validation:** `node scripts/check-documentation.mjs` and repository-root `pnpm policy-check --path rust-service` passed on 2026-09-18. No code build or tests were run for this documentation-only change.
- **Known implementation state:** Existing consumers still use the old model; the replacement contracts have no backend implementations yet.
- **Open decisions:** Placement of session-level policies, mapping snapshot publication identities to the replacement model, and the final public module layout must be resolved at their owning checkpoints.
- **Next action:** Begin checkpoint 1 with a current consumer inventory and the memory backend; do not start several checkpoints concurrently.
- **Plan commit:** Record this plan's commit hash in the first implementation checkpoint update.

Update this status and the checkpoint evidence in every implementation commit.
Record the exact next action, completed checks, unresolved decisions, and any temporary breakage.
Do not mark a checkpoint complete based only on compilation or a delegated agent's summary.

## Purpose And Authority

Migrate the Rust service to the replacement core model, starting with the storage contracts in [sea-core's next module](crates/sea-core/src/next/mod.rs).
Align the remaining core types and higher-level APIs with that model rather than preserving obsolete abstractions through forwarding wrappers.
The result must make every retained in-repository usage practical and functional again.

The replacement contracts and explicit user decisions govern this migration.
Current implementations and tests are evidence of usages, not authority to silently restore superseded semantics.
The completed [Sea migration](SEA_MIGRATION_PLAN.md), [API cleanup](SEA_API_CLEANUP_PLAN.md), and numbered iteration records remain historical evidence; do not rewrite their completed decisions or checkpoints.
Update current architecture documentation as implementation decisions settle.

This is the last planned speculative API revision, not a prohibition on correcting a contract when an actual implementation or consumer demonstrates a problem.
Record the concrete incompatibility, the smallest proposed correction, and affected consumers before asking the user to approve a material shared-contract change.

## Settled Constraints

- No compatibility is required for Rust APIs, generated APIs, wire formats, or persisted representations.
- There is no existing persisted data to migrate, and all affected consumers are inside `rust-service/`.
- Do not add format negotiation, legacy readers, compatibility adapters, or duplicate public APIs merely to preserve old behavior.
- Temporary coexistence is allowed only to stage implementation; every transitional path must have an owner and a removal checkpoint.
- Preserve useful workflows, not their current internal structure or every old test assertion.
- Retain shared event, blob, error, durability, and monitored-stream primitives where their contracts already fit; do not duplicate them merely to place everything under `next`.
- Event and snapshot archives retain their full committed histories; recovery must expose the required self-consistent prefix or fail, subject to backend durability.
- Availability handles enforce cross-component publication dependencies. They are not serialized wire values or independent writer authority.
- Storage does not provide transparent ambiguous append retries or application-level deduplication. Cancellation is not proof of settlement.
- Snapshot publication requires an event handle; there is no initial empty-state snapshot publication in the replacement storage API.
- Snapshot lookup and loading share `LoadStart`. Loading returns a selected snapshot and a live stream, without an atomic captured event head.
- Exact lookup remains available; latest and bounded snapshot selection share `latest_at_or_before` with an optional inclusive bound.
- `SeaStorage` creates and exclusively opens document components and views. Active document caching, sequencer ownership, and session management belong above storage.
- Do not add an implementation, persisted record format, or server manager as part of this plan-only commit.
- The API-only testing deferral ends when checkpoint 1 starts. Add focused behavioral evidence while implementing, using [DEVELOPMENT.md](DEVELOPMENT.md).

## Agent Operating Rules

Use one coordinator to own shared contracts, checkpoint sequencing, and acceptance.
Fresh agents must read this plan's status, the target contracts, and the owning crate's development documentation, then inspect current Git status and HEAD before editing.
They must not require this conversation to understand the assignment.

Begin each checkpoint by recording its actual starting commit, the current responsible code path, a falsifiable local hypothesis, and the cheapest discriminating check.
Implement in small steps and run a focused executable check immediately after the first substantive edit.
Reuse existing test files and helpers; test shared backend laws in conformance coverage and implementation-specific behavior locally.

Prefer buildable, independently validated commits.
Do not expose half-migrated public contracts by deleting old definitions before their consumers have a working replacement.
When temporary breakage is unavoidable, record exact failing commands, affected consumers, and the next repair step; do not represent that boundary as complete or green.
Do not silently disable tests, remove workspace members, or weaken a useful workflow merely to obtain a successful build.

Each checkpoint handoff must identify changed responsibilities, commit IDs, exact checks and outcomes, retained transitional code, and the next action.
The next agent verifies those commits and evidence before continuing.
Honor the user's commit authorization for implementation work; this request authorizes only the plan commit and does not authorize pushing.

Do not initialize numbered iterations, new branches, worktrees, or parallel write agents under this plan.
After the memory-and-sequencer slice works, independent backend or consumer work may justify parallel execution.
Present the benefit and overhead and obtain user approval before switching to the repository's full iteration workflow.
Any approved delegates need explicit writable paths, a common accepted base, dependency ordering, validation requirements, and a coordinator-owned integration check.

## Usage Inventory

These are the initial acceptance surfaces, not a claim that every current path has already been audited.
At each checkpoint, verify actual call sites and documented commands and add any discovered usage to this table with its disposition.
Deletion of a useful workflow requires an explicit decision, not an assumption based on obsolete implementation details.

| Surface | Owning paths | Required migration outcome |
| --- | --- | --- |
| Core values and storage composition | `crates/sea-core` | One coherent set of final contracts; direct create/open, append, snapshot, and replay workflows. |
| Memory backend | `crates/sea-memory` | A reference implementation of document identity, exclusive opening, availability, ordered reads, and live delivery. |
| File backends and immutable content | `crates/sea-file`, `crates/sea-file-durable`, `crates/sea-content-addressed` | Equivalent new storage contracts with documented backend-specific durability, bounds, recovery, and lifetime behavior. |
| Shared behavioral laws | `crates/sea-conformance` | Reusable new-contract checks across backends and session implementations. |
| Sequencing and sessions | `crates/sea-sequencer` | Multi-user ordering, useful retry/reconciliation behavior, session lifecycle, and snapshot coordination above the new view. |
| Transforming wrappers | `crates/sea-compression`, `crates/sea-encryption`, `crates/sea-stateful-compression`, `crates/wrappers` | Existing supported compositions still work, with identities, references, progress, and errors transformed or preserved correctly. |
| Native server and transport | `crates/sea-webtransport-server`, `crates/sea-webtransport` | Document-scoped sessions, coherent client/server protocol, and correct shared runtime ownership and cleanup. |
| Generated Node and browser APIs | `crates/sea-webtransport`, `tests/wasm-client`, `tests/webtransport-browser` | Rebuilt artifacts, useful generated types, native/browser threading constraints, and real transport round trips. |
| Fluid and SharedTree usages | `tests/minimal-fluid-driver` | Working summary/tree/blob handling, collaboration, load/reload, and snapshot-participation workflows through the new client API. |
| Examples and measurements | `examples`, `crates/sea-benchmarks`, `benchmarks` | Existing useful examples and benchmark entry points run against the final model; historical measurements remain labeled as historical. |

## Type And Responsibility Map

| Current concept | Migration direction | Owner and decision checkpoint |
| --- | --- | --- |
| Old monolithic `SeaStorage` | Replace with document factory, independent components, and `SeaView`. | Core and backends, 1 and 3. |
| Finite `StorageLoad` and storage event streams | Replace storage usage with snapshot selection and monitored bounded/live reads; do not recreate atomic captured-head loads by default. | Core, memory, sequencer, 1 and 2. |
| `EventPosition`, blob identities/directories, classified errors, durability, monitored streams | Reuse where compatible; change only for demonstrated requirements. | Owning modules throughout. |
| Old snapshot values, `SnapshotPosition::Initial`, publication IDs and receipts | Use handle-based storage snapshots; explicitly decide how consumer publication identity, conditional coordination, and initial application state are represented above storage. | Core and sequencer, 2; bindings and driver, 4 and 5. |
| Event receipts and stable submission identities | Keep useful session acknowledgments and retry policy at the appropriate higher layer; storage append yields availability evidence rather than an application deduplication promise. | Sequencer, 2. |
| Session read/load, author, archive, and snapshot facets | Align with the replacement types while preserving useful consumer operations and documented lifecycle ownership. | Sequencer, 2; transport, 4. |
| Sequencer finite catch-up plus broadcast delivery | Evaluate direct use of the new live archive stream; retain additional machinery only for a demonstrated session responsibility. | Sequencer, 2. |
| `SeaCollection` | Already removed; view creation is on the factory. Add runtime management only where actual session ownership requires it. | Server, 4. |
| Protocol and persisted records | Define representations appropriate to the implementation; validate identities and resolve local handles at the receiving boundary. Never fabricate availability handles from unchecked wire IDs. | Backends, 3; transport, 4. |
| Temporary `next` namespace and old exports | Promote replacement types into final public modules and delete superseded types once retained consumers have migrated. | Core and all consumers, 5. |

This map does not pre-decide whether every old session-level feature survives unchanged.
For example, removing storage snapshot publication IDs does not by itself establish that the Fluid driver's publication/version workflow can disappear.
Resolve such questions against real usages and keep storage policy separate from session and application policy.

## Checkpoints

The checkboxes record accepted outcomes, not merely started work.
Multiple focused commits may implement one checkpoint; update status in each.
Package names below identify focused validation targets, not permission to omit their affected consumers.

### 1. Memory Storage And Direct Views

- **Prerequisite:** Read target contracts and verify the current inventory and starting commit.
- **Writable scope:** `sea-memory`, relevant `sea-core` composition, localized/shared conformance tests, and their documentation; manifests only as necessary.
- **Work:** Implement the component stores and document factory, including real handle provenance and opening lifetimes, without layering the new API over incompatible old guarantees.
- **Evidence:** Create/open unknown and existing documents; reject competing valid writers; append with and without blob dependencies; resolve handles; publish and select snapshots; bounded and live reads, empty ranges, lazy errors, cancellation, and reopening within the backend's documented guarantees.
- **Validation:** Focused `sea-memory`, `sea-core`, and relevant `sea-conformance` checks and tests, plus required policy/build checks below.
- **Exit:** A real memory-backed `SeaView` supports append, snapshot, load, and reopen, with localized regression evidence. Record any remaining old memory API and its checkpoint-3 removal.
- [ ] Complete.

### 2. Sequencer And Session Contracts

- **Prerequisite:** Checkpoint 1's memory-backed view works.
- **Writable scope:** `sea-sequencer`, session-related core contracts, conformance coverage, and the smallest local consumer fixtures needed to prove the vertical slice.
- **Work:** Feed the sequencer from one exclusive view; align retained session facets, author ordering, reconciliation, snapshot coordination, and shutdown ownership. Reassess finite catch-up/broadcast composition against the live storage stream.
- **Decisions:** Settle the initial-state workflow, snapshot publication/version mapping, and which layer owns conditional publication and stable retry identities. Ask before changing material shared semantics when requirements conflict.
- **Evidence:** Multiple sessions share one runtime; ordered submission and snapshot-plus-replay work without gaps or duplicates; ambiguous and cancelled operations are not confused; closing one session does not invalidate another; logical teardown releases the intended resources.
- **Validation:** Focused `sea-sequencer` tests and session conformance checks over the memory implementation, plus affected core checks and required gates.
- **Exit:** One usable end-to-end memory/view/sequencer slice with documented session contracts and remaining consumer dependencies. Evaluate, but do not automatically begin, parallel execution.
- [ ] Complete.

### 3. Remaining Backends And Decorators

- **Prerequisite:** Storage and session contracts have implementation evidence from checkpoints 1 and 2.
- **Writable scope:** File/content backends, transforming wrappers, conformance coverage, and any remaining old backend paths.
- **Work:** Implement new backend boundaries and recovery ordering; align wrapper APIs and compositions; remove obsolete backend implementations when their retained consumers can use the new ones.
- **Evidence:** Shared conformance across memory, buffered-file, and durable-file storage; dependency-closed recovery; corrupt required-prefix failure; exclusive ownership and resource lifetime; declared durability behavior; compression/encryption/stateful-compression round trips and stream semantics.
- **Validation:** Focused tests for each affected crate, cross-backend conformance, and required gates. Reopening and crash/recovery tests use freshly created data, not legacy fixtures kept solely for compatibility.
- **Exit:** Retained backends and decorators operate under the new contracts without compatibility layers. Record any consumer still keeping an old type alive for checkpoint 5.
- [ ] Complete.

### 4. Server, Protocol, Clients, And Bindings

- **Prerequisite:** A functioning sequencer and supported backends, with explicit session semantics.
- **Writable scope:** `sea-webtransport-server`, `sea-webtransport`, their generated-binding sources/test support, and direct transport test harnesses.
- **Work:** Add only the runtime document ownership needed by inbound connections; update server and clients together. Keep local handles behind storage boundaries and use explicit wire identities and error mappings.
- **Evidence:** Concurrent first connections do not create competing document writers; failed lazy initialization can be handled; sessions share the intended sequencer; disconnects and shutdown release resources. Native, injected, Node, and browser paths expose usable equivalent operations without requiring browser-owned state to be `Send`.
- **Validation:** Transport/server Rust tests, generated Node tests, and real Chromium WebTransport tests from their current READMEs, plus required gates. Rebuild and exercise generated output in the checkout being accepted.
- **Exit:** Native and browser clients communicate with the new server over the new protocol, including memory and file-backed configurations. No old-protocol negotiation or fallback is retained for compatibility.
- [ ] Complete.

### 5. Application Workflows And Final Core Layout

- **Prerequisite:** The new clients and server work independently of the application adapters.
- **Writable scope:** `tests/minimal-fluid-driver`, examples, benchmark consumers, final core exports, and remaining migrated call sites throughout `rust-service/`.
- **Work:** Restore actual application workflows, keeping Fluid-specific mapping/rebasing in its adapter. Promote `next` types to intentional public modules, remove obsolete definitions and adapters, and update active documentation.
- **Evidence:** SharedTree collaboration, summary publication and reload, blob/directory/handle reuse, and both supported client-selected and Sea-selected snapshot participation. Examples and benchmark entry points remain executable and produce meaningful output.
- **Validation:** The driver package's build/tests, relevant example and benchmark commands from their READMEs, and required gates. Record exact executed modes and backends rather than claiming blanket browser coverage.
- **Exit:** No retained consumer needs the old model, and no live source depends on `next` or transitional compatibility paths. Historical documents need not lose old names. Record any deliberately removed workflow and the user decision authorizing it.
- [ ] Complete.

### 6. Full Acceptance And Handoff

- **Prerequisite:** Checkpoints 1 through 5 are accepted.
- **Writable scope:** Localized integration repairs, current documentation, tests exposing remaining defects, and this plan's final evidence.
- **Work:** Audit the usage inventory and all transition-removal obligations. Run the full validation below against the final integrated checkout.
- **Evidence:** Actual command outcomes, all supported backend/session combinations covered by relevant suites, generated artifact consumers, and the real application workflows. Document any remaining limitation without relabeling it as success.
- **Exit:** One core model, working retained usages, no hidden implementation blockers, and no owned servers or temporary validation overrides left running. Mark this plan complete and leave it as the historical execution record.
- [ ] Complete.

## Validation And Evidence

At each checkpoint, run focused checks first and broaden according to the changed contract and consumers.
Before accepting changes to shared core/session contracts or a completed cross-crate checkpoint, run the canonical Rust workspace gates from [DEVELOPMENT.md](DEVELOPMENT.md).
The final acceptance requires these commands from `rust-service/`:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
./test.sh
node scripts/check-documentation.mjs
```

The current [test entry point](test.sh) builds the minimal driver package, runs `cargo test --workspace --all-targets --all-features`, and runs the package's non-Rust test graph.
That graph includes generated WASM/Node tests, TypeScript consumer tests, and the browser transport harness.
Do not assume it covers every backend, benchmark, or application mode in the inventory; supplement it with the exact owning README commands for uncovered acceptance cases.
Record commands, backend/mode selections, exit outcomes, and any artifact locations in checkpoint evidence.
Benchmark smoke checks establish usability; no new performance threshold is imposed by this migration plan.

Run these from the repository root for implementation checkpoints affecting Rust or package build inputs:

```bash
pnpm policy-check --path rust-service
pnpm build:fast
```

The policy check is required after every Rust-service change, including documentation.
For this plan-only commit, run the documentation checker and scoped policy check; no code, generated outputs, or declared package build inputs change, so no build or test run is required.

Use the pinned Rust toolchain and the `wasm-bindgen` CLI version required by the workspace.
Do not hand-edit generated bindings or treat cached build success as proof that an ignored artifact exists and runs.
Classify failures as migration defects, pre-existing failures, or environment blockers with evidence; never silently waive a required gate.

## Decisions And Checkpoint Evidence

### Preparation

- The user approved sequential execution with a committed handoff plan, not a parallel iteration.
- The user explicitly waived API, wire, and persisted-data compatibility; the retained in-repository usages are the acceptance boundary.
- The namespace and collection cleanup is committed as `85e6cf96430`.
- No implementation checkpoint or test addition is part of this plan commit.
- Plan-only validation passed: the documentation checker reported 24 roots, 31 READMEs, and 49 local links; the scoped policy check processed 517 files with no violations.

For each subsequent checkpoint, append a concise entry covering starting and accepted commits, decisions and rationale, tests and commands with outcomes, temporary paths removed or retained, and the precise next action.
Update **Status** and its checkbox in the same implementation commit, leaving earlier evidence intact.