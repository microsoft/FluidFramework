# Iteration 0019: foundations Report

Status: Wave 2 FND-CA-001 rejected; revert validated and independently reviewed; no accepted source checkpoint
Branch: `rust-service-iteration-0019-foundations`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0019-foundations`
Kickoff commit: `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475`
Iteration source recorded by the charter: `575b77e825e598b15b7740f56956fe433a6153d8`
Final commit: the report-only checkpoint commit containing this completed report; hash recorded during integration
Agent or owner: foundations workstream; GitHub Copilot sub-agent
Model and tool version: model unknown; repository file-read and patch tools
Instruction source: [foundations instructions](instructions/foundations.md), read from the assigned worktree
Session or transcript reference: parent-coordinated Wave 1 delegation; no independent transcript reference
Started and finished: started 2026-09-24T06:38:22Z; finished timestamp unavailable
Registered task labels: `rs0019 foundations test`; `rs0019 foundations format`

## Outcome

Completed full current-state discovery and assessment for `sea-core`, `sea-memory`,
`sea-content-addressed`, and `sea-conformance` under the Conservative profile for
documentation, tests, implementation, abstractions, code organization, and naming.
All source modules, manifests, crate guides, the Rust-service development guide, the
iteration charter and inventory, and inherited 0018 foundations quality boundaries were
examined.

Eight material hypotheses were assessed.
Checkpoint review rejected the initially selected directory-encoding candidate.
One naming candidate and one small lower-ranked abstraction candidate remain deferred, one
optimization-shaped candidate is blocked under the no-performance-change constraint, and five
were rejected or found already proportionate.
Wave 1 made no production, test, guide, instruction, or shared-record edit.
Wave 2 selected only FND-CA-001.
Checkpoint review found a blocking performance regression, and repair cycle 1 restored the
production source exactly; only this report remains as the workstream result.

## Area and Responsibility Coverage

| Member / responsibility | Owner, consumers, platforms | Evidence examined | Coverage and result |
| --- | --- | --- | --- |
| `sea-core`: value identities and codecs | Core owns `EventPosition`, `SessionId`, blob/tree identities and canonical directory encoding. All storage, session, transport, WASM, and persistence implementations consume them on native and `wasm32`. | [`archive.rs`](../../../../crates/sea-core/src/archive.rs), [`blob.rs`](../../../../crates/sea-core/src/blob.rs), inherited `foundations-core-identities` and `foundations-core-content-codec`. | Reviewed in all categories. Codec implementation is compact and its apparently repetitive fixed-width parsing preserves distinct error locations. No change beyond FND-CA-001 in a consuming crate. |
| `sea-core`: monitored streams | Core owns progress normalization, boxing, and mapping. Memory, sequencer, transports, and decorators consume it on native and browser targets. | [`monitored_stream.rs`](../../../../crates/sea-core/src/monitored_stream.rs), inherited `foundations-core-progress` and `foundations-core-stream-map`. | Reviewed in all categories. FND-CORE-001 rejected; platform duplication is the direct expression of different `Send` contracts. |
| `sea-core`: storage traits and composed view | Core owns component contracts, availability capabilities, invalidation, batch defaults, load selection, and `SeaView` publication order. Every backend and sequencer consumes them on native and browser targets. | [`storage/mod.rs`](../../../../crates/sea-core/src/storage/mod.rs), all seven storage submodules, [`storage/tests.rs`](../../../../crates/sea-core/src/storage/tests.rs), inherited invalidation/view/batch/load/contract-only rows. | Reviewed in all categories. FND-CORE-002 and FND-CORE-003 rejected; the thin traits and permissive fixture have distinct ownership and diagnostic purposes. |
| `sea-core`: session and signal contracts | Core owns facet separation, author lifecycle, snapshot authority, signal delivery, error classes, durability, and platform bounds; concrete session/signal crates implement them. | [`session.rs`](../../../../crates/sea-core/src/session.rs), [`signals.rs`](../../../../crates/sea-core/src/signals.rs), [`lib.rs`](../../../../crates/sea-core/src/lib.rs), [`snapshot.rs`](../../../../crates/sea-core/src/snapshot.rs), inherited contract-only and snapshot-position rows. | Reviewed in all categories. No concrete policy is redundantly implemented here. Contract prose is necessarily detailed and links implementation owners; no Conservative reduction was found. |
| `sea-memory`: registry, openings, handles, and recovery | Memory owns process-local identity allocation, exclusive writer leases, data-only handles/streams, reopening validation, and error classification. Local storage users and conformance consume it on native and `wasm32`. | [`document.rs`](../../../../crates/sea-memory/src/document.rs), inherited memory ownership, recovery, invalidation/error, and checkpoint rows. | Reviewed in all categories. Ownership layers correspond to separately tested lifetime guarantees. FND-MEM-003 rejected. |
| `sea-memory`: blobs, events, snapshots, checkpoints | Memory owns immutable content closure, synchronous append/batch settlement, sparse snapshot selection, and opaque checkpoint replacement. `SeaView`, sequencer, and tests consume them on native and browser targets. | [`document.rs`](../../../../crates/sea-memory/src/document.rs), inherited content, event-order, batch-prefix, snapshots, and checkpoint rows. | Reviewed in all categories. FND-MEM-001 remains a small candidate; FND-MEM-002 rejected because scalar and batch paths have intentionally different locking/wakeup semantics. |
| `sea-memory`: bounded/live archive reads | Memory owns lazy bound validation, sparse range traversal, progress, waker replacement, cancellation, and reopen-surviving retained data. Event and snapshot archives consume it on native and browser targets. | [`memory_archive.rs`](../../../../crates/sea-memory/src/memory_archive.rs), inherited read-range and live-read rows. | Reviewed in all categories. The explicit state flags map to independently observable phases; no removable state or fixture duplication was established. |
| `sea-content-addressed`: object engine and namespace durability | Content store owns bounds, canonical identity verification, staging/hard-link publication, cleanup, namespace creation, and filesystem synchronization. Standalone filesystem users and `BlobStore` consumers use it on supported host filesystems. | [`lib.rs`](../../../../crates/sea-content-addressed/src/lib.rs), inherited integrity, staging, acknowledgment-sync, namespace-durability, classification, and platform-qualification rows. | Reviewed in all categories. FND-CA-001 was rejected after checkpoint review exposed changed pre-hash rejection behavior. Publication branches remain distinct because their ownership and synchronization failure modes differ. |
| `sea-content-addressed`: availability adapter and closure traversal | The adapter owns canonical-namespace provenance, transitive verification, missing-root versus corrupt-descendant classification, and handles without writer leases. `SeaView` and storage clients consume it on host platforms. | [`storage.rs`](../../../../crates/sea-content-addressed/src/storage.rs), inherited tree-availability and provenance rows. | Reviewed in all categories. FND-CA-002 is plausible but deferred because it changes filesystem-read performance and complicates classification. |
| `sea-conformance`: view laws | Conformance owns implementation-independent successful publication, opening, range, snapshot/load, and reopening checks. Memory and file backends invoke it on their supported host platforms. | [`run_view_conformance`](../../../../crates/sea-conformance/src/lib.rs), helpers, guide, inherited oracle-scope row. | Reviewed in all categories. FND-CONF-001 rejected: overlap with snapshot conformance proves a different composition boundary. |
| `sea-conformance`: raw snapshot and session laws | Conformance owns sparse snapshot archive laws and two-membership session workflow evidence. Storage backends and session/decorator implementations invoke it on supported runtime targets. | [`run_snapshot_archive_conformance`](../../../../crates/sea-conformance/src/lib.rs), [`run_session_conformance`](../../../../crates/sea-conformance/src/lib.rs), guide and inherited oracle-scope row. | Reviewed in all categories. Workflow-local repetition keeps expectations and failures visible; no shared fixture or table conversion would clearly improve diagnosis. |

## Six-Category Accounting

| Member | Documentation | Tests | Implementation | Abstractions | Code organization | Naming |
| --- | --- | --- | --- | --- | --- | --- |
| `sea-core` | Already proportionate: README gives consumer entry points while module docs own precise laws. | Already proportionate: codec/stream unit tests and permissive view fixtures discriminate separate owner decisions. | No accepted candidate; FND-CORE-001 rejected. | FND-CORE-002 rejected; component traits and handles encode real ownership boundaries. | Storage submodules group one trait/responsibility each; no needless file or export layer found. | Public names consistently distinguish archive, storage, session, signal, and snapshot responsibilities; API renames are disallowed. |
| `sea-memory` | Already proportionate: guide states backend-specific ownership, bounds, and lifetime behavior not supplied by core. | FND-MEM-003 rejected; the large local suite requires private-state corruption/lifetime access and preserves diagnostic locality. | FND-MEM-001 candidate; FND-MEM-002 rejected. Reader state was retained because each flag controls a distinct observable phase. | Opening, retained document, stored snapshot, and handle types correspond to distinct lease/provenance cycles. | The production/read split is coherent; moving private-state tests would add navigation without deleting a mechanism. | FND-NAME-001 applies to obsolete migration wording; public `Memory*` names accurately describe ownership. |
| `sea-content-addressed` | Guide and module docs deliberately separate durable object mechanics from trait-level closure/provenance; no duplicated normative text was safe to delete. | Focused filesystem-failure tests and adapter tests prove distinct layers; no fixture extraction clearly improves diagnosis. | FND-CA-001 candidate; FND-CA-002 deferred. Publication cleanup/sync branches are contract-significant. | Direct object engine plus `BlobStore` adapter is justified by standalone and capability consumers. | `lib.rs` owns filesystem mechanics and `storage.rs` owns the trait adapter; no move improves ownership. | FND-NAME-001 applies to obsolete “replacement” module wording; public names are precise. |
| `sea-conformance` | Already proportionate after 0018 corrected positive versus negative coverage claims. | FND-CONF-001 rejected; suites overlap only where two distinct boundaries need the same law. | Helpers are minimal and do not hide assertions; no candidate. | Generic aliases and `next_data` reduce type/progress noise without creating policy. | One small module keeps complete workflows discoverable; splitting would add navigation. | Suite names match their owning boundary; no candidate. |

## Candidate Assessments

Candidates are ranked for Wave 2 by expected mechanism reduction, confidence, risk,
validation strength, and displaced complexity.
“Cheapest disproof” is the first check to perform before any edit.

### FND-CA-001 — single-pass directory encoding during publication (rank 1)

- **Primary category/profile:** Implementation, Conservative.
- **Responsibility and evidence:** `ContentStore::put_directory` calls
  `BlobDirectory::encode()` and then `BlobDirectory::id()`, whose implementation calls
  `encode_with_id()` and therefore encodes the same directory again.
  The duplicate work is on the same immutable input and cannot legitimately diverge.
- **Owner / consumers / platforms:** `sea-content-addressed` object publication; direct
  `ContentStore` callers and its `BlobStore` adapter; supported host filesystems.
- **Exact contract and nearest evidence:** [`ContentStore::put_directory`](../../../../crates/sea-content-addressed/src/lib.rs)
  must bound and durably publish canonical bytes under their matching identity.
  `rejects_directory_bounds_and_corruption`, `rejects_directory_identity_mismatch`,
  `blobs_and_directories_reopen_and_verify`, and inherited
  `foundations-content-integrity-bounds` discriminate the byte/identity relationship.
- **Falsifiable hypothesis:** replacing the separate `encode()` plus `id()` calls with one
  `encode_with_id()` removes a redundant canonical-encoding pass without changing bytes,
  identity, errors, I/O order, durability, API, or platform behavior.
- **Cheapest disproof:** inspect whether `encode_with_id()` returns the same error domain and
  whether any test or caller relies on two encoding attempts; then run the existing directory
  bound, reopen, and identity-mismatch tests.
- **Benefit:** one authoritative encoding result per publication, less CPU/allocation work, and
  no chance that later edits make persisted bytes and the computed identity use different paths.
- **Displaced complexity / supporting edits:** none expected in production; no test or
  documentation change should be needed because behavior and contract stay fixed.
- **Proposed disposition:** **rejected after checkpoint review**.
- **Revisit trigger:** a public core API that hashes already-encoded canonical directory bytes,
  separately approved API/dependency work, or removal of the pre-hash size-rejection contract.

#### FND-CA-001 Wave 2 checkpoint

- **Planned checkpoint base:** `50114459e5b`, the coordinator-observed discovery-report HEAD;
  no commit was created.
- **Primary category/profile:** Implementation, Conservative.
- **Supporting edits:** this report only after repair cycle 1. No tests, public documentation,
  APIs, dependencies, protocols, generated bindings, platform branches, or manifests changed.
- **Before responsibility:** `ContentStore::put_directory` separately asked
  `BlobDirectory::encode` for persisted bytes and `BlobDirectory::id` for their identity;
  `id` delegated to `encode_with_id`, causing a second canonical encoding of the same immutable
  value.
- **Attempted responsibility:** `BlobDirectory::encode_with_id` produced the canonical
  byte/identity pair before `ContentStore` checked its configured size.
- **Final responsibility after revert:** the baseline responsibility is restored:
  `ContentStore` obtains canonical bytes, rejects them when they exceed
  `max_directory_bytes`, and only then asks `BlobDirectory::id` to hash/identify accepted bytes.
- **Preserved contract and independent evidence:** the 0018
  `foundations-content-integrity-bounds` boundary remains unchanged: directory publication
  enforces the configured canonical-byte limit and stores bytes under their matching,
  domain-separated identity. Existing independent tests
  `rejects_directory_bounds_and_corruption`, `rejects_directory_identity_mismatch`, and
  `blobs_and_directories_reopen_and_verify` retain their literal limits, filesystem mutations,
  reopen behavior, and expected identities; no expectation is derived from the changed call path.
- **Checkpoint review finding:** blocking **Medium** performance regression. The attempted
  `encode_with_id` call hashed an oversized canonical directory before
  `max_directory_bytes` rejection, whereas the fixed-base implementation rejected after encoding
  and before hashing. Existing tests checked the error and exact boundary but did not discriminate
  whether hashing occurred.
- **Repair-cycle investigation:** no existing public API hashes an already-encoded
  `BlobDirectory`. `BlobDirectoryId` construction, `DIRECTORY_DOMAIN`, and `domain_hash` are
  private to `sea-core`; `BlobDirectory::id` necessarily re-encodes. Preserving pre-hash rejection
  with current APIs therefore restores the original `encode`, size check, then `id` sequence.
  Exporting a constructor/hash function would be a forbidden public API change; duplicating BLAKE3
  and its domain in this crate would require a forbidden dependency and duplicate protocol policy;
  adding an abstraction would not be Conservative.
- **Concrete maintenance benefit:** none demonstrated under the approved constraints.
  The apparent duplicate encoding cannot be removed with the existing API while preserving the
  rejection-order contract.
- **Displaced-complexity check:** production is restored exactly rather than moving hashing,
  duplicating a protocol constant, adding a dependency/helper, or accepting changed work for
  oversized input. No focused test was added because no production change survives; the review
  finding records the missing discriminator for any future revisit.
- **Validation:** the prior coordinator tasks passed the attempted implementation at HEAD
  `50114459e5b` but did not detect the review finding. Post-revert coordinator validation at the
  same fixed base passed and proved that production matches the base; see
  [Validation Evidence](#validation-evidence).

### FND-NAME-001 — remove obsolete “replacement” terminology (rank 2)

- **Primary category/profile:** Naming, Conservative.
- **Responsibility and evidence:** `sea-memory` begins with “replacement storage contracts,”
  `sea-content-addressed::storage` says “replacement blob-store capabilities,” and the private
  memory test is named `replacement_storage_conformance`.
  The current crate guides and public API no longer define a replacement/legacy pairing, so the
  modifier supplies no responsibility or consumer distinction.
- **Owner / consumers / platforms:** foundations-owned module documentation and one private test;
  maintainers on all compiled targets. No public symbol, serialization, or generated consumer.
- **Exact contract and nearest evidence:** the current [`sea-memory` guide](../../../../crates/sea-memory/README.md)
  calls `MemoryStorage` the reference implementation; the
  [`sea-content-addressed` guide](../../../../crates/sea-content-addressed/README.md) describes
  the immutable object engine directly. `replacement_storage_conformance` invokes both inherited
  storage suites and discriminates no naming behavior.
- **Falsifiable hypothesis:** deleting “replacement” from module prose and renaming the private
  test to `storage_conformance` makes ownership current and unambiguous without changing meaning,
  discovery, or executable cases.
- **Cheapest disproof:** search the current repository for an active old/new storage distinction
  or tooling that selects the private test by exact name.
- **Benefit:** removes stale migration context and a misleading implied alternative.
- **Displaced complexity / supporting edits:** documentation wording is necessary support for the
  private test rename; no production or shared-record edit.
- **Proposed disposition:** **deferred pending Wave 2 selection**.
- **Revisit trigger:** confirmation of a still-supported legacy/replacement distinction, or Wave 2
  naming selection.

### FND-MEM-001 — remove the one-use `PrehashedBlob` wrapper (rank 3)

- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility and evidence:** the private `PrehashedBlob` type only transports an already
  computed `BlobId` beside `Bytes` from `MemoryBlobStore::put_blob` to
  `BlobStorageData::put_blob`. It has one constructor and one consumer.
- **Owner / consumers / platforms:** `sea-memory` blob publication; memory storage callers on
  native and browser targets.
- **Exact contract and nearest evidence:** the guide requires content deduplication and hashing
  before acquiring the shared data lock. `content_publication_preserves_closure_and_deduplicates`,
  `blob_handles_check_document_provenance_and_closure`, and inherited
  `foundations-memory-content` protect identity, closure, and deduplication.
- **Falsifiable hypothesis:** compute the ID before locking and pass `(BlobId, Bytes)` directly,
  deleting a private type and impl while preserving lock scope.
- **Cheapest disproof:** compare the pre/post lock boundary and call count; reject if the rewrite
  hashes under the lock or makes the call site less clear.
- **Benefit:** removes one single-use concept and its destructuring without changing state.
- **Displaced complexity / supporting edits:** tuple/parameter plumbing moves two fields to the
  method signature; direct unit-test call sites need mechanical updates.
- **Proposed disposition:** **deferred, lower priority**. The reduction is real but small and may
  not justify one of four repair slots.
- **Revisit trigger:** Wave 2 has spare budget after higher-value candidates, or blob publication
  is otherwise edited.

### FND-CA-002 — avoid repeated closure verification (rank 4)

- **Primary category/profile:** Implementation, Conservative assessment; repair currently outside
  constraints.
- **Responsibility and evidence:** `ReferenceableStore::resolve` verifies the root once to
  distinguish absence, then `verify_tree` reads it again. `BlobStore::put_directory` invokes a
  fresh traversal for each direct child, so shared subtrees reachable through multiple children
  can be reread despite the adapter's “visiting shared subtrees once” explanation.
- **Owner / consumers / platforms:** `sea-content-addressed` availability adapter; view/content
  consumers on host filesystems.
- **Exact contract and nearest evidence:** [`storage.rs`](../../../../crates/sea-content-addressed/src/storage.rs)
  distinguishes absent root from corrupt missing descendant and verifies all reachable bytes.
  `trait_publication_and_resolution_validate_transitive_content`,
  `closure_provenance_reopen_and_missing_dependency`, and inherited
  `foundations-content-tree-availability` protect those classifications.
- **Falsifiable hypothesis:** one traversal with a shared visited set can retain root/descendant
  classification while eliminating duplicate filesystem reads.
- **Cheapest disproof:** instrument object reads for an absent root, missing grandchild, corrupt
  child, and a diamond/shared-subtree tree; reject if one traversal needs more branching or loses
  an exact error classification.
- **Benefit:** potentially one clear closure verifier and fewer repeated reads.
- **Displaced complexity / supporting edits:** the traversal must track root depth or accept
  preverified objects, adding state; a focused read-count test would be needed. It also changes a
  performance characteristic, which the charter does not authorize.
- **Proposed disposition:** **deferred**; do not select without explicit performance authorization
  and evidence that the implementation becomes simpler rather than merely faster.
- **Revisit trigger:** approved performance work, measured repeated-I/O cost, or closure traversal
  changes for another reason.

### FND-CORE-001 — unify native and browser monitored-stream definitions (rank 5)

- **Primary category/profile:** Code organization, Conservative.
- **Responsibility and evidence:** `BoxMonitoredStream`, `boxed_monitored_stream`, and
  `map_monitored_stream` have parallel `cfg` definitions differing mainly in `Send` bounds.
- **Owner / consumers / platforms:** `sea-core`; native and `wasm32` stream consumers.
- **Exact contract and nearest evidence:** [`SessionBounds`](../../../../crates/sea-core/src/lib.rs)
  and monitored-stream aliases deliberately require `Send` natively but permit browser-local
  ownership. Existing monitored-stream unit tests protect mapping/progress, while platform builds
  protect the bound distinction.
- **Falsifiable hypothesis:** a helper abstraction or macro could express the common body once
  without weakening either platform bound.
- **Cheapest disproof:** attempt to state one stable-Rust signature that conditionally includes
  `Send`; if it requires a macro, duplicated helper traits, or broader bounds, the abstraction has
  displaced rather than removed complexity.
- **Benefit:** fewer visually duplicated bodies.
- **Displaced complexity / supporting edits:** conditional-bound machinery or macros obscure public
  signatures and diagnostics; both target builds would be required.
- **Proposed disposition:** **rejected**. The duplication is small, mechanically aligned, and makes
  the platform guarantee explicit.
- **Revisit trigger:** stable language support for conditional trait bounds or a new platform
  requiring a third copy.

### FND-MEM-002 — share scalar and batch event append mechanics (rank 6)

- **Primary category/profile:** Implementation, Conservative.
- **Responsibility and evidence:** `MemoryEventArchive::append` and `append_batch` repeat ordinal
  allocation, entry construction, handle construction, and reader waking.
- **Owner / consumers / platforms:** `sea-memory` event archive; view/session consumers on native
  and browser targets.
- **Exact contract and nearest evidence:** the guide requires scalar synchronous settlement and a
  batch published under one archive lock with one post-lock wake. The inherited event-order and
  batch-prefix rows point to `cancelled_appends_have_no_detached_work_and_concurrent_appends_are_distinct`
  and `exhausted_batch_retains_and_notifies_only_its_successful_prefix`.
- **Falsifiable hypothesis:** one helper could remove repeated allocation/insertion code.
- **Cheapest disproof:** require the helper to preserve exactly one lock acquisition and final wake
  for the batch while leaving scalar settlement obvious.
- **Benefit:** modest local deduplication.
- **Displaced complexity / supporting edits:** a helper must return readers and partial errors or
  operate under a caller-held lock, making ownership and wake timing less visible.
- **Proposed disposition:** **rejected**. Similar syntax implements distinct atomicity and
  notification contracts; inline duplication is clearer.
- **Revisit trigger:** a third append mode or a demonstrated bug caused by the repeated mechanics.

### FND-CORE-002 — remove the thin `StorageSurface` supertrait (rank 7)

- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility and evidence:** `StorageSurface` contains only the associated classified error
  type and is implemented by each component.
- **Owner / consumers / platforms:** public `sea-core` storage API and every backend on all targets.
- **Exact contract and nearest evidence:** storage components must share one classified backend
  error through `SeaStorage`; all inherited storage boundaries and concrete classification tests
  rely on this type relationship.
- **Falsifiable hypothesis:** moving `type Error` into each storage trait would remove a layer.
- **Cheapest disproof:** expand the resulting generic bounds for `Archive`, `BlobStore`,
  `ReferenceableStore`, `CheckpointStore`, `SeaStorage`, and `SeaView`.
- **Benefit:** one trait name removed.
- **Displaced complexity / supporting edits:** duplicates the associated type and equality bounds
  across public traits, touches every implementation, and is a forbidden public API change.
- **Proposed disposition:** **rejected** as false simplification and out of scope.
- **Revisit trigger:** a separately approved public storage-API redesign.

### FND-CORE-003 / FND-MEM-003 / FND-CONF-001 — fixture and test consolidation (rank 8)

- **Primary category/profile:** Tests, Conservative.
- **Responsibility and evidence:** core's permissive `SeaView` fixture, memory's private-state tests,
  and conformance's successful-path workflows repeat storage setup and some snapshot assertions.
- **Owner / consumers / platforms:** each owning crate's test layer; backend and session
  implementers consume conformance separately.
- **Exact contract and nearest evidence:** inherited `foundations-core-view-publication`,
  `foundations-core-batches`, every memory owner-local row, and
  `foundations-conformance-oracle-scope` distinguish composition, concrete implementation, and
  substitutability evidence.
- **Falsifiable hypothesis:** shared fixtures or removing overlapping assertions could reduce setup
  without losing behavioral cases or diagnosis.
- **Cheapest disproof:** map each proposed removed assertion to a surviving test that fails when
  only its owning layer regresses. Core's permissive backend catches omitted composition checks;
  memory can corrupt private state; conformance is implementation-independent. No surviving layer
  substitutes for either of the others.
- **Benefit:** fewer test lines only; no responsibility or mechanism would be removed.
- **Displaced complexity / supporting edits:** a cross-crate fixture adds coupling, hides expected
  values, and weakens failure locality; moving memory tests adds navigation while still needing
  private access.
- **Proposed disposition:** **rejected / already proportionate**. Distinct test layers are
  intentional, and no shared fixture is authorized.
- **Revisit trigger:** an inherited test is proposed for removal, a suite ceases to discriminate
  its owner, or repeated setup causes an observed maintenance defect.

## Hypothesis Results

- Supported: one exact duplicate computation (FND-CA-001), obsolete migration naming
  (FND-NAME-001), and one small single-use wrapper (FND-MEM-001).
- Plausible but blocked: repeated filesystem verification (FND-CA-002) may be reducible, but the
  cheapest safe design and performance authorization are absent.
- Falsified: native/browser stream duplication, scalar/batch append similarity, the thin public
  storage supertrait, and cross-layer test overlap do not establish accidental complexity.
- No additional material candidate was found in session/signal contracts, memory reader state,
  storage submodule organization, conformance helpers, manifests, or crate guides.

## Behavioral Contracts and Test Layers

Wave 1 changed no behavior.
The inherited 0018 inventory supplies the nearest discriminating evidence named above:
core codec/progress/view tests own pure and composed decisions; memory tests own provenance,
lifetime, recovery, bounds, notifications, and settlement; content tests own filesystem and
closure/error paths; conformance owns successful substitutability.
No inherited test is proposed for removal.
No candidate derives an expected value from production logic.
FND-CA-001 was rejected because those tests did not distinguish hashing before an oversized-input
rejection; production was restored to the fixed-base ordering.
If FND-NAME-001 is selected, only test discovery/name and preserved prose meaning require checking.

## Validation Evidence

Wave 1 ran **no commands**, as explicitly required.
No terminal, task, build, test, formatter, linter, documentation checker, or Git command was run.

After the FND-CA-001 edit, the directly available `runTask` tool was used as the task-discovery
and access probe required by the workstream instructions.
Invoking `rs0019 foundations format` returned
`Task not found: rs0019 foundations format`.
Invoking `rs0019 foundations test` returned
`Task not found: rs0019 foundations test`.
No terminal fallback was used by this agent.

The coordinator subsequently ran both assigned tasks in the guarded foundations worktree at HEAD
`50114459e5b`.
`rs0019 foundations format` passed with only
`rust-service/crates/sea-content-addressed/src/lib.rs` and this report dirty; formatter execution
introduced no out-of-scope path.
`Cargo.lock` remained absent from status.
`rs0019 foundations test` passed with:

- `sea-content-addressed`: 13 tests;
- `sea-core`: 21 tests;
- `sea-memory`: 31 tests;
- `sea-conformance`: 0 standalone tests;
- total: 65 tests, 0 failures.

These results preserve the inherited independent directory bounds, identity mismatch, corruption,
reopen, closure, and conformance evidence, but they apply to the now-reverted attempted
implementation and did not discriminate the blocking pre-hash rejection regression.

After checkpoint review, repair cycle 1 restored
`rust-service/crates/sea-content-addressed/src/lib.rs` to the fixed-base implementation.
No command was run by this agent.
The coordinator then reran guarded validation at fixed base `50114459e5b`.
`rs0019 foundations format` passed and showed only this report dirty;
`rust-service/crates/sea-content-addressed/src/lib.rs` exactly matched the base, and `Cargo.lock`
was absent from status.
`rs0019 foundations test` passed 65 total tests with 0 failures:
13 `sea-content-addressed`, 21 `sea-core`, 31 `sea-memory`, and 0 standalone
`sea-conformance`.
FND-CA-001 remains rejected, and no accepted source checkpoint exists.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Source provenance mismatch | Assigned instruction/charter records source `575b77e…`, while the user supplied kickoff `7b56e89…`. | Both values are present in the read-only records/request; no Git command was permitted to resolve them. | Candidate evidence is tied to the assigned worktree contents, but commit identity needs coordinator reconciliation before repair. | Recorded both; Wave 2 must use the user-specified kickoff unless the coordinator resolves otherwise. | Preserve declared and observed provenance separately when checkout verification is prohibited. |
| False-sharing rejection | Similar append code and overlapping storage tests initially looked consolidatable. | Different lock/wake atomicity and distinct core/backend/conformance mutation points. | Prevented helper and fixture abstractions that would hide guarantees. | FND-MEM-002 and rank-8 fixture candidates rejected. | First map the failure each copy localizes; syntax similarity is insufficient. |
| Assigned tasks initially unavailable | Both required `runTask` labels returned `Task not found` to this agent after the edit. | Direct agent `runTask` results; later coordinator runs passed at `50114459e5b`. | Autonomous validation stopped before terminal fallback; coordinator validation was required. | Resolved: formatter and 65 tests passed, only owned files were dirty, and `Cargo.lock` was absent from status. | Probe assigned task access before claiming an autonomous validation path, and stop when the registered labels are absent. |
| Blocking checkpoint finding | Review found that `encode_with_id` hashes oversized canonical bytes before the configured limit rejects them. | Fixed-base order was encode, length check, then `id`; existing tests asserted the error but not hashing order. | FND-CA-001 failed behavior/performance preservation at Medium severity. | Repair cycle 1 found no permitted existing API, reverted production exactly, rejected the candidate, and passed post-revert format/status plus 65 tests. | Treat rejection ordering before expensive work as observable performance behavior; test success alone does not prove it. |
| Repair re-review | Fresh standard-depth review inspected repair-cycle patch `0a129127634a070772390d3685513c494ad87b926a525f59f672231a223fcfd9`. | Production matched fixed base; only this report remained changed. | Verified the blocking finding was resolved by rejection rather than displaced. | No actionable findings; no accepted source repair. | A rejected checkpoint still needs complete evidence that the attempted source change is gone. |

## Contract and Integration Friction

- FND-CA-002 would affect filesystem-read performance and therefore needs explicit authorization.
- FND-CORE-002 is a public cross-crate API change and is excluded.
- No shared helper, manifest, lockfile, generated binding, protocol, or cross-workstream edit was
  introduced.
- The kickoff/source mismatch must be reconciled before a fixed-base checkpoint.

## Human Interventions

The user fixed the worktree, branch, kickoff, four-member scope, Conservative profile, full Wave 1
coverage, allowed output file, task labels, and prohibition on commands, edits outside this report,
and commits.
No further human intervention occurred.

## Measurements

No performance, source-size, dependency, or timing measurement was requested.
Checkpoint review nevertheless identified a qualitative performance regression in rejected
FND-CA-001: hashing work moved before oversized-input rejection.
Candidate count is descriptive only: eight assessments, including grouped test-layer hypotheses;
one deferred naming candidate, one small lower-ranked abstraction candidate, one blocked
candidate, and five rejected/already-proportionate outcomes.

## Proposed Decisions

FND-CA-001 was selected, failed checkpoint review, and was rejected after an exact production
revert.
Select FND-NAME-001 only if a naming-only checkpoint is worth a repair slot.
Retain FND-MEM-001 as a low-cost reserve.
Do not select FND-CA-002 without explicit performance authorization.
Do not fill the vacated repair budget without a new coordinator selection.
No shared decision record is proposed.

## Candidate Skills and Process Changes

None.
The existing simplification guidance correctly forced separate contract/test-layer mapping and
prevented false consolidation.

## Remaining Work and Risks

Wave 1 foundations coverage is complete.
FND-CA-001 was the only selected Wave 2 repair; its production change is fully reverted, and the
candidate is rejected.
Coordinator revalidation passed at fixed base `50114459e5b`, with only this report dirty,
production exactly matching the base, `Cargo.lock` absent, and all 65 tests passing.
No accepted source checkpoint exists, and no replacement candidate is
authorized. The report-only evidence checkpoint is ready for integration.
