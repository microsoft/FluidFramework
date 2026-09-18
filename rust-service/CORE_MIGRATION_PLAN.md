# Sea Core Model Migration

## Status

- **Plan status:** Checkpoints 1 through 4 reviewed and committed by the user; checkpoint 5 implemented and validated from `327672b7cb0`, awaiting review.
- **Execution mode:** One coordinating agent, sequential checkpoints on the current branch.
- **Scope:** Replacement of the old core model and alignment of its implementations and consumers within `rust-service/`.
- **Preparation completed:** `85e6cf96430` introduced `sea_core::next`, removed `SeaCollection`, and added default `SeaStorage::create_view` and `open_view` methods.
- **Completed checkpoint:** API-only preparation and checkpoints 1 through 4; checkpoints 5 and 6 remain open.
- **Validation:** Checkpoint 5 canonical Rust/native/WASM gates, `./test.sh`, actual SharedTree traces, eight browser benchmark cells, counter and storage smoke/measurement entry points, documentation, scoped policy, and repository-root `pnpm build:fast` passed. Exact modes and outcomes are recorded below.
- **Known implementation state:** All retained consumers use the final model. Core storage and session contracts are sibling modules; obsolete core/backend/session implementations and transitional `next` exports are removed.
- **Open decisions:** None for checkpoint 5; no material shared-contract change was needed.
- **Next action:** User review of checkpoint 5. Checkpoint 6 is not started.
- **Plan commit:** `468aa0dd934`; checkpoint 1 was committed and adjusted through `893fb9fe307`, checkpoint 2 through `05a8403baa1`, checkpoint 3 through `155c6d12159`. Checkpoint 4 created no commit, push, branch, worktree, or subagent.

Update this status and the checkpoint evidence in every implementation commit.
Record the exact next action, completed checks, unresolved decisions, and any temporary breakage.
Do not mark a checkpoint complete based only on compilation or a delegated agent's summary.

## Purpose And Authority

