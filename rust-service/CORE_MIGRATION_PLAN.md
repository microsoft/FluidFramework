# Sea Core Model Migration

## Status

- **Plan status:** Checkpoint 1 reviewed and committed by the user; checkpoint 2 implemented and validated, uncommitted for review.
- **Execution mode:** One coordinating agent, sequential checkpoints on the current branch.
- **Scope:** Replacement of the old core model and alignment of its implementations and consumers within `rust-service/`.
- **Preparation completed:** `85e6cf96430` introduced `sea_core::next`, removed `SeaCollection`, and added default `SeaStorage::create_view` and `open_view` methods.
- **Completed checkpoint:** API-only preparation and checkpoints 1 and 2 implementation; checkpoint 2 awaits user review and checkpoints 3 through 6 remain open.
- **Validation:** Checkpoint 2 focused tests, canonical Rust workspace gates, `./test.sh`, documentation checking, scoped policy, and repository-root `pnpm build:fast` passed; exact outcomes are recorded below.
- **Known implementation state:** Replacement memory components, direct views, session facets, and a multi-user sequencer work together; remaining backends, wrappers, transport, and application consumers still use the explicitly transitional old model.
- **Open decisions:** Final public module layout and consumer-specific protocol/Fluid mappings remain for their owning checkpoints; checkpoint 2's shared session mappings are approved and recorded below.
- **Next action:** Review checkpoint 2's uncommitted diff and evidence at `893fb9fe307`. Only after approval, begin checkpoint 3's remaining backends and decorators; do not start checkpoint 3 from this handoff without authorization.
- **Plan commit:** `468aa0dd934`; checkpoint 1 started from `96ffe44bc98` and was committed and adjusted by the user through `893fb9fe307`. Checkpoint 2 created no commit, push, branch, worktree, or subagent.

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
Honor the user's commit authorization for implementation work; the earlier plan-commit authorization did not authorize implementation commits or pushing.
Checkpoint 1's implementation request explicitly prohibits committing, pushing, and starting checkpoint 2 before review.

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
- [x] Complete: reviewed, committed, and adjusted by the user through `893fb9fe307`.

### 2. Sequencer And Session Contracts

- **Prerequisite:** Checkpoint 1's memory-backed view works.
- **Writable scope:** `sea-sequencer`, session-related core contracts, conformance coverage, and the smallest local consumer fixtures needed to prove the vertical slice.
- **Work:** Feed the sequencer from one exclusive view; align retained session facets, author ordering, reconciliation, snapshot coordination, and shutdown ownership. Reassess finite catch-up/broadcast composition against the live storage stream.
- **Decisions:** Settle the initial-state workflow, snapshot publication/version mapping, and which layer owns conditional publication and stable retry identities. Ask before changing material shared semantics when requirements conflict.
- **Evidence:** Multiple sessions share one runtime; ordered submission and snapshot-plus-replay work without gaps or duplicates; ambiguous and cancelled operations are not confused; closing one session does not invalidate another; logical teardown releases the intended resources.
- **Validation:** Focused `sea-sequencer` tests and session conformance checks over the memory implementation, plus affected core checks and required gates.
- **Exit:** One usable end-to-end memory/view/sequencer slice with documented session contracts and remaining consumer dependencies. Evaluate, but do not automatically begin, parallel execution.
- [x] Complete: implementation and validation, uncommitted and awaiting user review.

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

### Checkpoint 1: Memory Storage And Direct Views

- Starting commit: `96ffe44bc98` on `rust-service`, with a clean working tree.
	The plan commit is `468aa0dd934`; API preparation is `85e6cf96430`.
	Implementation is uncommitted by user instruction; no commit or push is authorized.
- Responsible path: new document components in `crates/sea-memory/src/document.rs`, composed by the existing `sea_core::next::SeaView`.
- Initial hypothesis: document-scoped availability provenance and shared exclusive-opening leases can satisfy the replacement contracts without changing their semantics or forwarding through the old memory API.
	Cheapest initial check: a localized blob publication/resolution test rejects another document's handle even for identical content identity.
- Verified current consumers of `MemoryStream`: sequencer tests, compression/encryption/stateful-compression tests, server host/dispatch, WASM transport tests, counter example, and benchmarks.
	They remain on the old API for their owning checkpoints; checkpoint 3 owns removal of the old memory backend once these consumers have replacements.
