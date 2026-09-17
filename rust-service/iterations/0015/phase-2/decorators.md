# Iteration 0015: decorators Report

Status: complete
Branch: `rust-service-iteration-0015-decorators`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0015-decorators`
Base commit: `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Final commit: implementation `295f4f963fbd130c79ca89e460cb1db338194c8e`; report completion is this document's containing commit
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [decorators instructions](instructions/decorators.md) at `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Session or transcript reference: none
Started and finished: `2026-09-17`; exact times unknown

## Outcome

Challenged all nine inherited decorator dispositions by identifying the exact
wrapper-owned decision and the nearest test that would fail if only that
decision regressed. Eight rows already have discriminating evidence. One
localized evidence gap remained: `sea-stateful-compression` documented trailing
bytes as corrupt, but its owning frame test did not assert that decision. Added
one focused assertion; the implementation already rejected the extended frame.

No production behavior, public API, dependency, manifest, lockfile, dictionary,
cryptographic policy, or encoded format changed. The workstream used one repair
cluster and found no second material gap.

## Hypothesis Results

- **Owning-decision evidence:** supported as an audit method. The inherited
  stateful frame row lacked a direct assertion for one documented parser
  decision. The other eight rows map to tests that invoke the decorator and
  cannot be satisfied solely by the wrapped session.
- **Convergence:** supported. Rechecking the inherited rows produced one small
  test-only repair and no repeated documentation or broad integration churn.
- **Proportionate repair:** supported. One assertion in the existing focused
  frame test isolates trailing-byte rejection without changing the format or
  implementation.

## Deliverables and Commits

- `295f4f963fbd130c79ca89e460cb1db338194c8e`
  (`test(sea-stateful-compression): reject extended frames`) adds the focused
  extended-frame regression assertion.
- The proposed quality-inventory rows in this report cover every inherited
  decorator row with exact decision/test mappings.
- This report's containing commit completes the workstream record.

## Validation Evidence

- Checkout guards confirmed worktree
  `/workspaces/FluidFramework-rust-service-iteration-0015-decorators`, branch
  `rust-service-iteration-0015-decorators`, kickoff
  `27bf6bde813606100a00bf180085e2a5ba3a0f08`, and an initially clean status.
- The first focused test attempt was interrupted during compilation with exit
  130 and no test result. A second delegated attempt returned from the transport
  worktree and was rejected. The accepted absolute-path rerun of
  `current_tests::frame_round_trip_rejects_invalid_metadata_and_payloads`
  passed: 1 passed, 0 failed, 4 filtered out.
- Workspace-wide `cargo fmt --all -- --check` was blocked by kickoff-state
  formatting differences in unowned `sea-core` and `sea-memory`; neither path
  differed from this branch's kickoff. Package-scoped formatting for all three
  owned crates passed.
- Strict Clippy with `--no-deps` for all three crates passed. Warning-denied
  rustdoc with `--no-deps` for all three crates passed.
- All-target and all-feature package tests passed: `sea-compression` 6,
  `sea-encryption` 12, and `sea-stateful-compression` 5 tests; 0 failed.
- `node scripts/check-documentation.mjs` passed.
- `pnpm policy-check --path rust-service` passed after a worktree-local
  `pnpm install --frozen-lockfile`; 499 paths were processed. The initial policy
  attempt before the install failed because the isolated checkout lacked the
  minimal driver's local TypeScript installation. The frozen install changed no
  tracked file and its ignored `node_modules` remains available to the worktree.
- `git diff --check`, writable-path validation, and both `pnpm-lock.yaml` and
  `rust-service/Cargo.lock` guards passed.
- No machine-readable output was required or retained.

## Behavioral Contracts and Test Layers

### `sea-compression`

- `frame-transform-and-malformed-input`: `compress_payload` emits one zlib
  frame and `decompress_payload` requires the decoder to consume every input
  byte. `rejects_truncated_and_extended_frames` is the nearest test for complete
  frame consumption; `classifies_malformed_stored_payloads_as_corrupt` invokes
  `get_blob`, `read`, and `load` through the decorator and fails if those paths
  stop mapping decode failures to `CompressionError::Corrupt`. The wrapped
  session cannot make malformed zlib bytes decode successfully.
- `wrapper-transparency-and-errors`: each trait implementation either changes
  only the payload or forwards the value and wraps an error in
  `CompressionError::Store`. `session_decorator_round_trips_events_and_blobs`
  fails if blob or event payload transforms are omitted. `passes_session_conformance`
  runs against the decorated handle while snapshot coordination uses the
  undecorated handle; its directory, metadata, snapshot, retry, progress, close,
  and post-close classification assertions fail if the wrapper mutates or fails
  to forward those responsibilities.
- `reopen-and-stream-lifecycle`: `load` and `read` synchronously construct
  `map_monitored_stream` with no wrapper task, buffer, or mutable stream state.
  `mapped_progress_preserves_source_delivery_after_transformation_error` in
  `sea-core` is the nearest owning-helper test for progress after a failed item;
  decorator conformance checks live progress and drop/close behavior. Reopen
  remains a wrapped-storage responsibility, so broader benchmark evidence is
  distinct rather than a substitute for a compression decision.

### `sea-encryption`

- `operation-replay-nonce`: `EncryptionSession::submit` resolves the operation,
  reads and decrypts the committed event, and compares plaintext before calling
  `encrypt_payload`. `operation_retries_do_not_request_another_nonce` observes
  the decorator's `NonceSource` and fails if exact or conflicting retries reach
  nonce generation; conformance cannot observe that side effect.
- `envelope-validation`: `decrypt_payload` owns fixed-header, context,
  historical-key, and authentication decisions. `every_truncated_envelope_is_corrupt`,
  `invalid_fixed_header_fields_are_corrupt`,
  `wrong_key_tampering_and_context_share_corruption_errors`, and
  `missing_active_and_historical_keys_are_unavailable` directly invoke that
  helper. No wrapped service can satisfy those assertions.
- `error-classification`: `EncryptionError::kind` owns local classifications
  and delegates only `Store`. The focused envelope, missing-key, nonce-failure,
  and retry-conflict tests fail on local mapping regressions. Conformance's
  post-close `resolve_submission` invokes the decorator's
  `map_err(EncryptionError::Store)` path and fails if underlying `Rejected` is
  not preserved.

### `sea-stateful-compression`

- `malformed-event-replay`: `load` and `read` independently call
  `decompress_frame` for each event through `map_monitored_stream`.
  `corrupt_events_do_not_prevent_fresh_replay` injects raw malformed bytes,
  observes `Corrupt` through both decorated paths, and starts a new bounded read
  after the corrupt position. The wrapped session cannot decode or classify the
  frame for the decorator.
- `frame-and-bound-validation`: `new`, `put_blob`, and `submit` own write bounds;
  `decompress_frame` owns magic, version, dictionary fingerprint, declared
  length, decoder window, actual length, and complete-frame acceptance.
  `configuration_has_hard_dictionary_and_payload_bounds`,
  `rejects_blob_and_event_payloads_over_configured_bound`, and
  `frame_round_trip_rejects_invalid_metadata_and_payloads` directly isolate
  those decisions. This iteration added the missing extended-frame assertion.
- `pass-through-state-and-errors`: the wrapper has immutable codec
  configuration but no replay, lifecycle, or progress state. Trait methods
  forward directories, snapshots, operation resolution, and close, while
  `map_monitored_stream` preserves source progress. `passes_session_conformance`
  exercises those methods on the decorated handle and its post-close assertion
  fails if `StatefulCompressionError::Store` stops preserving the underlying
  classification. The `sea-core` mapper test separately owns progress after a
  transformation failure.

### Proposed Quality-Inventory Rows

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-compression/frame-transform-and-malformed-input` | `compress_payload`, `decompress_payload`, and decorated blob/event readers; archive consumers | Untrusted stored frames and full-payload buffering | One independently decodable zlib frame; malformed, truncated, and extended bytes are corrupt; no local decoded-size bound | focused, conformance | Break complete-input consumption or public-path corrupt mapping; `rejects_truncated_and_extended_frames` or `classifies_malformed_stored_payloads_as_corrupt` fails without help from the store | already adequate | none | Package gates passed | Codec, format, decode strategy, or decoded-size policy changes |
| `sea-compression/wrapper-transparency-and-errors` | `CompressionSession` trait implementations; generic session consumers | Payload-only wrappers can alter metadata, lifecycle, or classifications | Only payloads transform; other values and underlying classifications pass through | focused, conformance | Break a forwarding method, payload transform, or `CompressionError::Store::kind`; decorator round-trip or decorated conformance fails | already adequate | none | Package gates passed | Wrapped responsibilities, mapper behavior, or error conversion changes |
| `sea-compression/reopen-and-stream-lifecycle` | `CompressionSession::{read,load}` and `map_monitored_stream`; streaming and reopened consumers | Lazy mapping must add no task, buffer, or cursor state | Per-item synchronous decode; source progress and cancellation remain lower-layer behavior | focused, conformance, integration | Break mapper progress after a transform error; `mapped_progress_preserves_source_delivery_after_transformation_error` fails. Add wrapper state; the current structural rationale expires | already adequate | none | Package gates passed; owning helper test inspected | Async work, buffering, shared state, reconnect logic, or reopen regression |
| `sea-encryption/operation-replay-nonce` | `EncryptionSession::submit`; retrying authors | Stable retries cross resolution, decryption, comparison, and nonce generation | Only a new encrypted write requests a nonce | focused, conformance | Move encryption before resolution or comparison; `operation_retries_do_not_request_another_nonce` observes more than one call | already adequate | none | Package gates passed | Submit ordering, nonce invocation, or resolution changes |
| `sea-encryption/envelope-validation` | `decrypt_payload`; event/blob readers | Untrusted authenticated envelopes, context separation, and historical keys | Invalid fixed fields, authentication, context, truncation, or keys map to documented corrupt/unavailable categories | focused, conformance | Regress a parser/authentication branch; the corresponding direct helper test fails independently of storage | already adequate | none | Package gates passed | Parser, format, context, or key resolution changes |
| `sea-encryption/error-classification` | `EncryptionError::kind` and decorated forwarding paths; retry/error-handling callers | Local and store errors require stable categories | Local categories are explicit and store categories pass through | focused, conformance | Regress a local arm; focused category tests fail. Regress `Store`; decorated post-close conformance fails | already adequate | none | Package gates passed | Error variants, mappings, or wrapped conversion changes |
| `sea-stateful-compression/malformed-event-replay` | Decorated `read` and `load`; archive readers | Corrupt history must not leak encoded bytes or poison a new independent replay | Each frame is independent; malformed frames are corrupt | focused, conformance, integration | Stop decoding/classifying either stream or retain history; `corrupt_events_do_not_prevent_fresh_replay` fails | already adequate | none | Package gates passed | Decoding becomes history-dependent, buffered, or recoverable in one stream |
| `sea-stateful-compression/frame-and-bound-validation` | Constructor, write paths, and `decompress_frame`; all wrapper consumers | Bounds and complete-frame parsing protect memory and dictionary correctness | Hard dictionary/decoded bounds plus exact complete-frame validation | focused | Append trailing bytes; the existing focused test previously omitted that documented parser decision | repaired | Added extended-frame rejection assertion to `frame_round_trip_rejects_invalid_metadata_and_payloads` | Exact test and package gates passed | Frame version, dictionary, bounds, or decoder reachability changes |
| `sea-stateful-compression/pass-through-state-and-errors` | Trait forwarding and `map_monitored_stream`; generic session consumers | A wrapper could accidentally add state or alter metadata/errors | Only payloads transform; wrapped session owns progress, recovery, snapshots, and lifecycle | focused, conformance, integration | Break forwarding or store classification; decorated conformance fails. Break progress after transform failure; mapper test fails | already adequate | none | Package gates passed; owning helper test inspected | Wrapper state, buffering, retry, cancellation, or transformed metadata is added |

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Hypothesis supported | The stateful README promised extended-frame rejection but the owning frame test omitted trailing bytes. | Direct contract/test comparison and the new exact assertion | One focused test-only repair cluster | Assertion passed without production change | Enumerate each promised parser rejection against assertions in the owning helper test; a combined “malformed” label is not exact evidence |
| Validation interference | Two delegated checks were interrupted or returned from the transport worktree. | Exit 130 before execution; mismatched worktree/branch output | Those results could not support a disposition | Rejected both and accepted only guarded absolute-path output rooted in this worktree | Treat branch, source path, named test, and result provenance as part of validation evidence |