Migrate the Rust service to the replacement core model, now exposed in [sea-core's storage module](crates/sea-core/src/storage/mod.rs) and [session module](crates/sea-core/src/session.rs).
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
- [x] Complete: reviewed, committed, and adjusted by the user through `05a8403baa1`.

### 3. Remaining Backends And Decorators

- **Prerequisite:** Storage and session contracts have implementation evidence from checkpoints 1 and 2.
- **Writable scope:** File/content backends, transforming wrappers, conformance coverage, and any remaining old backend paths.
- **Work:** Implement new backend boundaries and recovery ordering; align wrapper APIs and compositions; remove obsolete backend implementations when their retained consumers can use the new ones.
- **Evidence:** Shared conformance across memory, buffered-file, and durable-file storage; dependency-closed recovery; corrupt required-prefix failure; exclusive ownership and resource lifetime; declared durability behavior; compression/encryption/stateful-compression round trips and stream semantics.
- **Validation:** Focused tests for each affected crate, cross-backend conformance, and required gates. Reopening and crash/recovery tests use freshly created data, not legacy fixtures kept solely for compatibility.
- **Exit:** Retained backends and decorators operate under the new contracts without compatibility layers. Record any consumer still keeping an old type alive for checkpoint 5.
- [x] Complete: reviewed, committed, and adjusted by the user through `155c6d12159`.

### 4. Server, Protocol, Clients, And Bindings

- **Prerequisite:** A functioning sequencer and supported backends, with explicit session semantics.
- **Writable scope:** `sea-webtransport-server`, `sea-webtransport`, their generated-binding sources/test support, direct transport test harnesses, and the Fluid-driver adaptations needed to exercise the new APIs.
- **Work:** Add only the runtime document ownership needed by inbound connections; update server and clients together. Keep local handles behind storage boundaries and use explicit wire identities and error mappings.
- **Approved consumer work:** Propagate backend-assigned document IDs into creation and reopening; use event-position snapshot versions; implement explicit initialization events and correct Fluid sequence projection. Include focused regression tests and retain the integrated build/test gates. Broader application acceptance, examples, benchmarks, and final core cleanup remain in checkpoint 5.
- **Evidence:** Concurrent first connections do not create competing document writers; failed lazy initialization can be handled; sessions share the intended sequencer; disconnects and shutdown release resources. Native, injected, Node, and browser paths expose usable equivalent operations without requiring browser-owned state to be `Send`.
- **Validation:** Transport/server Rust tests, generated Node tests, and real Chromium WebTransport tests from their current READMEs, plus required gates. Rebuild and exercise generated output in the checkout being accepted.
- **Exit:** Native and browser clients communicate with the new server over the new protocol, including memory and file-backed configurations. No old-protocol negotiation or fallback is retained for compatibility.
- [x] Complete: reviewed and committed by the user through `327672b7cb0` (`7a382fe41f9` plus review fixes).

### 5. Application Workflows And Final Core Layout

- **Prerequisite:** The new clients and server work independently of the application adapters.
- **Writable scope:** `tests/minimal-fluid-driver`, examples, benchmark consumers, final core exports, and remaining migrated call sites throughout `rust-service/`.
- **Work:** Restore actual application workflows, keeping Fluid-specific mapping/rebasing in its adapter. Promote `next` types to intentional public modules, remove obsolete definitions and adapters, and update active documentation.
- **Evidence:** SharedTree collaboration, summary publication and reload, blob/directory/handle reuse, and both supported client-selected and Sea-selected snapshot participation. Examples and benchmark entry points remain executable and produce meaningful output.
- **Validation:** The driver package's build/tests, relevant example and benchmark commands from their READMEs, and required gates. Record exact executed modes and backends rather than claiming blanket browser coverage.
- **Exit:** No retained consumer needs the old model, and no live source depends on `next` or transitional compatibility paths. Historical documents need not lose old names. Record any deliberately removed workflow and the user decision authorizing it.
- [ ] Complete: implementation and validation finished; awaiting user review.

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

### Checkpoint 5: Starting Hypothesis

- Starting commit: `327672b7cb0`, clean working tree, after the user's checkpoint-4 acceptance.
- Work remains sequential on the current branch; no subagents, worktrees, branches, commits, or pushes.
- First owning path: `examples/sea-counter/src/main.rs`.
	Hypothesis: the counter's snapshot-plus-tail workflow can use a factory-created view and replacement session handles without changing its application result; initial state must first be committed as an event.
	Cheapest check: existing counter recovery and malformed-payload tests, then its documented executable.
- Final layout will retain intentional storage/session modules and shared primitives, without compatibility aliases for `next` or obsolete APIs.
	Material shared semantic changes still require user approval.
- Stop after checkpoint 5 implementation and validation for review, before checkpoint 6.

### Checkpoint 5: Implementation And Validation Handoff

Implementation remains uncommitted on `rust-service`, based on `327672b7cb0`.
No subagents, worktrees, branches, commits, or pushes were used.

#### Responsibilities And Removal

The counter now uses a factory-created view and handle-based snapshots, including an explicit initialization event for initial application state.
Raw benchmark cells use `SeaView`; transforming cells use decorated sessions over a file-backed sequencer.
File recovery retains the backend-assigned document ID, and storage reads use an explicit committed upper bound.
All six storage/decorator smoke cells retain snapshot, replay, and recovery checks.

Core contracts now live in sibling `sea_core::storage` and `sea_core::session` modules.
Backend components live in their storage modules; session decorators and the sequencer use session modules.
Shared identity/event/error primitives remain shared, and the sequencer's envelope codec and error definitions have dedicated private modules.
Old monolithic backends, initial snapshot/publication identity types, duplicate session implementations, obsolete conformance suites, and their tests were deleted rather than retained as compatibility adapters.
Current conformance, corruption, codec, crypto, ownership, cancellation, settlement, and recovery tests remain at their owning boundaries.
Current crate documentation reflects the final model; accepted historical records retain their original names.

The actual SharedTree trace exposed a delivery-cursor bug: reopening used the last submitted position while subscribing used the last consumed position.
These differ after consuming another author's event, causing intermittent reconnect rejection.
`SeaDeltaConnection::open` now consistently resumes delivery after the consumed cursor.
The existing generated summary/reopen test now opens a real delta connection with deliberately different submission and delivery positions; the browser trace then passed on memory and durable-file.
No storage, session, or wire contract change was required.

#### Executed Evidence

Commands are from `rust-service/` unless marked repository root.

| Check | Actual outcome |
| --- | --- |
| `cargo check --workspace --all-targets --all-features` | Passed after promotion and legacy removal. |
| `cargo fmt --all -- --check` | Passed. |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Passed after adding missing view error documentation. |
| `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` | Passed after correcting promoted symbol links. |
| `cargo build --workspace --all-targets` | Passed. |
| WASM `cargo check` and strict `cargo clippy` for `sea-webtransport`, target `wasm32-unknown-unknown`, feature `test-support`, `RUSTFLAGS='--cfg=web_sys_unstable_apis'` | Passed. |
| `./test.sh` | Passed: 132 Rust tests across 16 binaries, rebuilt generated WASM/Node tests, driver tests, Chromium WebTransport and bounded shutdown. Default browser mode: durable-file/ClientSelected. |
| `SEA_STORAGE_MODE=memory SEA_SNAPSHOT_POLICY=sea SEA_BROWSER_SKIP_BUILD=1 tests/webtransport-browser/run-test.sh` | Passed with rebuilt WASM: SeaSelected (`snapshotParticipation=2`), publication at event 6, reconnect, and bounded shutdown with zero active connections. |
| `node --test tests/minimal-fluid-driver/lib/fluidDriver.summary.test.js` after `build:esm` | All five tests passed, including initial-state/version mapping, differing reconnect cursors, invalid-history cleanup, incremental tree/blob handle reuse, attachments, and stale-parent rejection. |
| SharedTree `run-headless.mjs` with `__sharedTreeResult shared-tree.html` | Passed against separately owned memory and durable-file servers: three containers converged to 3, initial summary reloaded, disconnected edit resolved `notCommitted`, explicit resubmission succeeded, third container replayed edits. |
| Driver `bench:run -- --case rust-local,rust-local-direct,rust-memory,rust-memory-direct,rust-buffered,rust-buffered-direct,rust-durable,rust-durable-direct --dds shared-tree --repetitions 1 --operations 5 --warmup 1` | Eight of eight passed with current release server builds. Fluid selects ClientSelected; direct selects SeaSelected. These are execution smoke samples, not performance conclusions. |
| `cargo run -p sea-counter` | Passed: `recovered counter: 4`. |
| `cargo run -p sea-benchmarks -- smoke` | Passed: memory, file, compression, encryption, stateful compression, and composed decorators, including snapshot/reopen workloads. |
| `cargo run -p sea-benchmarks -- measure --backend memory --fixture small-incompressible --records 8 --writers 2 --snapshot-frequency 0 --warmups 0 --repetitions 1` | Passed: one schema-version-3 JSON result with eight committed/read records. No performance claim. |
| `node scripts/check-documentation.mjs` | Passed after repairing stale paths. |
| Repository-root `pnpm policy-check --path rust-service` and `pnpm build:fast` | Passed. |

The first browser benchmark attempt used `--skip-build` and therefore a stale release server, causing six protocol-version failures while the two local cells passed.
Rerunning with the harness's normal release build enabled passed all eight cells; no compatibility fallback was added.
The initial failing SharedTree trace was investigated and fixed, not waived or removed.
No Tinylicious/TypeScript-local baseline comparison, power-loss certification, or performance improvement is claimed.
Temporary validation servers were stopped and their data removed.
Local diagnostic logs are `/tmp/sea-checkpoint5-test.log`, `/tmp/sea-checkpoint5-browser-bench.log`, `/tmp/sea-checkpoint5-policy.log`, and `/tmp/sea-checkpoint5-root-build.log`.

#### Review Boundary

No retained source depends on `next` or the old storage/session traits, and no compatibility alias keeps the old model alive.
Review the promoted modules, removed implementations, migrated example/benchmark entry points, and Fluid delivery-cursor regression before accepting checkpoint 5.
Stop here; checkpoint 6's final acceptance inventory remains separate and requires authorization to continue.

### Checkpoint 4: Approved Scope And Starting Hypothesis

- Starting commit: `155c6d12159`, with a clean working tree; checkpoint 3 was committed at `8c39c7bda1b` and reviewed at the starting commit.
- Creation returns the backend-assigned opaque document ID, which clients retain for subsequent opens. No client-name registry is added.
- The user approved moving the necessary Fluid-driver adaptations into checkpoint 4 to validate the API boundary with real consumers, accepting a larger checkpoint and potentially slower implementation.
- Responsible first path: server document ownership in `crates/sea-webtransport-server/src/host.rs`.
- Initial hypothesis: serialized lazy initialization can share one replacement sequencer per document and leave failed opens retryable without competing writer views.
	Cheapest discriminating check: concurrent first-open and failed-open retry tests using the replacement memory factory.
- Execution remains sequential, without subagents, new worktrees, branches, commits, or pushes. Stop after checkpoint 4 for review.

### Checkpoint 4: Implementation And Validation Handoff

Implementation is uncommitted on `rust-service`, based on `155c6d12159`.
The accepted scope and initial hypothesis are recorded above.
The first focused registry tests supported the hypothesis: concurrent first opens share one recovered sequencer, and a failed competing open does not poison later explicit initialization.

#### Responsibilities And Decisions

- `sea-webtransport-server` directly hosts replacement memory, buffered-file, and durable-file factories and sequencers.
	It serializes lazy initialization, caches only successful document runtimes, and returns backend-assigned opaque IDs.
	Successful runtimes remain cached for the host lifetime; there is no idle eviction, and retaining a host after listener shutdown retains its views.
- Protocol version 5 returns document IDs separately from session authority, submission positions without obsolete durability receipts, and snapshots identified by committed event position.
	Publication resolves tree and event availability at the receiver; obsolete snapshot-operation IDs, initial snapshots, and snapshot-operation resolution are removed.
	There is no old-format fallback.
- Native clients implement the replacement session facets with private client-scoped remote availability handles.
	Generated browser and local clients expose equivalent creation, history, content, snapshot, and author operations without requiring browser-owned values to be `Send`.
	Native event-handle resolution scans retained history; content-handle resolution fetches immutable content.
- Returned coordination subscriptions own registration lifetime.
	Native and browser pumps serialize requests independently of coalescible notification delivery.
	Old-stream cleanup cannot revoke a replacement registration, and cancellation wakes pending notification reads.
- The driver retains assigned IDs in resolved URLs, versions snapshots by event position, and represents initial summary state with a committed initialization event.
	Initialization maps to application sequence zero but is not a Fluid operation; ordinary operations start at one independently of raw positions.
	A fresh session scans retained history to reconstruct the map, so startup cost grows with history.
	Browser/direct harnesses propagate returned IDs; their broader workflow and measurement acceptance remains checkpoint 5.

#### Local Findings And Repairs

- Generated Node execution exposed consumption of an optional exported Rust tree value during `submit`.
	`Option<&SeaTreeId>` is unsupported by wasm-bindgen; a typed non-consuming JavaScript reference now preserves the caller's immutable identity.
	The content/initialization/snapshot regression exercises reuse of the same tree after submission.
- Pending snapshot reads previously blocked publication or outlived cancellation.
	Registration-owned streams and request pumps now separate these responsibilities.
	Browser reads retain pending JavaScript promises across Rust waiter cancellation, preventing a dropped waiter from losing the next transport bytes.
- Once browser disconnect actually closed WebTransport, old-stream cleanup could prevent explicit reopening.
	Replacement session setup now discards failed old-stream cleanup without retrying application operations.
	Driver synchronous disconnect likewise handles asynchronous cleanup failures without unhandled rejections.
- Initial strict lint runs found by-value snapshot conversions; those now borrow.
	The first root build found formatting in the two JavaScript harnesses; focused formatting checks and the rerun root build passed.

#### Evidence And Limits

| Boundary | Executed evidence |
| --- | --- |
| Shared document ownership and initialization retry | Two focused `DocumentRegistry` tests in `host.rs`; full server suite passes (10 tests). |
| Wire framing, role routing, authority, correlation, submission positions | `sea-webtransport` library suite passes (18 tests); server typed-dispatch and malformed/abandoned-stream tests pass. |
| Native backend composition and concurrent notification/publication | Native round-trip test covers memory, buffered-file, and durable-file, including registration replacement and publication while coordination is being polled. |
| Generated Node API and local ownership | Rebuilt production/test-support packages; all 9 generated Node tests pass, including tree reuse, backend allocation, same-position root rejection, pending-read cancellation, and replacement registration isolation. |
| Fluid initialization and snapshot projection | All 6 driver tests pass; the real generated-client regression verifies hidden initialization, first operation sequence 1, fresh-client reconstruction, exact historical versions, and rejection of nonexistent exact versions. Both TypeScript targets compile. |
| Browser memory / Sea-selected | `SEA_BROWSER_SKIP_BUILD=1 SEA_STORAGE_MODE=memory SEA_SNAPSHOT_POLICY=sea tests/webtransport-browser/run-test.sh` passes, including pending notification publication/cancellation, replacement, reconnect, and shutdown. |
| Browser durable-file / Client-selected | `./test.sh` runs the default Chromium harness successfully, with the same protocol/lifecycle flow. Both browser runs report 3 transport cleanups and zero active connections after bounded shutdown. |

Canonical commands passed from `rust-service/`:
`cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`,
`RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps`,
`cargo build --workspace --all-targets`, `./test.sh`, and `node scripts/check-documentation.mjs`.
The documentation checker reports 24 roots, 31 READMEs, and 56 local links.
The additional WASM-target Clippy check passes with `RUSTFLAGS='--cfg=web_sys_unstable_apis'`, target `wasm32-unknown-unknown`, and `--features test-support -- -D warnings`.
Repository-root `pnpm policy-check --path rust-service` passes (530 files), and `pnpm build:fast` passes after the harness formatting repair.
Generated artifacts were rebuilt and executed, not hand-edited.

Owning transport/server READMEs and client/driver harness documentation describe the changed contracts and retained costs.
This is proportionate contract documentation, not a claim of a complete private-declaration documentation audit.
No new core, sequencer, or storage contracts were changed, so their existing focused/conformance evidence remains authoritative; the changed transport/server crates add boundary-specific regression evidence.
No full SharedTree collaboration/summary/reload acceptance run or benchmark measurements are claimed in this checkpoint.
The temporary `next` namespace, old core/backends/sessions, and remaining example/benchmark migrations belong to checkpoint 5.
All validation-owned browser/server processes have exited; no commits or pushes were made.
Stop here for user review.

#### Staged Review Improvements

The quick sequential review of checkpoint 4's staged changes found two verified lifecycle defects.
Both new regression tests failed before their corresponding repairs and passed afterward.

- Snapshot-stream `Close` revoked the session's current publisher registration, so closing an older stream could disable its replacement.
	Dispatch now acknowledges without session-wide revocation, and the transport ends the closing stream so its own lease is dropped.
	`closing_old_snapshot_stream_preserves_replacement` covers continued publication through the replacement registration.
- A malformed initialization event during driver startup left the projected live history read uncancelled.
	Projected reads now cancel in `finally` on both completion and failure.
	The generated-WASM test `generated driver cancels startup history when initialization is invalid` checks the failure path directly.

The complete server suite (11 tests), summary suite (5 tests), canonical Rust formatting/Clippy/rustdoc/build gates, `./test.sh`, and documentation checker passed after these repairs.
The review fixes remain unstaged over the user's original staged batch; no commit or checkpoint-5 work is authorized by this review.

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

### Checkpoint 3: Remaining Backends And Decorators

Starting commit: `05a8403baa1`, clean working tree on `rust-service`.
The user accepted checkpoint 2 in `4cc9ed3bdf2`, with idempotent-close correction `362b41cfdb9` and lifecycle coverage `05a8403baa1`.
This supersedes checkpoint 2's historical uncommitted handoff above.
Execution remained sequential, with no subagents, worktrees, branches, commits, or pushes.

First responsible path: replacement file journal in `sea-file`, shared by buffered and durable replacement components.
Hypothesis: an exclusively locked, checksummed dependency-ordered journal supports both recovery policies without forwarding through old storage or changing shared contracts.
First discriminating check: `exclusive_journal_round_trip_and_tail_policies` passed immediately after the first substantive edit.
No shared core/storage/session contract was changed.

#### Implementation And Decisions

`sea-file::next::FileStorage<false>` supplies buffered replacement documents.
`sea-file-durable::next::DurableStorage` names the synchronized `FileStorage<true>` configuration of the same new engine, not a wrapper around either old backend.
The new format contains checksummed content/event/snapshot records in dependency order and does not read old-format data.
Opening verifies complete content closure, a dense event prefix, and strictly advancing snapshots whose dependencies exist.
Buffered recovery rejects incomplete tails; durable recovery truncates only an incomplete final frame.
Complete corruption or missing required dependencies fails recovery.

OS file locks exclude competing independent openings.
Components and reads retain the opening; unpolled, completed, or failed reads must be dropped before reopening.
Private availability handles retain canonical document provenance, not writer authority, and can be revalidated after reopening.
Raw event components keep tree identities opaque; composed views establish availability, and recovery rejects missing dependencies.
Reads are lazy and bounded/live, support sparse snapshot ranges, preserve coherent progress, and wake outside the mutation lock on commits and uncertain writes.

Filesystem mutations have no internal suspension or detached work.
Unpolled cancellation has no effect, and a polled call settles synchronously before returning.
Uncertain journal writes are `Ambiguous` and poison the opening until recovery; heads and resolutions cannot report stale absence.
No storage append is deduplicated or automatically resubmitted.
Snapshot positions remain their identities; parent and publisher policy remains in the sequencer.

`ContentStore` now directly implements replacement `BlobStore`/`ReferenceableStore` over its immutable object engine.
Trait publication verifies transitive closure; resolution distinguishes an absent root from a stored root with missing descendants.
Handles carry canonical namespace provenance and do not keep a writable opening alive.
Its synchronous identity-based primitives remain useful lower-level operations, not a second old storage model.

Compression, encryption, and dictionary-compression types now implement all replacement session facets directly.
They transform payloads while preserving stored identities, opaque availability handles, reference trees, snapshot policy, stream progress, and error classification.
Snapshot coordination streams retain their underlying drop/revocation behavior.
Deterministic compression frames preserve exact retries.
Encryption verifies committed plaintext and reuses ciphertext through the inner author's submission check, preserving reconnect/key-rotation behavior without bypassing cross-author conflicts.
Definitive concurrent conflicts may reconcile an already committed exact operation; uncertain writes are not blindly retried.

No new third-party version was introduced.
Manifests and the workspace lockfile record the shared file engine dependency, content trait/test dependencies, and file/encryption test dependencies for dictionary composition.
All six changed implementation crates have owning documentation and focused tests; unchanged conformance functions supply common laws without duplicate fixtures or conformance churn.
The memory README only records transition ownership; no memory or sequencer implementation was changed.

#### Behavioral Evidence

Seventeen new tests supplement the accepted checkpoint-2 suite.
All use freshly created data, not old-format compatibility fixtures.

| Responsibility | Evidence |
| --- | --- |
| Exclusive journal, clean records, buffered/durable tail policies | `sea-file::journal::tests::exclusive_journal_round_trip_and_tail_policies` |
| Shared view and sparse snapshot laws | `replacement_file_conformance`, `replacement_durable_conformance`; existing memory conformance also passed in the full suite |
| Opaque raw event identities, dependency-closed recovery, foreign-handle rejection | `raw_event_dependencies_fail_recovery_and_foreign_handles_are_rejected` |
| Coherent new-backlog progress and real reader wakeups | `progress_stays_coherent_when_live_reader_discovers_new_backlog`, `live_readers_wake_on_commit_and_uncertain_write` |
| Pre-write rejection, partial writes, post-sync lost acknowledgment in both modes | `journal_faults_preserve_prefix_and_block_uncertain_observations` |
| Snapshot uncertainty cannot claim absence or create duplicates | `snapshot_post_sync_ambiguity_recovers_without_duplicate_publication` |
| Durable dependency preservation, incomplete-tail repair, corruption failure, stream ownership | `recovery_preserves_dependencies_discards_torn_tail_and_rejects_corruption`, `independent_factories_and_live_streams_share_exclusive_ownership` |
| Immutable content provenance, closure, reopening, missing descendants | `closure_provenance_reopen_and_missing_dependency` |
| Every wrapper's session facets, including snapshots, replay, and close | Shared `run_session_conformance` invoked by each wrapper's replacement tests |
| Encryption retry cardinality, reconnect/key rotation, cross-author conflict | `replacement_retries_preserve_ciphertext_but_recheck_authority` |
| Decode-error cursor and size limits | `replacement_bounds_decode_errors_and_progress` |
| Compression/encryption and dictionary/encryption compositions | `replacement_compression_encryption_conformance`, `replacement_file_compositions_recover_snapshots_and_replay` |

The file-composition test runs buffered and synchronized files through view, sequencer, encryption, and dictionary compression, including shutdown, recovery, snapshot content, and decoded replay.
Fault tests explicitly distinguish failed admission, incomplete commitment, and acknowledged bytes without a returned acknowledgment.
They are not a power-loss, hardware-failure, or distributed-filesystem certification.
The full-history in-memory index, synchronous filesystem work, and linear namespace allocation are documented experimental limits.

#### Validation Results

All final commands exited successfully on 2026-09-18.
Commands run from `rust-service/` unless marked repository root.

| Command | Actual outcome |
| --- | --- |
| Focused `cargo test -p <crate> next::` / specific test filters for all six changed crates | Passed after each implementation slice, including journal faults and file-backed wrapper composition. |
| Focused `cargo clippy -p <crate> --all-targets --all-features -- -D warnings` | Passed for every changed crate; local compile/style defects were repaired without suppressions. |
| `cargo fmt --all -- --check` | Passed. |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Passed. |
| `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` | Passed. |
| `cargo build --workspace --all-targets` | Passed. |
| `./test.sh` | Passed: 166 Rust tests across 16 binaries, generated WASM/Node tests, driver JavaScript tests, and Chromium WebTransport/shutdown checks. |
| `node scripts/check-documentation.mjs` | Passed: 24 roots, 31 READMEs, 56 local links. |
| Repository-root `pnpm policy-check --path rust-service` | Passed: 530 files, no violations. |
| Repository-root `pnpm build:fast` | Passed: 1,878 tasks across 168 packages; 1,858 up to date and 20 completed, including regenerated WASM/browser inputs. |
| `git diff --check` and editor diagnostics for edited implementation files | Passed with no reported errors. |

Logs are `/tmp/sea-core-checkpoint3-tests.log` and `/tmp/sea-core-checkpoint3-build-fast.log`.
The browser harness reports HeadlessChrome 152, three sessions, `STORAGE_MODE=durable-file`, successful content/snapshot participation, and bounded shutdown.
That harness still uses the old server backend: it establishes regression safety, not completed replacement protocol or application migration.
No standalone SharedTree browser matrix, new benchmark result, or wrapper-specific browser claim is made.
There are no failing or waived required gates and no tracked generated-output changes.

#### Precise Handoff

Checkpoint 3's 26 changed/new files remain uncommitted at `05a8403baa1` for user review.
Review the replacement journal/components, content trait implementation, all three wrapper facets, localized tests, manifest/lockfile edges, READMEs, and this plan.
No checkpoint-4 implementation, commit, or push has been performed.

Concrete retained transition obligations:
- `sea-webtransport-server/src/host.rs` still names `MemoryStream`, `FileStream`, and `DurableLog`; checkpoint 4 owns document-scoped factories/runtime caching and protocol migration.
- `sea-webtransport/src/wasm/sea.rs` local bindings and server dispatch fixtures still use old memory/sequencer APIs; checkpoint 4 owns their migration.
- `examples/sea-counter` and `sea-benchmarks/src/main.rs` still use old storage/session APIs and wrapper facets; checkpoint 5 owns those consumers.
- Old backends, old conformance entry points, and old wrapper trait implementations therefore cannot yet be removed without crossing checkpoint scope. Checkpoint 5 owns final deletion after these consumers migrate.
- The shared replacement engine is already independent of those old backends. No compatibility adapter or format fallback was added.

Stop for checkpoint-3 review.
After explicit approval, verify the accepted commit and begin checkpoint 4 at `sea-webtransport-server/src/host.rs`, replacing per-connection old stream ownership with document-scoped runtime ownership over the selected replacement factory.
Keep received identities separate from availability handles, and ask before any material protocol/session contract decision not already approved.
Sequential execution remains authorized; no parallel iteration has been created.