- Execution is sequential on the current branch, with no subagents, worktrees, or checkpoint-2 work.

#### Implementation And Decisions

`MemoryStorage` now owns document allocation, retained histories, and exclusive opening leases.
Its blob, event, and snapshot components are independently usable; their clones share the same opening and mutation order.
`memory_archive.rs` supplies retained bounded/live reads with lazy initialization, coherent progress, wakeups, and stream-owned leases.
`SeaView` uses these implementations directly, with no forwarding through `MemoryStream` and no material shared-contract changes.
The initial hypothesis was supported by the first executable check: `cargo test -p sea-memory blob_handles_check_document_provenance_and_closure` passed immediately after the first substantive edit.

Availability handles retain document data but not opening ownership.
They remain compatible with a later opening of the same document after `ensure_available`; foreign-document handles are rejected even for equal identities.
Components and streams, including unpolled or completed streams, retain the opening until dropped.
Raw event components keep blob identities opaque; reopening verifies a complete dependency-closed history and fails on missing dependencies or gaps.
Snapshot records retain identities rather than their own document's handles, preventing ownership cycles.

Memory-specific choices allowed by the contracts are documented in `crates/sea-memory/README.md`:
nonempty future-bound reads fail lazily with `InvalidPosition`; reversed/equal ranges complete even for future bounds;
all committed history is retained; more than one unread entry reports `FallenBehind`;
and append has no internal suspension, detached work, retry, or ambiguous result.
Unpolled append cancellation has no effect, while a polled append settles synchronously before returning.
No new dependencies, manifest changes, wire representations, or persisted formats were introduced.

#### Behavioral Evidence

Twelve replacement-focused memory tests were added alongside the seven retained old-model tests.
The shared replacement suites are invoked by `document::tests::replacement_storage_conformance` with a five-second timeout;
`sea-conformance` itself has no standalone test fixtures.

| Responsibility | Evidence |
| --- | --- |
| Unknown identities, unique allocation, exclusive opening, clones, competing opens | `factory_identity_and_component_clone_lifetimes` |
| Blob round trip, directory closure, resolution, nested content, provenance | `blob_handles_check_document_provenance_and_closure` |
| Dependency checks before view publication, including equal foreign identities | `availability_rejects_foreign_handles_before_view_publication` |
| Append, snapshot, load, stream-held ownership, reopen, old-handle revalidation | `view_appends_loads_and_reopens_with_compatible_handles` |
| Shared direct-view and sparse snapshot laws | `sea_conformance::next::{run_view_conformance, run_snapshot_archive_conformance}` |
| Lazy bounds, finite/empty ranges, terminal errors, unpolled read ownership | `read_bounds_are_lazy_empty_ranges_finish_and_drops_release_opening` |
| Actual reader wake notification, ordered delivery, progress, independent cancellation | `live_read_wakes_without_gaps_tracks_backlog_and_cancels_independently` |
| Append cancellation settlement and distinct concurrent submissions | `cancelled_appends_have_no_detached_work_and_concurrent_appends_are_distinct` |
| Every `LoadStart` policy, missing qualifying snapshots, replay cursor | `load_policies_replay_from_the_selected_snapshot_without_capturing_a_head` |
| Live snapshot read ownership, reopened event availability, no handle cycle | `snapshot_stream_is_live_and_retains_opening_without_retaining_handle_cycles` |
| Raw event opacity versus factory recovery law | `raw_event_archive_keeps_blob_ids_opaque_but_reopen_checks_dependencies` |
| Missing published dependencies fail lookup/read/reopen, required event gaps fail reopen | `missing_snapshot_dependencies_and_event_gaps_fail_instead_of_disappearing` |

The changed production crate's guarantees and tests live in `sea-memory`; unchanged `sea-core::next::SeaView` composition is exercised by the memory and shared suites.
Core contracts and core implementation files were not changed, so no additional core-local fixture or documentation change was needed.

#### Validation Results

All final checks below exited successfully on 2026-09-18 using pinned `rustc 1.98.1` and `wasm-bindgen 0.2.128`.
Commands are from `rust-service/` except where explicitly marked repository root.