## Contract and Integration Friction

None. Shared `map_monitored_stream` and conformance evidence was read-only and
sufficient. No shared API, format, security, or cross-workstream edit is
proposed.

## Human Interventions

The coordinator supplied the assigned worktree, verified kickoff, bounded
scope, required skills, and prohibition on external evaluator inspection. No
mid-workstream human decision was required.

## Measurements

- Change size: one focused assertion plus this report; no production change.
- Performance, encoded size, dependencies, and machine-readable artifacts: not
  applicable.
- Environment: pinned repository Rust toolchain in the assigned Linux
  dev-container worktree.
- Elapsed effort and token use: unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

None. Exact parser-decision enumeration and absolute worktree validation are
already required by the quality and coordination skills.

## Remaining Work and Risks

- Phase 2 integration should reconcile the nine proposed rows into the shared
  `quality-inventory.md` and run canonical workspace and repository gates.
- `sea-compression` intentionally has no decoded-size bound; revisit only if the
  shared threat model assigns that responsibility to this wrapper.
- Encryption key storage, rotation, nonce uniqueness, and replay policy remain
  design responsibilities outside this audit. Revisit on policy or format
  change.
- No second repair cluster, unresolved owned finding, retained reproducer,
  temporary source workaround, dependency change, lockfile change, or owned
  process remains.
