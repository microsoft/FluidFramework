# Iteration 0019: sessions Report

Status: Wave 1 discovery and assessment complete; no repair selected or performed
Branch: `rust-service-iteration-0019-sessions`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0019-sessions`
Base commit: user-specified kickoff `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475`
Final commit: none; Wave 1 forbids commits
Agent or owner: sessions workstream agent
Model and tool version: model unknown; repository file-search and file-edit tools
Instruction source: [sessions instructions](instructions/sessions.md), read from the assigned checkout; that generated file and the shared charter still name `575b77e825e598b15b7740f56956fe433a6153d8`, while the direct assignment supersedes them with kickoff `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475`
Session or transcript reference: none
Started and finished: started 2026-09-24T06:38:22Z; finished 2026-09-24, exact time unknown

## Outcome

Completed full Conservative Wave 1 discovery and assessment for
`sea-sequencer`, `sea-signals`, `sea-compression`, and `sea-encryption`.
All production modules, crate manifests and guides, owner-local tests, relevant
workspace guidance and known issues, and the inherited
[0018 quality inventory](../../0018/quality-inventory.md) were assessed.
Every crate and all six categories are accounted for below.

One small implementation candidate, [SESS-001](#sess-001), is suitable for
Wave 2 comparison.
One documentation consolidation, [SESS-002](#sess-002), is lower-ranked and
deferred.
The remaining material-looking similarities were rejected, excluded, or found
already proportionate because they encode distinct lifecycle, platform,
security, delivery, or diagnostic responsibilities.
In particular, compression and encryption wrappers must not be coupled merely
because their forwarding syntax is similar.
No code, tests, crate documentation, instructions, shared record, manifest,
lockfile, or generated artifact was changed.
Only this report was written.

Confidence is high for ownership and false-coupling conclusions because the
0018 inventory already supplies focused discriminators for every consequential
boundary.
Confidence in repair safety remains provisional until Wave 2 runs the recorded
checks.

## Hypothesis Results

- **Supported:** `EncryptionSession::submit` clones an owned
  `EventSubmission` before replacing only its payload.
  Moving the submission after encryption preparation can remove that clone
  without changing ordering or fail-stop state ([SESS-001](#sess-001)).
- **Supported but low priority:** `sea-compression/DEV.md` repeats package
  validation and coverage prose already owned by `rust-service/DEVELOPMENT.md`
  and the crate README, and its coverage summary is less complete
  ([SESS-002](#sess-002)).
- **Falsified:** syntactically parallel compression and encryption facet
  adapters are one shared responsibility.
  Encryption owns authenticated contexts, key-provider retention, nonce
  failure, and a clone-shared fail-stop author state; compression is stateless
  and owns zlib frame errors ([SESS-003](#sess-003)).
- **Falsified:** the matching compression/encryption integration-test shapes
  are redundant.
  Each independently observes raw stored bytes and its own transform and error
  boundary, which 0018 mutation evidence showed shared conformance does not
  discriminate ([SESS-004](#sess-004)).
- **Falsified:** exact-backing copies in sequencer admission and signal routing
  should share a helper.
  They enforce separate queue charges, ownership points, and dependency
  boundaries ([SESS-005](#sess-005)).
- **Falsified:** similar read and lifecycle loops in storage-backed reads,
  cache reads, append driving, signals, or encryption represent one lifecycle.
  Their cancellation, terminal-error, retention, and authority guarantees are
  intentionally different ([SESS-006](#sess-006)).
- **Falsified:** large owner modules alone justify file splitting.
  Splitting would add navigation and module edges without removing a state,
  algorithm, or responsibility ([SESS-007](#sess-007)).

## Complete Responsibility Map

| Crate or member | Responsibilities and mapped owners | Consumers and platforms | 0018 contract and nearest discriminating evidence |
| --- | --- | --- | --- |
| `sea-sequencer` | `codec.rs`: private application/membership envelopes and corruption checks. `checkpoint.rs`: exact applied boundary, durable floor, outstanding announcements, and ID reservations. `pipeline.rs`: bounded ordered admission, retained persistence futures, batching, cancellation, and settlement. `session.rs`: recovery, membership, reference floor, content facade, snapshots/publishers, close/shutdown, and public session facets. `storage_read.rs`: lazy membership-scoped backend read and synchronous progress preservation. `live_cache.rs` and `live_read.rs`: opt-in cache ownership, invalidation, revocation, replay handoff, progress, reclamation, and retained-work driving. `error.rs`: error identity and classification. `fault_tests.rs` and `live_cache_tests.rs`: deterministic owner-local seams. | Local and wrapped Sea sessions, storage implementations, native and WASM runtimes; cache remains explicitly experimental. | [Ordered append and recovery](../../../../crates/sea-sequencer/README.md#ordered-append-and-recovery), [minimum reference floor](../../../../crates/sea-sequencer/README.md#minimum-reference-floor), [internal checkpoints](../../../../crates/sea-sequencer/README.md#internal-checkpoints), delivery/cache/snapshot contracts. The inherited rows name focused tests including `capacity_wait_preserves_same_session_order_and_failure_prefix`, `failed_reconciliation_prevents_terminal_leave_until_recovery`, `recovery_rejects_inconsistent_floor_reservation_and_membership_metadata`, `concurrent_sessions_deliver_each_submission_once_with_lazy_errors_and_progress`, `snapshot_parent_position_and_publisher_fences_are_session_policy`, `historical_finite_load_and_missed_handoff_preserve_exact_delivered_cursor`, and `publication_and_readers_share_decoded_backing_without_another_payload_copy`. |
| `sea-signals` | `SignalLimits` and `SignalRoom`: room admission, membership snapshot, routing, bounded queues, cascading reliable overflow, and exact backing ownership. `Participant` and registration token: replacement-safe membership. `SignalConnection`: single-consumer receive, terminal wake, send, close, and drop. `LocalSignalService`: neutral document-bound factory. Tests cover all of these in the same module. | Authorized document hosts and native/WASM signal clients; transport supplies a distinct remote boundary. | [Signal relay contract](../../../../crates/sea-signals/README.md#contract) and core signal traits. `admission_rejects_invalid_limits_identity_metadata_and_capacity`, `document_scoped_routing_preserves_recipients_and_envelopes`, `reliable_departure_overflow_evicts_each_affected_member`, `cancelled_receive_preserves_messages_and_close_wakes_receive`, and the two oversized-backing tests discriminate admission, routing, overflow, lifecycle, and memory ownership. |
| `sea-compression` | `lib.rs`: one-frame zlib encode/decode and `CompressionError`. `session.rs`: lazy application-event decode, blob/event transformation, and explicit pass-through of directories, handles, loads, snapshots, publisher coordination, membership, close, progress, and underlying error kinds. README owns user behavior; `DEV.md` repeats local validation guidance. | Any `SeaArchive`/`SeaAuthorSession`/`SeaSnapshotCoordinator`, including sequencer, memory/conformance fixtures, and composition outside encryption. Native and WASM behavior is generic; flate2 uses the Rust backend. | [Compression behavior](../../../../crates/sea-compression/README.md#behavior). `rejects_truncated_and_extended_frames`, `payload_transforms_preserve_control_metadata_and_stored_tree_identities`, `load_and_coordination_forward_handles_fences_and_registration_lifetime`, and `malformed_stored_frames_are_corrupt_and_advance_delivery_progress`; shared conformance proves substitutability but not transform ownership. |
| `sea-encryption` | `lib.rs`: authenticated envelope format, event/blob domain separation, key and nonce contracts, redaction/zeroization, parsing, encryption/decryption, and stable error classification. `session.rs`: lazy decryption, ciphertext blob identity, capability forwarding, clone-shared serialized fail-stop append state, preparation failure/cancellation, membership and close barriers, snapshots, and composition tests. | Sessions using application-supplied key providers, OS or injected nonce sources, native/WASM consumers, and compression composition. | [Encryption envelope, keys, nonce, and lifecycle contract](../../../../crates/sea-encryption/README.md). `key_identifier_is_authenticated_even_when_two_identifiers_resolve_to_the_same_key`, `encrypted_payloads_preserve_control_metadata_and_stored_tree_identities`, `malformed_stored_envelopes_preserve_error_kind_and_delivery_progress`, `cancelled_preparation_terminates_clones_before_inner_append`, and `failed_key_preparation_closes_inner_author_and_wrapper_clones`; composition conformance remains a distinct layer. |

## Category Coverage

| Crate | Documentation | Tests | Implementation | Abstractions | Code organization | Naming | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-sequencer` | README and module comments retain needed local details for ordering, recovery, cache, floor, snapshots, and platform behavior. | Focused, fault, cache, and conformance layers prove distinct decisions; no safe case/assertion removal found. | Complex state and control flow correspond to documented cancellation, reconciliation, ordering, and resource guarantees. | Cache, pipeline, storage-read, publisher, checkpoint, and codec boundaries each own different state. | File boundaries follow those owners; splitting `session.rs` solely by size would not reduce concepts. | Public and private names identify responsibility; local abbreviations are conventional and documented. | No worthwhile Conservative repair beyond low-value [SESS-007](#sess-007); area is otherwise already proportionate. |
| `sea-signals` | README precisely separates ephemeral signals from archive operations and transport. | Eleven focused cases retain local diagnosis for routing, overflow, cancellation, replacement, and backing ownership. | The queue/terminal cascade is compact but necessary to make reliable membership failure observable. | Room, participant, connection, and service facade have separate ownership. | One source file keeps implementation and small focused suite local; a split adds navigation only. | `SignalRoom`, `SignalConnection`, `Participant`, and delivery terms align with contracts. | Already proportionate; [SESS-005](#sess-005) and [SESS-006](#sess-006) reject apparent sharing. |
| `sea-compression` | README is authoritative and complete; `DEV.md` is partly redundant. | Codec, raw/wrapped transform, forwarding, corruption/progress, and conformance tests prove distinct layers. | Stateless frame operations and explicit forwarding remain straightforward. | A dedicated wrapper is justified by transform ownership. | `lib.rs` owns codec/public API and `session.rs` owns facets; appropriate. | Names are clear; private `decode` is scoped enough to avoid ambiguity. | [SESS-002](#sess-002) deferred; cross-wrapper sharing rejected. |
| `sea-encryption` | README precisely documents lookup-before-authentication, terminal append semantics, and composition. | Envelope, key, nonce, redaction, transform, lifecycle, error, and composition evidence is non-overlapping. | One avoidable owned-value clone exists in `submit`; cryptographic and terminal control flow is otherwise required. | Key/nonce providers, encrypted session, and author terminal state represent distinct contracts. | Public envelope API and session facets are appropriately separated. | Public security names are precise; `decode_next` is private and documented. | [SESS-001](#sess-001) is the only high-confidence local repair candidate. |

## Assessed Candidates

### SESS-001

- **Rank:** 1 of 7.
- **Primary category/profile:** Implementation, Conservative.
- **Responsibility/owner:** `sea-encryption/src/session.rs`,
  `EncryptionSession::submit`.
- **Consumers/platforms:** all encrypted author-session callers and wrapper
  clones on native and WASM.
- **Direct evidence:** `submit` receives `EventSubmission` by value, calls
  `submission.clone()`, and replaces only
  `encoded.event.payload`.
- **Contract and nearest discriminating tests:** preserve independent fresh
  encryption, serialized authority, preparation-before-inner-append,
  terminal-on-error/cancellation, references and tree identity.
  Nearest tests are
  `equal_submissions_encrypt_independently_and_recheck_authority`,
  `cancelled_preparation_terminates_clones_before_inner_append`,
  `failed_key_preparation_closes_inner_author_and_wrapper_clones`, and
  `encrypted_payloads_preserve_control_metadata_and_stored_tree_identities`.
- **Falsifiable hypothesis:** encrypt the borrowed payload first, then move the
  owned submission into `encoded` and replace its payload; no
  `EventSubmission` clone is required.
- **Cheapest disproof:** compile the private method and run the four named
  encryption tests; any borrow failure, changed nonce count, changed raw
  envelope metadata, or changed terminal behavior disproves the candidate.
- **Expected benefit:** removes one unnecessary clone/refcount operation and
  makes ownership clearer at the transformation boundary.
- **Displaced complexity/supporting edits:** none expected; no test or
  documentation edit should be needed because behavior is unchanged.
- **Proposed disposition:** **deferred to Wave 2 selection**, recommended local
  repair.
- **Revisit trigger:** selection against the iteration's four-repair budget, or
  a future change to `EventSubmission` clone cost/fields.

### SESS-002

- **Rank:** 4 of 7.
- **Primary category/profile:** Documentation, Conservative.
- **Responsibility/owner:** `sea-compression/DEV.md`; developers of the
  compression crate.
- **Consumers/platforms:** contributors on all supported build hosts.
- **Direct evidence:** `DEV.md` repeats three package commands and a coverage
  summary while   the workspace [development guide](../../../../DEVELOPMENT.md)
  owns canonical gates and the crate README owns behavior and focused
  validation.
  Its short coverage sentence omits the newer raw-storage, capability,
  progress, and coordination tests.
- **Contract and nearest discriminating tests:** no runtime contract changes.
  Preserve the discoverable package command and links to canonical validation;
  repository documentation-link checking is the nearest safety evidence.
- **Falsifiable hypothesis:** replacing duplicated prose with a concise link to
  the workspace guide and crate README leaves one current validation owner
  without reducing local discoverability.
- **Cheapest disproof:** compare unique instructions in all three documents;
  if `DEV.md` supplies a required command or qualification available nowhere
  else, consolidation is unsafe.
- **Expected benefit:** reduces stale duplicated validation prose.
- **Displaced complexity/supporting edits:** a README link may be needed; that
  would remain documentation-only.
- **Proposed disposition:** **deferred**, below production simplification and
  unlikely to justify one of four repair checkpoints.
- **Revisit trigger:** the file becomes stale again, canonical package commands
  change, or documentation cleanup is selected after higher-value repairs.

### SESS-003

- **Rank:** 2 of 7 because the apparent duplication is broad, but rejected.
- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility/owner:** compression and encryption session facet adapters;
  cross-crate owner would be required for a common abstraction.
- **Consumers/platforms:** every wrapped archive/author/snapshot session on
  native and WASM.
- **Direct evidence:** both wrappers implement the same three Sea facets and
  contain similar `map_err`, load, directory, resolution, and coordination
  forwarding.
- **Contract and nearest discriminating tests:** each crate's
  `payload_transforms...`/`encrypted_payloads...`,
  `load_and_coordination...`, malformed-input tests, and conformance.
  Encryption additionally has key-provider clone, context authentication,
  nonce, and author fail-stop tests.
- **Falsifiable hypothesis:** a common forwarding adapter or macro would remove
  duplicated policy.
- **Cheapest disproof:** ask whether a forwarding change in one wrapper must
  make the other incorrect.
  It need not: compression is stateless and can only fail local preparation
  through zlib I/O, while encryption serializes clones and terminates authority
  on preparation failure or cancellation.
- **Expected benefit:** nominal source reduction only.
- **Displaced complexity/supporting edits:** would add a shared dependency,
  generic policy hooks or macros, cross-crate navigation, and coupled tests.
- **Proposed disposition:** **rejected as false coupling**.
- **Revisit trigger:** a core-owned, semantically specified transform-decorator
  contract is introduced for at least a third implementation; similar syntax
  alone is not a trigger.

### SESS-004

- **Rank:** 3 of 7 because the tests are visibly parallel, but rejected.
- **Primary category/profile:** Tests, Conservative.
- **Responsibility/owner:** compression and encryption owner-local integration
  fixtures.
- **Consumers/platforms:** maintainers diagnosing each transform wrapper;
  memory and sequencer are test fixtures.
- **Direct evidence:** both `session.rs` suites contain similarly shaped
  `next_event`, raw/wrapped payload-tree, and load/coordination tests.
- **Contract and nearest discriminating tests:** the paired transform and
  forwarding tests named in the responsibility map.
  The 0018 report records that bypassing compression in `put_blob` failed only
  the compression raw-boundary test, and omitting encryption header AAD failed
  only the aliased-key test while other tests passed.
- **Falsifiable hypothesis:** one shared fixture or conformance case can replace
  the parallel tests without losing cases or diagnosis.
- **Cheapest disproof:** map each raw assertion to its owning mutation.
  Compression observes a zlib frame and decoded payload; encryption observes
  nonce count, authenticated context, ciphertext identity, and key behavior.
  Shared conformance can pass under symmetric transform bypass.
- **Expected benefit:** fewer fixture lines.
- **Displaced complexity/supporting edits:** a new cross-crate test abstraction,
  dependency direction, parameterization, and less local failure output.
- **Proposed disposition:** **rejected as false coupling**.
  Retain the small duplicated setup and independent expected values.
- **Revisit trigger:** a core conformance suite gains raw-store hooks that
  preserve wrapper-specific independent assertions and equally localize
  failures.

### SESS-005

- **Rank:** 5 of 7.
- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility/owner:** `pipeline::retain_submission` and
  `sea-signals::retain_bytes`.
- **Consumers/platforms:** sequencer admission and signal room queues on native
  and WASM.
- **Direct evidence:** both copy a visible `Bytes` range into exact-sized
  backing, a similarity introduced by 0018's retained-memory repairs.
- **Contract and nearest discriminating tests:**
  `admitted_inputs_do_not_retain_oversized_caller_backing`,
  `retained_membership_does_not_pin_oversized_caller_allocations`, and
  `queued_messages_do_not_pin_oversized_caller_allocations`.
- **Falsifiable hypothesis:** a common helper would centralize required backing
  ownership.
- **Cheapest disproof:** compare owners and charging points.
  Sequencer copies one event only after ordered capacity admission and charges
  envelope allowance; signals copy four independently bounded fields before
  room retention/fanout.
  Neither correctness nor policy requires the implementations to evolve
  together.
- **Expected benefit:** only a few repeated conversion tokens.
- **Displaced complexity/supporting edits:** a new core API/dependency and
  cross-crate ownership for a representation detail.
- **Proposed disposition:** **rejected as false coupling**.
- **Revisit trigger:** `sea-core` adopts an explicit public exact-backing type
  required by multiple contracts, with measured evidence that centralization
  reduces rather than moves complexity.

### SESS-006

- **Rank:** 6 of 7.
- **Primary category/profile:** Abstractions, Conservative.
- **Responsibility/owner:** sequencer `StorageRead`, cache `Reader`,
  `Pipeline` retained driver and cooperative yield, encryption author terminal
  state, and signal connection terminal state.
- **Consumers/platforms:** readers, authors, cache subscribers, and signal
  receivers on native/WASM.
- **Direct evidence:** these mechanisms use superficially similar state enums,
  watch notifications, retained futures, terminal flags, and cooperative
  polling.
- **Contract and nearest discriminating tests:** all lifecycle rows inherited
  from 0018, especially
  `concurrent_sessions_deliver_each_submission_once_with_lazy_errors_and_progress`,
  `historical_finite_load_and_missed_handoff_preserve_exact_delivered_cursor`,
  `parked_control_driver_releases_guards_and_survives_another_cancelled_drainer`,
  `cancelled_preparation_terminates_clones_before_inner_append`, and
  `cancelled_receive_preserves_messages_and_close_wakes_receive`.
- **Falsifiable hypothesis:** a common lifecycle/state-machine helper can
  remove repeated phases.
- **Cheapest disproof:** compare cancellation and terminal ownership.
  Storage reads freeze backend progress on membership close; cache reads own a
  revocable retention claim and replay handoff; pipeline cancellation retains
  admitted backend work; encryption cancellation revokes author authority;
  signal receive cancellation must preserve queued data.
  These transitions must not agree.
- **Expected benefit:** apparent reduction in state-machine code.
- **Displaced complexity/supporting edits:** policy callbacks, generic state
  parameters, indirect wake behavior, and weaker local reasoning.
- **Proposed disposition:** **rejected as false coupling**.
  Also retain the two local cooperative-yield loops: one prevents receipt
  starvation and one retries cache handoff; their syntax may match, but their
  scheduling responsibilities can evolve independently.
- **Revisit trigger:** a formally specified shared cancellation primitive is
  added to `sea-core` and focused tests establish identical transition laws.

### SESS-007

- **Rank:** 7 of 7.
- **Primary category/profile:** Code organization, Conservative.
- **Responsibility/owner:** large `sea-sequencer/src/session.rs` and the
  single-file `sea-signals/src/lib.rs`.
- **Consumers/platforms:** crate maintainers.
- **Direct evidence:** implementation and owner-local tests make both files
  long; `session.rs` also owns several tightly interacting runtime facets.
- **Contract and nearest discriminating tests:** all inherited sequencer and
  signal rows; a mechanical move would need lossless accounting of comments,
  attributes, visibility, platform gates, and test discovery.
- **Falsifiable hypothesis:** moving tests or runtime sections into more files
  reduces maintenance complexity.
- **Cheapest disproof:** identify a responsibility with a better owner and a
  removed dependency edge.
  Tests use private state extensively, and production responsibilities already
  split into codec, checkpoint, pipeline, storage read, cache, and live read.
  A move removes no concept and adds navigation.
- **Expected benefit:** shorter files only.
- **Displaced complexity/supporting edits:** more modules, imports, visibility,
  and cross-file navigation.
- **Proposed disposition:** **excluded as low-value organization churn**.
- **Revisit trigger:** a responsibility becomes independently reusable, gains
  a stable narrow interface, or current ownership causes a demonstrated merge
  or navigation problem.

## Evidence-Backed No-Change Results

### `sea-sequencer`

- **Documentation:** the README's detail is required local contract, not
  duplicated tutorial prose.
  It distinguishes cache opt-in, storage-backed progress, ordered append,
  recovery, reference-floor, checkpoint, publisher, and membership behavior.
- **Tests:** focused module, fault-seam, cache, and conformance tests prove
  different owner decisions.
  Removing broad-looking tests would weaken either deterministic fault
  diagnosis or cross-implementation substitutability.
- **Implementation:** `Runtime`, `Pipeline`, `Pending`, `AppendGuard`,
  `Publishers`, `StorageRead`, and cache claims encode different ordering and
  lifetime phases.
  Their state is justified by the exact 0018 tests in the map.
- **Abstractions:** codec helpers are correctly reused by checkpoints because
  persisted membership semantics must agree.
  Cache and storage reads correctly remain separate.
- **Organization:** established module boundaries match owners.
- **Naming:** no private or public rename had enough benefit to justify churn;
  error variant names preserve caller-visible classification.

### `sea-signals`

- **Documentation:** current prose clearly rejects persistence, replay, archive
  authority, and cross-transport ordering assumptions.
- **Tests:** each routing, membership, overflow, cancellation, replacement, and
  memory case has a discriminating assertion and local failure site.
- **Implementation:** the `removed` worklist in `dispatch` is necessary because
  reliable departure notification can overflow additional receivers.
  The separate terminal watch is necessary because a full data queue cannot
  carry its own failure.
- **Abstractions:** `SignalRoom` owns shared routing while
  `SignalConnection` owns one receiver and replacement-safe lease;
  `LocalSignalService` is the neutral factory boundary.
- **Organization:** the implementation is compact enough that keeping its
  private tests colocated aids diagnosis.
- **Naming:** room, participant, registration, terminal, and delivery names
  distinguish routing and lifecycle roles.

### `sea-compression`

- **Documentation:** except [SESS-002](#sess-002), behavior prose is concise and
  necessary, especially identity space, decoded-size risk, composition order,
  and coordination-stream revocation.
- **Tests:** independent codec, transform, forwarding, corruption/progress, and
  conformance layers are all retained.
- **Implementation:** complete-frame buffering and explicit trailing-byte
  rejection implement the contract.
  `CompressionError::Encode` remains public and removing it would be an
  unauthorized API change even if the current `Vec` writer rarely fails.
- **Abstractions:** the session wrapper is the narrow owner; adding generic
  forwarding machinery would increase indirection.
- **Organization:** codec/public types in `lib.rs` and facet adapters in
  `session.rs` are coherent.
- **Naming:** `CompressionSession`, `CompressionError::{Store, Encode, Corrupt}`
  and payload helpers are precise.

### `sea-encryption`

- **Documentation:** security qualifications, lookup order, terminal behavior,
  visible metadata, and composition order must remain explicit.
- **Tests:** expected envelope bytes and failure classes remain independent of
  production constants where that independence detects regressions; no
  consolidation is safe.
- **Implementation:** apart from [SESS-001](#sess-001), header construction,
  strict parsing, historical lookup, authentication, redaction/zeroization,
  clone-shared terminal state, and explicit forwarding are proportionate.
- **Abstractions:** `KeyProvider` and `NonceSource` vary independently and are
  valid injection boundaries.
  `begin_append` is not equivalent to sequencer admission or signal
  connection state.
- **Organization:** envelope/public API and session facets are separated at the
  narrowest useful boundary.
- **Naming:** `decode_next` is private and documented as stream mapping; a
  rename to `decode_stream` would not materially improve call-site clarity.

## Selection Recommendation

| Rank | Candidate | Confidence | Expected reduction | Risk/validation strength | Recommendation |
| --- | --- | --- | --- | --- | --- |
| 1 | SESS-001 remove owned submission clone | High | One unnecessary clone and clearer ownership | Low risk; strong focused lifecycle/transform tests | Consider for Wave 2 |
| 2 | SESS-003 common transform adapter | High rejection confidence | Superficially broad | High false-coupling and indirection risk | Reject |
| 3 | SESS-004 shared wrapper fixtures | High rejection confidence | Fixture lines only | 0018 mutations prove local tests are distinct | Reject |
| 4 | SESS-002 consolidate compression development prose | Medium-high | One duplicated maintenance point | Documentation-only; low value versus checkpoint budget | Defer |
| 5 | SESS-005 common exact-backing helper | High rejection confidence | A few tokens | Cross-crate coupling for distinct policy | Reject |
| 6 | SESS-006 common lifecycle machinery | High rejection confidence | Unknown | Would collapse different cancellation laws | Reject |
| 7 | SESS-007 split large files | High exclusion confidence | No concept removed | Adds modules/navigation | Exclude |

SESS-001 outranks SESS-002 because it removes an executed operation at a clear
single owner with strong safety evidence and no supporting edits.
No sessions candidate justifies Structural ambition or a shared owner.

## Deliverables and Commits

- Deliverable: this complete Wave 1 workstream report.
- Commits: none, as required.
- Production, tests, crate documentation, instructions, shared inventories,
  manifests, lockfiles, and generated files: unchanged.

## Validation Evidence

Wave 1 ran **no terminal commands, tests, formatters, builds, linters, or
documentation checks**, as explicitly required.
Repository evidence was gathered with read-only file viewing and text search.
No passing validation is claimed.

Registered follow-on task labels from the direct assignment:

- `rs0019 sessions test`
- `rs0019 sessions format`

If SESS-001 is selected, `rs0019 sessions test` should run the focused
encryption tests named in that candidate, followed by the assigned four-crate
package checks.
`rs0019 sessions format` must remain scoped to the four owned crates and must
verify that `Cargo.lock` is unchanged.
The coordinator retains canonical workspace and integration gates.

## Behavioral Contracts and Test Layers

The complete map and candidate sections identify the exact contract and nearest
owner-local discriminator for every material candidate.
The inherited 0018 inventory remains authoritative safety evidence:

- sequencer local tests own ordering, recovery, membership, floor, publisher,
  storage-read, cache, and resource decisions;
- signal local tests own admission, routing, queue failure, lifecycle, and
  retained memory;
- compression and encryption raw-boundary tests own their transformations and
  error mapping;
- shared conformance proves substitutability and must not replace local
  transform diagnosis; and
- transport/generated/browser tests prove distinct composition and platform
  boundaries and remain outside this workstream's proactive scope.

No test is proposed for removal.
No test expectation may be derived from a production constant or transform in
a way that hides the regression it is intended to detect.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Provenance discrepancy | Direct assignment names kickoff `7b56e89...`; generated charter, inventory, and workstream instructions name `575b77e...` | File headers versus direct task text | Terminal verification was forbidden, so checkout identity was not independently queried | Record direct assignment as authoritative and preserve the discrepancy for coordinator reconciliation | Generated records should be refreshed when kickoff changes before dispatch |
| Falsified abstraction | Compression and encryption forwarding appeared nearly identical | SESS-003 contract and state comparison | A common adapter would hide different error and author-lifecycle rules | Rejected | Compare required agreement, not syntax |
| Falsified test cleanup | Wrapper tests use parallel fixture shapes | SESS-004 and inherited 0018 mutation evidence | Consolidation would weaken raw-boundary diagnosis | Rejected | A shared conformance pass cannot prove a transform occurred |
| Explicit no-command constraint | Wave 1 was limited to file inspection/reporting | Direct assignment and instructions | No live branch/HEAD/status or test evidence can be claimed | Recorded labels and required future gates only | Keep discovery evidence distinct from execution evidence |

## Contract and Integration Friction

- The kickoff commit in direct instructions conflicts with generated shared
  records.
  The coordinator must reconcile provenance; this workstream did not edit
  shared records.
- Any common compression/encryption wrapper abstraction would cross crate
  ownership and is rejected, not proposed for the cross-crate owner.
- Exact-backing retention is separately owned in signals and sequencer.
  No shared helper or core change is proposed.
- Core and transport contracts, generated bindings, non-Rust fixtures, shared
  manifests, and lockfiles remained read-only.
- Known issues concerning host authentication, transformation metadata
  visibility, transport timeouts, CI restore, and the Fluid adapter are
  constraints or separate owners, not simplification permission.

## Human Interventions

The user supplied the exact worktree, branch, superseding kickoff commit,
four-crate scope, Conservative six-category profile, full-coverage requirement,
write restriction, task labels, no-command rule, and stopping point.
No further human intervention occurred.

## Measurements

No size, performance, dependency, timing, build, test, or command measurements
were requested or performed.
Assessment counts describe coverage only: four workspace members, six enabled
categories per member, seven stable candidate hypotheses, one recommended
repair, one deferred documentation candidate, four rejected false-sharing
hypotheses, and one excluded organization proposal.
These counts do not establish value.

## Proposed Decisions

1. Compare SESS-001 with candidates from all workstreams for Wave 2; if
   selected, keep it one implementation-only checkpoint.
2. Leave SESS-002 deferred unless the repair budget has room for a small
   documentation checkpoint.
3. Record SESS-003 through SESS-006 as explicit false-coupling rejections so a
   future iteration does not re-propose shared wrapper, fixture, backing, or
   lifecycle abstractions without the stated triggers.
4. Do not select SESS-007 without demonstrated ownership or navigation harm.

No shared semantic or API decision is proposed.

## Candidate Skills and Process Changes

Observed problem: kickoff provenance changed after generated workstream records
were created.
Suspected cause: dispatch text was updated without regenerating the charter,
inventory, and instruction headers.
Proposed adjustment: coordination setup should compare the dispatch kickoff
with all generated source-commit fields before Wave 1 begins.
A later run should verify that the check reports or updates every stale field.
Disposition: deferred to coordinator process review; revisit on the next
kickoff mismatch.

No new implementation skill is proposed.
The existing simplification rule to reject coincidental similarity was
sufficient for wrapper, fixture, retained-backing, and lifecycle analysis.

## Remaining Work and Risks

- Coordinator reconciliation must copy the four reviewed area results and
  SESS-001 through SESS-007 into the shared simplification inventory.
- Wave 2 must compare SESS-001 and SESS-002 against other workstreams under the
  global four-repair budget.
- If SESS-001 is selected, preserve all named encryption lifecycle and
  transform tests and run the registered focused/package tasks before
  checkpoint review.
- Resolve the shared-record kickoff discrepancy before claiming fixed-base
  review evidence.
- No sessions area or enabled category remains unreviewed.
  There are no hidden repair promises: rejected and excluded candidates require
  their explicit revisit triggers, and SESS-002 remains assessed but
  unrepaired.

This report stops at complete Wave 1 discovery and assessment.