| Command | Actual outcome |
| --- | --- |
| `cargo test -p sea-memory -p sea-core -p sea-conformance --all-targets --all-features` | 19 memory tests and 11 core tests passed; replacement conformance exercised through memory. |
| `cargo clippy -p sea-memory -p sea-core -p sea-conformance --all-targets --all-features -- -D warnings` | Passed after local lint cleanup. |
| `cargo fmt --all -- --check` | Passed. |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Passed. |
| `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` | Passed; generated documentation under `target/doc/`. |
| `cargo build --workspace --all-targets` | Passed. |
| `./test.sh` | Passed: package build, `cargo test --workspace --all-targets --all-features` (124 tests across 16 test binaries), generated WASM/Node tests, driver JavaScript tests, and real Chromium WebTransport/shutdown checks. |
| `node scripts/check-documentation.mjs` | Passed: 24 roots, 31 READMEs, 51 local links. |
| Repository-root `pnpm policy-check --path rust-service` | Passed: 520 files, no violations. |
| Repository-root `pnpm build:fast` | Passed: 1,878 tasks considered across 168 packages; 1,858 up to date and 20 completed, including regenerated WASM/browser inputs. |

The full test log is `/tmp/sea-core-checkpoint1-tests.log`; the root build log is `/tmp/sea-core-checkpoint1-build-fast.log`.
These are local diagnostic artifacts, not committed reports.
The test graph executed `node ../wasm-client/node-test.mjs`, `node --test "lib/*.test.js"`, and the browser harness after rebuilding WASM.
Browser evidence reports HeadlessChrome 152, three transport sessions, `STORAGE_MODE=durable-file`, successful blob/directory and snapshot-participation flow, and successful bounded shutdown.
The harness waited for server exit and removed its temporary target, certificate, and data directories.
Generated consumer checks are regression coverage for the retained old model, not a claim that transport or SharedTree has migrated to the new model.
No standalone SharedTree browser matrix, benchmark smoke, or replacement sequencer workflow was claimed or required for this checkpoint.

Initial focused Clippy failures were local: included-README list continuation formatting, two long conformance functions, and one redundant underscore-field assertion.
They were corrected without suppressions, then focused and full workspace gates passed.
There are no remaining known migration defects, temporary build breakages, or environment blockers at this boundary.

#### Precise Handoff

The accepted implementation commit is **none**: changes remain uncommitted for review on `rust-service` at `96ffe44bc98`.
Review the three new source files (`sea-memory/src/document.rs`, `sea-memory/src/memory_archive.rs`, `sea-conformance/src/next.rs`), their crate-root wiring, the two READMEs, and this plan.
No other tracked files changed; no shared core contract was materially revised.

The old `MemoryStream`, old `MemoryError`, and old conformance entry points remain for existing consumers.
Checkpoint 3 owns old memory/backend removal, coordinated with checkpoint 2's sequencer migration and later transport/application migrations;
if a later consumer still keeps an old type alive, checkpoint 3 must record that obligation explicitly for checkpoint 5 rather than introduce an adapter.
The temporary `sea_core::next` namespace remains checkpoint 5's responsibility.

Stop here for user review.
After explicit authorization to continue, verify the starting commit and this working-tree evidence, then begin checkpoint 2 by replacing the sequencer's old storage dependency with one exclusive replacement `SeaView`.
Before materially revising shared session contracts, resolve initial application state, snapshot publication/version identity, conditional publication ownership, and stable retry/reconciliation identity against actual consumer usages.
No checkpoint-2 policy decision, implementation, commit, or parallel-work authorization is implied by this handoff.

### Checkpoint 2: Sequencer And Session Contracts

Starting commit: `893fb9fe307` on `rust-service`, initially clean.
The user committed checkpoint 1 as `50a29da6bb9` and adjustments through `893fb9fe307`.
Those adjustments supersede the original handoff's memory-stream lifetime description.
The sequencer must depend only on shared `SeaStorage`/`SeaView` guarantees, not memory-specific stream ownership or reopening behavior.

Responsible path: `crates/sea-sequencer/src/next.rs`, with the old session implementation retained for consumers awaiting checkpoints 3 through 5.
Hypothesis: one owned view plus serialized, retained mutation futures supports multiple independent memberships without an old-storage adapter or broadcast catch-up pipeline.
First discriminating check: `two_sessions_share_one_view_and_close_independently`.

The user approved these shared mappings before implementation:
- Represent a nonempty initial application summary with an explicit application initialization event referencing its tree, then a normal snapshot; Fluid mapping stays in its adapter.
- Use document-scoped snapshot event positions as version identities; reconcile position/root equality and reject conflicting roots.
	Expected-parent checks and publisher nomination/fencing belong in the sequencer, without a separate snapshot operation-ID registry.
- Keep stable event identities and conflict detection above storage; reconcile returned ambiguous appends with a bounded scan.
	Cancellation cannot prove absence or settlement; block further mutation until retained work settles or recovery establishes safety.
- Own one exclusive view for the runtime and use direct live reads under shared contracts only.

No subagents, worktrees, commits, pushes, or checkpoint-3 work are authorized by this checkpoint.

#### Implementation And Decisions

The initial two-session check passed after correcting generic type inference in the append helper.
`sea_core::next::session` now defines archive, author, snapshot-coordinator, and combined session facets using existing `SeaService` native/browser bounds and shared identity/event primitives.
Shared storage contracts were not changed.
`sea-sequencer::next::LocalSequencer` owns the exclusive view, active membership, stable submission index, serialized mutations, and snapshot authority.
`sea-conformance::next::run_session_conformance` proves the replacement initial-state, snapshot, retry, replay, and independent-close workflow.
Each changed crate has updated owning documentation; shared contract behavior is exercised through conformance and the sequencer rather than a duplicate core fixture.

Membership and publisher selection are runtime-local, with no control records in the replacement application archive.
Recovery rebuilds committed operation identities and reserves session identities observed in application records; unused memberships are not persisted.
The existing envelope codec is reused, but old storage is not underneath the replacement implementation.
Direct monitored backend reads replace finite catch-up and broadcast buffering.
Logical close removes one membership; shutdown settles pending work before releasing the runtime's view.
Backend-owned streams or other resources can still retain opening ownership, as permitted by the shared contracts.

An owned mutation future remains in the runtime when its caller is cancelled.
The next state-dependent operation drives the same future; no detached task or native-only executor is required.
Without another operation, cancelled work can remain pending.
Dropping the runtime can cancel that retained work and requires backend settlement/recovery discipline before reopening.
Failed reconciliation poisons the runtime with `RecoveryRequired`; discarding and recovering it is required instead of claiming successful shutdown.

Returned event ambiguity uses an authoritative head and bounded scan, never automatic resubmission.
Returned snapshot ambiguity only resolves when lookup confirms the exact position/root.
Snapshot lookup absence is not proof of settlement and therefore requires recovery, not an unsafe explicit retry.
Publisher registration replacement and drop revoke only the corresponding registration; nomination transitions allocate fresh fences.
Conditional publication and exact retries remain session policy, while component provenance and dependency availability remain storage responsibilities.

#### Behavioral Evidence

Twelve replacement tests run alongside twelve retained old-sequencer tests.
Fault fixtures live beside the owning implementation in `src/next_fault_tests.rs`; no new dependency or manifest change was needed.

| Responsibility | Localized evidence |
| --- | --- |
| Shared view ownership, independent close, replacement membership | `two_sessions_share_one_view_and_close_independently` |
| Explicit initialization, stable retries, snapshots and live suffix | `replacement_session_conformance`, invoking `run_session_conformance` |
| Parent checks, position/root conflicts, client-selected suppression, fences, registration replacement/drop | `snapshot_parent_position_and_publisher_fences_are_session_policy` |
| Direct replay, membership closure, every load policy | `direct_reads_close_with_membership_and_load_policies_preserve_replay` |
| Recovered retry/snapshot identities, runtime-local membership | `recovery_restores_submission_and_snapshot_identities_not_active_memberships` |
| 32 concurrent submissions, ordered once-only delivery, progress, lazy bound errors | `concurrent_sessions_deliver_each_submission_once_with_lazy_errors_and_progress` |
| Corrupt and duplicate committed envelopes fail recovery | `recovery_rejects_malformed_and_duplicate_submission_envelopes` |
| Definitive rejection, ambiguous commit/absence, no internal resubmission | `returned_ambiguity_is_scanned_without_resubmitting_and_absence_allows_explicit_retry` |
| Failed head/read reconciliation blocks mutations and absence claims | `failed_reconciliation_blocks_mutation_and_absence_claims_until_recovery` |
| Cancellation before/after backend commitment retains the same future | `cancelling_before_or_after_commit_retains_the_same_backend_future_until_settlement` |
| Snapshot cancellation and ambiguous lookup preserve publication order | `snapshot_cancellation_and_ambiguity_preserve_publication_order` |
| Teardown with backend streams retaining writer ownership | `shutdown_and_session_close_work_when_backend_streams_retain_writer_ownership` |

The fault backend deliberately retains writable components in its read streams.
This tests a stricter lifetime allowed by `SeaStorage` rather than relying solely on memory's independent streams.
Mutation invocation counts and explicit gates distinguish caller cancellation from backend settlement without timing sleeps.

#### Validation Results

All final checks exited successfully; commands are from `rust-service/` except where marked repository root.

| Command | Actual outcome |
| --- | --- |
| `cargo test -p sea-sequencer next::` | All 12 replacement tests passed. |
| `cargo test -p sea-sequencer -p sea-core -p sea-conformance --all-targets --all-features` | Passed before the last two regressions; the full workspace run below includes both additions. |
| `cargo clippy -p sea-core -p sea-sequencer -p sea-conformance --all-targets --all-features -- -D warnings` | Passed after local lint fixes and again after final code/documentation edits. |
| `cargo fmt --all -- --check` | Passed. |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Passed. |
| `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` | Passed. |
| `cargo build --workspace --all-targets` | Passed. |
| `cargo rustc -p sea-sequencer --lib -- -D missing-docs` | Passed. |
| `./test.sh` | Passed: 147 Rust tests across 16 binaries, generated WASM/Node tests, driver JavaScript tests, and real Chromium WebTransport/shutdown checks. |
| `node scripts/check-documentation.mjs` | Passed: 24 roots, 31 READMEs, 53 local links. |
| Repository-root `pnpm policy-check --path rust-service` | Passed: 523 files, no violations. |
| Repository-root `pnpm build:fast` | Passed: 1,878 tasks across 168 packages; 1,858 up to date and 20 completed, including WASM/browser regeneration. |

Local logs: `/tmp/sea-core-checkpoint2-tests.log` and `/tmp/sea-core-checkpoint2-build-fast.log`.
Browser evidence reports HeadlessChrome 152, three sessions, the default durable-file configuration, blob/directory and snapshot participation, and bounded server shutdown.
Generated client and browser coverage remains regression evidence for old consumers, not evidence of their migration.
No replacement transport, SharedTree browser matrix, or benchmark migration is claimed.
No required gate remains failing or waived; no tracked generated output, manifest, or lockfile changed.

#### Precise Handoff

Checkpoint 2 has no implementation commit: its eleven changed/new files remain uncommitted on `rust-service` at `893fb9fe307` for review.
The accepted checkpoint-1 chain is `50a29da6bb9`, `89af83e7697`, `8e16ba8a24e`, `c4637c6445a`, and `893fb9fe307`.
That chain supersedes checkpoint 1's historical uncommitted handoff and stream-ownership description above.

Retained transition obligations:
- Old core sessions and `sea-sequencer::session` remain for unmigrated consumers; they are not compatibility adapters for `next`.
- The replacement reuses the old module's envelope codec and `SessionError`, now including `RecoveryRequired`; checkpoint 5 owns moving these definitions and removing the old session implementation.
- Checkpoint 3 owns backend/wrapper migration and records any old backend type still needed by transport/application consumers until checkpoints 4 and 5.
- Checkpoint 4 owns server runtime management and protocol/binding mappings; checkpoint 5 owns Fluid initialization/sequence/version mapping and final public layout.

Parallel backend and wrapper work could become useful after this slice is accepted, but would add shared-conformance and integration coordination overhead.
Sequential work remains the authorized mode; any switch requires a separate user decision and no iteration or worktree has been created.
Stop for checkpoint-2 review now.
The precise next implementation action, only after authorization, is to verify this accepted boundary and begin checkpoint 3 at the remaining backend/decorator contracts and their localized conformance fixtures.
