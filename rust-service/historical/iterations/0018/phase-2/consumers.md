# Iteration 0018: consumers Report

Status: review complete; generated-binding validation pending coordinator
Branch: `rust-service-iteration-0018-consumers`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0018-consumers`
Base commit: kickoff `37fa0c0e4a119f94844837818a810ef84f9f59f8` (approved source `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`).
Final commit: none; coordinator owns commits.
Agent or owner: consumers implementation agent.
Model and tool version: unknown.
Instruction source: [consumers instructions](instructions/consumers.md) at kickoff `37fa0c0e4a1`.
Session or transcript reference: coordinator session `4cc33478-17d9-40d5-9640-a53d9778b2c5`.
Started and finished: started 2026-09-24T01:01:08Z; native validation completed after the 2026-09-24T01:14:27.861Z run; generated validation unfinished.

## Outcome

Inspected all four assigned members, including all source files, manifests, guides, unchanged implementation, and previously accepted evidence.
The full responsibility map below accounts for every member; there was no review-count cutoff.
Two concrete benchmark defects were reproduced before repair: snapshot verification treated implementation-assigned positions as record ordinals, and pipeline size reporting counted document-directory metadata rather than its files.
Snapshot verification also lacked checks for stale storage snapshots and corrupt snapshot payloads.
Added focused regression evidence for these decisions, erased binding capabilities, exact measurement timestamps, native worker integrity and timing, local WebSocket framing, no-reader replay, and counter recovery without snapshots.
Corrected inaccurate measurement and composition documentation without changing percentile values or shared semantics.

Native validation passes.
The new raw generated-binding tests deliberately bypass TypeScript wrappers, but need fresh generated artifacts and the coordinator's package validation route before acceptance.
No unreviewed member remains; the specific generated-execution blocker is not described as passing evidence.

## Hypothesis Results

Initial hypothesis: consequential consumer contracts may lack owning-boundary regression evidence.
Supported for capability rejection, raw binding lifecycle, measurement conversion, worker integrity, no-reader replay, and no-snapshot counter recovery.
Supported for incorrect benchmark snapshot assumptions, nested persisted-size reporting, and incomplete snapshot verification.
Rejected for a proposed broad composition rewrite: the current matrix retains independent plaintext expectations, per-hop rejection injection, bounded exact history, and independent reconnect fixtures.
The apparent nearest-rank behavior gap is a documentation defect: existing tests intentionally select upper ranks, so this work documents the formula rather than changing historical measurement semantics.
Native-task discovery and invocation succeeded before implementation; no shell or nested agent was used.

## Deliverables and Commits

No commits; coordinator owns validation acceptance and commits.

- `sea-benchmarks/src/main.rs`: use final replayed positions; verify latest snapshot and exact snapshot content; focused positive and negative tests.
- `sea-benchmarks/src/bin/storage-pipeline.rs`: recursive file-byte accounting and nested fixture.
- `sea-benchmarks/src/bin/presentation-native.rs`: isolate the existing delivery observation decision for deterministic integrity/window tests; local socket framing/subprotocol tests.
- `sea-benchmarks/src/bin/checkpoint-no-reader.rs`: isolate existing finite replay verification and exercise identity/receipt/payload/count rejection.
- `sea-benchmarks/src/measurement.rs`: deterministic clock-anchor arithmetic test.
- `sea-benchmarks/src/lib.rs` and README: correct upper-rank and process-CPU boundary descriptions; document snapshot and size verification.
- `sea-wasm/src/session.rs`: reject incompatible evidence for either snapshot capability without publishing, then prove original handles remain usable.
- `sea-wasm/README.md` and `tests/sea-integration-tests/src/test/wasmBindings.spec.ts`: direct generated Rust-boundary tests, pending execution.
- `sea-integration-tests/README.md` and `tests/session_composition.rs`: remove obsolete stable-submission-retry wording and account for the final reconnect submission.
- `examples/sea-counter/src/main.rs`: empty-history and no-snapshot signed replay test.
- `tests/webtransport-browser/browser-test.mjs`, `transport-lifecycle.rs`, `run-test.sh`, README: authorized supplemental browser ownership probes, crate-owned test-control inclusion, and selection-feature build prerequisite.
- This report.

No manifest, lockfile, shared API, generated artifact, or other owner's source was changed.

## Validation Evidence

Assigned process task: `rust-quality-0018-consumers`, invoked through `runTask` in loaded workspace `/workspaces/FluidFramework`.
It asserts execution cwd `/workspaces/FluidFramework-rust-service-iteration-0018-consumers/rust-service`, exact branch, and kickoff HEAD; prints status; saves command logs and a `result.json`; checks both shared lockfiles at success.
Every retained run identifies the same guarded checkout and kickoff.

Exact commands:

```text
cargo fmt --all -- --check
cargo test -p sea-wasm -p sea-integration-tests -p sea-benchmarks -p sea-counter --all-targets --all-features
cargo clippy -p sea-wasm -p sea-integration-tests -p sea-benchmarks -p sea-counter --all-targets --all-features -- -D warnings
```

Evidence root: `/home/node/.copilot/session-state/4cc33478-17d9-40d5-9640-a53d9778b2c5/files/consumers/`.

| Run | Observed result |
| --- | --- |
| `2026-09-24T01-01-31.590Z-800004` | Baseline: all three commands exit 0; direct task access established. |
| `2026-09-24T01-05-45.482Z-815124` | New fixture initially failed because Cargo runs binary tests from the crate directory and its local `target` parent did not exist; fixture setup corrected. Not product evidence. |
| `2026-09-24T01-05-57.106Z-816864` | Original snapshot verifier rejected valid file-backed final snapshot: expected `Ok(())`, observed `Err("reopened session did not preserve its latest snapshot")`; test command exit 101. |
| `2026-09-24T01-06-09.727Z-819048` | Snapshot repair passed; original size collector reported 4099 instead of exact 49 bytes; test command exit 101. |
| `2026-09-24T01-06-28.654Z-820413` | Tests passed; strict Clippy found newly unused import and redundant fixture closure; both corrected. |
| `2026-09-24T01-07-35.317Z-826386` | First repaired native batch: fmt, tests, Clippy exit 0. |
| `2026-09-24T01-08-46.280Z-831570` | Extended snapshot-integrity checks: all commands exit 0. |
| `2026-09-24T01-09-45.997Z-836093` | Native worker timing/integrity: all commands exit 0. |
| `2026-09-24T01-10-37.875Z-839570` | No-reader replay regression: all commands exit 0. |
| `2026-09-24T01-11-48.065Z-842795` | Socket tests passed; strict Clippy required a narrowly justified allowance for tungstenite's fixed large callback-error type. |
| `2026-09-24T01-13-11.236Z-849969` | Complete native batch including socket tests: all commands exit 0. |
| `2026-09-24T01-14-27.861Z-857064` | Shared-target native validation: all three commands exit 0; 49 tests passed across all binary/library/integration targets; shared lockfile check passed. |
| `2026-09-24T01-24-21.817Z-880903` | Fresh isolated-source validation after coordinator clearance: `CARGO_TARGET_DIR=/workspaces/.cargo-target-quality-0018-consumers`, four build jobs; all three commands exit 0 and 49 tests pass. Exact cwd/branch/kickoff retained in complete `result.json`. Fresh test compilation took 37.19 seconds, Clippy 17.40 seconds; composition tests 7.08 seconds. |

Several intermediate fmt-only runs returned exit 1 with exact rustfmt changes; all were applied before subsequent test execution.
Latest native counts: benchmark library 6; no-reader 2; presentation-native 5; syntax spans 1; benchmark main 12; pipeline 2; counter 6; composition 12; binding adapter 3.
The task output was retained and inspected, including individual command exit status rather than treating task completion alone as success.
Machine-readable run manifests were read as complete JSON with three command entries for successful runs, expected cwd/branch/HEAD, null signals, and exit 0.
The isolated run additionally records its unique target and fresh compilation; its logs name the repaired snapshot-position, recursive-size and incompatible-capability tests as passing.
Test/Clippy logs are nonempty; a successful formatting log is intentionally empty.
No benchmark dataset was produced or accepted.
No JSON parsing command was available independently of the assigned task; coordinator should machine-parse retained manifests and verify log sizes when reconciling durable iteration evidence.

The editor reports no diagnostics in the new TypeScript test, but this is not a replacement for package compilation or generated execution.
Required coordinator checks before accepting that test:

1. Generate fresh memory WASM in this checkout through `node rust-service/packages/sea-typescript/scripts/build-wasm.mjs memory`.
2. Build/typecheck/format/lint the integration package through its normal build graph.
3. Run the integration Mocha suite, including `Generated Rust binding ownership` (or the focused compiled `lib/test/wasmBindings.spec.js` first).
4. Run `rust-service/test.sh`, canonical workspace gates, scoped policy, and root `pnpm build:fast` as assigned by the charter.
5. Run `node --test rust-service/scripts/benchmark-alignment.test.mjs rust-service/scripts/benchmark-gates.test.mjs` for the unchanged companion alignment/acceptance boundary if not covered by the aggregate.

Root build is required because Rust crate sources are declared inputs to the WASM task, and the new fixture belongs to a registered package.

## Behavioral Contracts and Test Layers

### Complete Four-Member Responsibility Map

| Member | Reviewed implementation and responsibilities | Result |
| --- | --- | --- |
| `sea-wasm` | Entire `lib.rs`, `session.rs`, `bindings.rs`, `signals.rs`, Cargo feature graph and README: type erasure, classified errors, retained availability evidence, identity/input/result conversion, memory namespace/runtime ownership, remote factories and feature preflight, event/snapshot cancellation, signal factories and connection lifetimes. | Native capability evidence added; raw generated decision tests added but execution pending. Existing package/browser scenarios retain distinct public-wrapper and transport coverage. |
| `sea-integration-tests` | Entire matrix and manifest/guide: generic stack recursion, real per-hop endpoints, independent documents, error probes, membership observations, content/snapshot decoding, concurrent two-author expected model, terminal rejection, cancellation, reconnect, cleanup and deadlines. | Existing behavioral evidence sufficient; obsolete retry/count documentation corrected. |
| `sea-benchmarks` | Every source: `lib.rs` fixtures/schema/statistics, `measurement.rs` clock, `main.rs` parser/backend construction/workload/concurrency/recovery/resource reporting, all four binaries (pipeline, native worker, no-reader, source spans), manifests and README. Companion alignment/gate consumers inspected only where needed to interpret worker output. | Localized defects and evidence gaps repaired; historical percentile values preserved. Performance qualification and campaign execution remain excluded, not claimed by unit tests. |
| `sea-counter` | Entire example and manifest/guide: document/session setup, signed payload encoding, availability-backed publication, snapshot initial value replacement, tail replay, live-boundary stop, malformed length rejection and executable assertion. | No-snapshot/empty replay test added; existing snapshot/decoding evidence retained. |

### Inventory Rows

Links below identify the precise contract locations; test names identify the owning decision, not merely a topical suite.
All rows are owned by consumers for iteration reconciliation.

| Boundary | Owner and consumers | Relied-upon contract and owning decision | Discriminating evidence and locality | Disposition and revisit trigger |
| --- | --- | --- | --- | --- |
| `wasm-availability-erasure` | `SessionAdapter::publish_snapshot` / JS snapshot consumers | [Binding guide](../../../../crates/sea-wasm/README.md): "Handles from incompatible implementations are rejected rather than converted into availability claims." `recover` must downcast each original capability, not accept a matching identity. | New `shared_adapter_rejects_incompatible_snapshot_capabilities` substitutes nested incompatible evidence separately for root and position, asserts `Rejected`, exact diagnostic, no publication, then succeeds with the original handles. Existing `shared_adapter_supports_memory_and_compression` checks valid forwarding/publication through two concrete stacks. Owner-local native tests. | Repaired. Revisit when erased evidence or concrete handle types change. |
| `wasm-error-and-stream-forwarding` | `SessionAdapter` archive/author/coordinator methods | [Binding guide](../../../../crates/sea-wasm/README.md): "Errors retain their SEA classification"; shared adapter preserves stack operations. | `shared_adapter_preserves_error_classification` directly invokes the adapter after close and checks `Rejected`; `shared_adapter_supports_memory_and_compression` checks exact blob/event bytes, increasing returned positions, bounded history and selected snapshot. Trivial one-to-one forwarding remains covered by the exact operation round trip, not duplicated mock assertions for every method. | Already adequate for the forwarding responsibility. Revisit mapping policy or operation additions. |
| `wasm-value-conversion-and-validation` | `SeaTreeId`, `tree_reference`, `put_directory`, result encoding | [Binding guide](../../../../crates/sea-wasm/README.md): session identity is eight big-endian bytes without JS number loss; binding methods distinguish blob/directory identities and reject invalid input before session work. | Existing package `neutral membership announcements and departures share application event order`, recursive content, and independent identity tests exercise delivered kinds/bytes/bigints. New raw `rejects malformed raw directory inputs before publishing content` discriminates equal-length, duplicate-name, kind and digest checks inside Rust without wrapper masking. | Repair awaiting generated validation. Revisit conversion representation, wasm-bindgen, directory inputs, or identity allocation. |
| `wasm-factories-and-features` | `from_stack`, `check_options`, memory/remote construction | [Binding guide](../../../../crates/sea-wasm/README.md): default features empty, factories separate from operations, unsupported compression rejected before resources; memory service guide documents independent namespaces. | Existing package `minimal ... preset rejects unavailable compression before creating a document`, `... compression support does not enable compression implicitly`, document allocation/open rejection, and preset-entrypoint cases discriminate preflight and explicit decorator choice. Browser strict-mode fixture checks no fallback and real remote construction. Native tests cannot execute wasm32 constructors; actual generated bundle execution is the narrowest practical layer. | Already adequate existing boundary evidence; fresh generated/browser rerun assigned to coordinator. Revisit Cargo feature edges or construction order. |
| `wasm-stream-cancellation` | `SeaEventStream` and `SeaSnapshotStream` | [Rust binding methods](../../../../crates/sea-wasm/src/bindings.rs): "Reads one result; concurrent reads are rejected", "Cancels a pending read and drops owned stream resources", snapshot cancellation revokes registration. | Existing package snapshot replacement/cancellation test discriminates ending the old registration without revoking its replacement. New raw `rejects concurrent raw event reads and cancels the pending borrow` reaches Rust's guard directly; wrapper tests alone could pass while that guard broke. | Repair awaiting generated validation. Revisit ownership, abort handling, or generated borrowing. |
| `wasm-signal-ownership` | signal adapters, weak registrations and `SeaSession::close` | [Binding guide](../../../../crates/sea-wasm/README.md): "Closing a session closes its live signal connections, while closing only signals leaves archive access available"; factory outside archive decorators. | Existing package signal test checks exact members/messages/target/delivery/leave and independent history; browser fixture adds real reliable/datagram/fallback transport. New raw `session close releases raw signals and wakes their pending borrow without closing peers` specifically discriminates Rust session-owned cleanup, not `SeaSignals::close`. | Repair awaiting generated validation. Revisit signal factory placement, close-error policy or lifetime tracking. |
| `composition-real-hop-path` | `stack!`, `Fixture::transport`, `HopProbe`, production dispatcher | [Matrix guide](../../../../crates/sea-integration-tests/README.md): rejected submissions must not commit or reach deeper hops; successful replacement traffic crosses all configured hops. | `verify_transport_path` checks per-hop counter deltas at each injected rejection, unchanged counters on terminal retry and empty recovered history. `mixed`, `duplicate_transport`, `transport_compression_transport`, `repeated_stress` execute separate real endpoints. A local decorator unit test cannot establish this network topology. | Already adequate. Revisit stack construction, proxy handshake or hop dispatch. |
| `composition-payload-membership-and-recovery` | expected plaintext model and matrix scenarios | [Matrix guide](../../../../crates/sea-integration-tests/README.md): exact plaintext history, nested shared-subtree content, fresh memberships/connections over retained sequencer. No process-restart/durable-recovery claim. | All 12 configurations execute `verify_membership`, `write_trace`, `after_reconnect`, `verify_tree`, `verify_history`, `load_peer`, concurrent expected-receipt ordering and exact finite completion. `repeated_stress` supplies four rounds and final peer submission. Test-host constants are not claimed as production identity-allocation evidence. | Already adequate; documentation corrected for fresh-author semantics and 37 total submissions. Revisit transformations, reconnect construction or expected model. |
| `composition-authority-cancellation-cleanup` | collaborative snapshot and lifecycle fixtures | [Matrix guide](../../../../crates/sea-integration-tests/README.md): read-only/stale-fence/parent rejection, cancellation without breaking peers, bounded scenarios, endpoints aborted on unwind. | `collaborative_snapshot` and `verify_snapshot_publication` check selection suppression/regrant, obsolete registration drop, no mutation on rejected parent/root and exact snapshot retry. `cancel_idle_read` polls before dropping while other subscriptions continue. `configurations!` deadlines/cleanup own test resource safety. | Already adequate for composition. New owner-local storage/session policy tests belong to other owners. Revisit teardown, participant replacement or new matrix cells. |
| `benchmark-fixtures-schema-and-statistics` | library fixtures, serializers, `summarize` | [Benchmark guide](../../../../crates/sea-benchmarks/README.md): deterministic `(seed, fixture, index)`, schema 3, optional observations remain null; [Distribution docs](../../../../crates/sea-benchmarks/src/lib.rs) now state the exact upper-rank formula. | `fixtures_are_deterministic_and_distinct`, `schema_round_trips_without_losing_optional_observations`, `distribution_reports_tail_and_sample_variance`, `percentile_selects_boundary_and_upper_ranks` discriminate fixture shape, optional serialization, variance and even-sample selection. | Documentation repaired; numerical behavior retained. Revisit any schema, fixture or quantile-method change; do not silently reinterpret historical results. |
| `benchmark-command-and-concurrency` | `parse_command`, `parse_config`, `run_storage`, `run_session` | [Benchmark guide](../../../../crates/sea-benchmarks/README.md): help succeeds, malformed/zero options fail; writers bounded, exact acknowledged payload verification; documented storage versus sequenced boundary and non-comparable guarantees. | Parser tests cover default/invalid forms and disabled snapshots. `concurrent_writers_complete_before_measurement_returns` executes both storage and sessions and asserts every latency/delivery; `payload_verification_rejects_duplicate_wrong_payloads` discriminates the multiset verifier. Startup, append timer, orderly flush and CPU boundaries were inspected and CPU wording corrected. | Already adequate execution evidence; documentation corrected. Revisit concurrency admission, timers, resource schemas or new backends. |
| `benchmark-snapshot-recovery-verification` | `verify_reopened_session` and `verify_reopened_storage` | [Benchmark guide](../../../../crates/sea-benchmarks/README.md): final replayed snapshot position and exact counter blob; [EventPosition](../../../../crates/sea-core/src/archive.rs) is "implementation-assigned", not an ordinal. | `snapshot_verification_uses_receipt_positions_not_record_counts` uses real file offsets and failed before the fix. Existing stale-session check plus new stale/corrupt-storage and corrupt-session cases discriminate missing final-position/content checks, not storage persistence itself. | Consumer corrected and repaired. Revisit snapshot fixtures, file layouts, or any arithmetic on positions. |
| `benchmark-pipeline-order-drain-and-size` | `storage-pipeline::exercise`, `persisted_bytes` | [Pipeline guide](../../../../crates/sea-benchmarks/README.md#local-storage-pipeline): first-poll latency, bounded futures, exact receipt/replay order, final flush included, recursive file bytes; no physical durability claim. | `bounded_single_session_replays_in_order` executes both windows and payload sizes with 257 records; new `persisted_size_counts_nested_files_not_directory_metadata` failed 4099 vs 49 before recursive repair. Timers surround actual first poll/flush/read/shutdown and remain observational, not timing assertions. | Repaired. Revisit namespace layout, batching/polling, flush boundary or filesystem qualification. |
| `benchmark-clock-and-native-observation` | `MeasurementClock::at`, native `State::observe` | [Benchmark guide](../../../../crates/sea-benchmarks/README.md#aligned-checkpoint-measurements): all observer timestamps include warmup/drain, anchored to a monotonic clock; raw latency and aligned denominator are separate. | New `timestamps_preserve_the_anchored_elapsed_microseconds` fails constant/incorrect-unit conversion. New native observation tests reject reorder/corruption/unsubmitted/duplicate deliveries and distinguish writer, warmup, in-window and exact-end drain observations. Companion alignment tests own CPU sample bracketing and half-open host interval, not Rust timestamp generation. | Repaired focused evidence. Revisit clock source, timestamp unit or measurement-window semantics. |
| `benchmark-native-socket-boundary` | benchmark-only `socket`, `SocketStream`, `SocketTransport` | [Benchmark guide](../../../../crates/sea-benchmarks/README.md): local unencrypted WebSocket adapter using existing native session protocol, bounded ordered submission and drain; not a production client API. | New local socket tests observe exact DATA chunk sizes/bytes, explicit FIN and response decoding, and reject missing negotiated subprotocol. Control token validation and closed-stream admission were inspected; the finite worker's final process ownership, not a new reusable transport-disconnect guarantee, owns cleanup. | Repaired stream evidence; long-lived/custom-transport lifecycle qualification excluded from this one-shot worker. Revisit reusable adapter adoption or token/record protocol changes. |
| `benchmark-no-reader` | direct fixture pacing/telemetry and `verify_replay` | [Benchmark guide](../../../../crates/sea-benchmarks/README.md#aligned-checkpoint-measurements): 32 documents, no subscriptions during writes, serial per-document queues, finite replay only after timed phase; identical process pacing overhead. | New `replay_checks_identity_receipts_payloads_and_complete_history` exercises real history and rejects wrong identity, omitted/repeated receipts and duplicate payload. Phase separation creates subscriptions only in `verify_replay` after timed output. Companion runner requires replay total, acknowledgment drain, zero integrity errors and empty cache claims. Wall-clock pacing/CPU/RSS qualification remains a campaign responsibility. | Repaired replay evidence; benchmark campaigns explicitly excluded. Revisit phase transitions, queue limits or acknowledgment timestamp collection. |
| `benchmark-source-inventory` | `presentation-test-spans` syntax traversal | [Benchmark guide](../../../../crates/sea-benchmarks/README.md): outer `cfg(test)` modules/test attributes, no complex cfg evaluation; source inventory rather than linked reachability. | `keeps_outer_test_modules_and_ignores_braces_in_strings` proves outer-span selection and syntax rather than text brace matching; traversal skips nested tests once an outer test module is selected. | Already adequate. Revisit supported cfg syntax or source accounting rules. |
| `counter-replay-and-format` | example `recover`, `decode_counter_value`, publication helpers | [Example guide](../../../../examples/sea-counter/README.md): committed-event snapshots, snapshot-plus-tail recovery, exactly eight-byte signed data, bounded in-memory example. | New `replays_without_a_snapshot_and_stops_at_the_live_boundary` checks empty zero plus signed replay without any snapshot; existing `later_snapshot_replaces_prior_event_state_before_tail_replay` deliberately uses snapshot value 20 versus prior delta 2 to discriminate actual snapshot consumption. Malformed snapshot/delta tests check each decoding site; demo asserts 4. | Repaired no-snapshot guard; remaining evidence adequate. Revisit persistence, membership-bearing streams or arbitrary arithmetic policy before expanding this bounded example. |

The only production behavior change is in benchmark verification/reporting.
`sea-wasm` and `sea-counter` production behavior is unchanged and their existing guide contracts support the new tests.
The integration crate is test-only; its behavioral code is unchanged.
The worker helper extractions expose existing owning decisions for local testing; they do not alter scheduling, offered load, acceptance gates, or public protocol.
No conformance assertions were added because these gaps belong to consumers and harnesses, not substitutability laws.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Defect reproduction | File-backed snapshot fixture with non-ordinal position | Failing run `01-05-57.106Z-816864` | Valid compression/encryption benchmark snapshots could be rejected by ordinal assumption | Repaired using final replayed position and content validation | Treat positions as implementation-assigned identities. |
| Defect reproduction | Nested size fixture with 3 + 17 + 29 bytes | Failing run `01-06-09.727Z-819048` | Persisted size reflected directory metadata rather than stored files | Recursive sum validated at exact 49 bytes | Exercise namespace topology, not only flat fixtures. |
| Owning-layer evidence | Wrapper concurrency guard could satisfy generated memory tests | Direct inspection of `packages/sea-typescript/src/bindings.ts` and raw Rust stream guard | Public wrapper tests did not discriminate the Rust guard or Rust-owned session signal cleanup | Added raw generated fixtures; awaiting coordinator execution | Cross-language tests must identify which side owns the asserted decision. |
| Documentation correction | Existing two-sample quantile test deliberately returns upper sample | Library formula and boundary test | "Nearest-rank" wording was inaccurate | Preserved numeric behavior and stated formula | Do not change historical metric semantics as incidental cleanup. |
| Tooling | Assigned process task was available and guarded; shared Cargo targets occasionally waited on locks | Native task outputs | No mixed cwd/output observed; no terminal fallback needed | Native validation completed through assigned task only | Capability probe succeeded; this is not a throughput or cancellation-isolation claim. |
| Validation friction | Repeated fmt-only corrections, missing local fixture parent, strict callback-error lint | Retained task logs | Small setup/style failures, not product failures | Corrected and rerun with fresh identifiers | A dedicated guarded formatter task would reduce mechanical edit rounds. |
| Cross-workstream evidence | Transport requested browser establishment and final-stream-owner evidence after its production audit | Direct inspection of `browser-test.mjs::runLifecycle`, cancellation flow, and generated `websocket.spec.ts`; transport messages after initial consumer handoff | Current physical-release fixture proves established connection disconnect/drop, but not abandonment during `ready`; snapshot cancellation is followed by session closure and can mask transport-stream cleanup | Coordinator authorized split; consumers shared fixture batch implemented and awaits integrated generated validation | Keep established connection release, establishment cancellation, logical lease release, and final stream-owner release as separate claims. |
| Execution lesson | Persistence wake-suppression mutation hung unrelated live-read tests in a full suite | Coordinator update at 2026-09-24T01:19:12Z reports positively identified child stopped and restored source validated | A broad validation task is not safe for every intentional mutation | No such consumer mutation is running; any future potentially hanging mutation needs a narrow coordinator command and timeout | Bound mutation execution separately from ordinary complete validation. |
| Validation provenance warning | Sessions reported a surprising green result inconsistent with its inspected non-cache progress path | Sessions message at 2026-09-24T01:23:43Z identifies shared `/workspaces/.cargo-target`; root cause remains unconfirmed | Consumers task results retain correct checkout guards, but shared output/cache isolation is not established by those guards | Coordinator must use isolated target outputs or an exact integration rebuild before final acceptance | A guarded source checkout alone does not prove artifact provenance. |
| Validation provenance resolution | Coordinator confirmed no active tasks, configured per-workstream targets, and cleared fresh execution | Isolated run `2026-09-24T01-24-21.817Z-880903` compiles the consumer sources and passes all 49 tests, formatting and strict Clippy | Consumer native acceptance no longer relies on the shared target | Complete manifest and exact test logs inspected; browser/generated boundaries remain separately pending | Preserve checkout and output-target provenance together. |

## Contract and Integration Friction

Generated runtime validation belongs to the coordinator's fresh package build; the native assigned task cannot execute wasm32 JavaScript.
The new fixture is inside the existing integration package and intentionally imports its generated memory bundle directly rather than modifying a TypeScript package.
After the initial handoff, transport requested additional browser fixtures for its newly identified establishment and final-stream-owner defects.
The coordinator authorized the shared browser batch at 2026-09-24T01:20:00Z.
Transport owns the Rust lifecycle controls and production repairs; consumers owns the shared JavaScript fixtures and directly required script/documentation updates.
No shared semantic decision was needed.
File offset semantics are settled by the core/file contracts, so correcting the consumer did not require changing them.
Full production/power-loss qualification, custom-transport disconnect recovery, and benchmark campaigns remain excluded by the charter.

### Supplemental Browser Evidence and Requested Fixture Batch

Current discriminating evidence inspected:

- `tests/webtransport-browser/browser-test.mjs::runLifecycle` retains the JavaScript `WebTransport` objects strongly, separately disconnects a retained Rust owner and frees a final owner, first proves replacement admission is blocked for 150 ms, then requires admission within three seconds of release.
  The transport-owned ignored `browser_disconnect_and_drop_release_capacity` test supplies the one-slot server; fresh execution is still coordinator-owned.
- The final browser flow retains `snapshotCoordination.next()` as `cancelledNotification`, cancels, and awaits rejection.
  It then immediately closes the session: this proves Promise cancellation, not independent server nomination release.
- `packages/sea-typescript/src/test/websocket.spec.ts`, `ordinary WebSocket compatibility bounds queues and preserves stream lifecycle`, directly drives the generated ordinary-socket transport.
  It awaits cancellation of retained receive/read/write Promises; checks FIN leaves the reverse direction open and close without FIN rejects; rejects 257 two-byte messages and 65 65,537-byte messages as queue overflow; and rejects wrong subprotocol with callback cleanup.
  This is not evidence for the streaming-socket backpressure implementation.

Bounded shared-fixture requests, with transport owning Rust implementation/test-only exports and consumers owning JavaScript fixtures:

1. Retain a fake browser WebTransport whose `ready` never resolves; abandon it through a selected-factory timeout/fallback and assert its `close` is called without any Sea opening request.
   Separately inject pre-datagram initialization failure and verify successful construction does not prematurely close.
2. Keep two archive sessions open, grant first Sea-selected coordination, then release only that coordination owner.
   Require the second participant to acquire the fence while the first still performs archive operations, so session teardown cannot satisfy the test.
3. Extend only the existing test-only lifecycle example with low-level stream clone controls.
   Keep JavaScript writer/reader objects observable; freeing one Rust clone must not abort/cancel, whereas freeing the final clone must initiate both operations and eventually release locks.

The consumers batch now includes `verifySnapshotLeaseRelease` in `browser-test.mjs`.
It opens two dedicated sessions, receives the first participant's fence and the second participant's initial unselected state, cancels only the first registration, and requires the second participant's new fence within three seconds.
It then writes a blob through the first archive session and reads the exact content through the second before closing either connection.
Pending coordination observations are retained and settled during cleanup.
The existing established physical-connection release fixture remains distinct and unchanged except for sharing its bounded-wait helper.
This raises the final flow's successful session count from four to six.
Editor diagnostics found no JavaScript errors; generated/browser execution is still required and no runtime pass is claimed.
The establishment/stream-clone fixture is implemented as `verifyMockLifecycle`, using real readable/writable streams with observable underlying cancellation counts and lock state.
It separately requires one close after pending-ready timeout, one close on injected datagram setup failure, no early close on success, no cleanup after nonfinal clone drop, cancellation of both directions and unlocked state after final clone drop, and clean completed directions after finish/EOF.
Mock connections remain strongly retained throughout.
The shared Rust example includes transport-owned `crates/sea-webtransport/examples/support/lifecycle_controls.rs`; this file is intentionally not copied into the consumers checkout.
Generated names are `LifecycleConnectAttempt` with constructor/result/free, `LifecycleConnection.openStream`, `LifecycleStream.cloneOwner`, `finish`, `receive`, and `awaitSelectedConnect(url, hash, timeoutMs)`.
The selection helper uses strict WebTransport mode through the production deadline; it proves abandonment cleanup without adding a fallback-transport dependency.
Existing real browser strict/preference/fallback cases retain the separate selection-policy evidence.
The attempt is freed only after its result settles; the successful connection has its own retained owner.
The build script adds the existing `websocket-stream` feature for the production selection timeout.
This dependent inclusion requires the transport and consumer batches to be integrated together before formatting, WASM compilation and browser execution.
Editor diagnostics report no errors in the edited fixture/script/seam; this is not generated or runtime evidence.
No new shipped API is required.

Exact supplemental validation prerequisites:

1. Integrate transport's RAII/pump repairs and crate-owned lifecycle controls with this shared fixture batch.
2. Build `sea-webtransport --example browser_lifecycle --features websocket-stream --target wasm32-unknown-unknown` with `--cfg=web_sys_unstable_apis`, the pinned toolchain, and a dedicated Cargo target.
3. Regenerate the `web` wasm-bindgen bindings for that exact example with wasm-bindgen 0.2.128.
4. Run ignored `sea-webtransport-server::browser_disconnect_and_drop_release_capacity` with `SEA_BROWSER_LIFECYCLE_WASM` pointing at those exact nonempty bindings; require all five `ownership` cases and both real `physicalRelease` cases.
5. Regenerate the neutral browser bundles and run the final session flow over WebTransport, WebSocketStream and ordinary WebSocket; require `snapshotLeaseReleased: true` in each result.
6. Use the normal package formatter/linter and generated memory integration tests, then canonical integration gates.

## Human Interventions

The coordinator explicitly authorized the supplemental transport/consumer browser-fixture split after the initial audit.

## Measurements

No performance campaign, capacity claim, binary-size result, or dependency change.
Only correctness observations were retained.
49 native tests passed in the latest run; composition execution took 7.02 seconds in that run, not a comparative performance result.
Model/tool identity and total elapsed effort are unknown.

## Proposed Decisions

No shared decision proposed.
Preserve the general harness's historical upper-rank convention; a future quantile-method migration must be explicitly reviewed and versioned if needed.

## Candidate Skills and Process Changes

No new skill requested.
For generated bindings, compare wrapper checks with raw implementation checks before claiming owning-layer coverage.
For future task setup, consider a separate guarded formatter task; this is a coordinator convenience, not an execution-policy change.

## Remaining Work and Risks

Full assigned source review is complete, with the scoped exclusions stated above.
Acceptance is blocked only on coordinator-owned generated/package and integration validation, not on unreviewed crates.
Pause further edits for that validation; re-dispatch only any actual failures.
The supplemental shared-fixture edit batch is complete and ready for immediate integrated validation with transport-owned Rust test controls.
The consumers checkout alone cannot resolve the new Rust inclusion until that dependent transport file is integrated.
The new generated fixture must not be accepted merely because native Cargo tests pass.
The coordinator must reconcile the inventory, validate records and docs, consider changeset applicability for unpublished benchmark behavior, and commit the owned diff after all required gates.
No commits, symlinks, servers, copied dependencies or benchmark output were created.
New filesystem test directories are removed by their successful tests; an empty ignored crate-local `target` parent can remain.
All intended modified paths are enumerated under Deliverables; the generated-binding test is the only new source file.
Rust correctness confidence is high for the demonstrated defects and focused decisions; browser/platform acceptance remains conditional on fresh execution.

### Reopened Native Benchmark Artifact Selection

At 2026-09-24T01:53:50Z the coordinator reopened only the localized harness artifact-selection repair on its committed consumer base `82724b3e113`.
The coordinator reported fresh generation of all WASM bundles and three passing raw binding tests using Mocha's `--no-config --no-package` isolation.
An earlier config-wide Mocha invocation reached eight Rust benchmark cases that failed with `ENOENT`: Cargo honored an inherited target directory while `startRustService` launched `rust-service/target/release/sea-webtransport-server`.
The independently missing Tinylicious prerequisites were restored by the coordinator and are not part of this repair.
The prior audit's recorded build/launch mismatch was not closed by the initial native-crate evidence; this supplement accounts for that consequential harness gap.

| Boundary | Owning decision and contract | Discriminating evidence | Disposition and revisit trigger |
| --- | --- | --- | --- |
| `benchmark-native-artifact-selection` | `getRustServiceArtifacts` supplies both `buildPrerequisites`' Cargo arguments and `startRustService`' executable path. The benchmark intentionally uses its workspace-local `target`, overriding inherited `CARGO_TARGET_DIR`; skip-build requires that same prepared executable. | New `Rust benchmark artifact selection / builds and launches from the same target despite inherited Cargo output` checks the complete locked/release/feature/explicit-target command and exact matching executable under an unrelated inherited target, including a workspace path containing spaces. It launches no service and builds no Rust crates. Removing `--target-dir` or separating the launch path fails this owning-assembly regression. | Localized repair complete, execution pending coordinator. Revisit Cargo profile/target flags, executable naming, or any future general environment-target support. |

Follow-up files: `tests/sea-integration-tests/src/test/sharedTree.bench.ts`, new `rustServiceArtifacts.ts` and `rustServiceArtifacts.spec.ts` beside it, the package README, and this report.
The helper preserves existing package/features/profile and executable naming; it changes only output selection.
No browser fixture, manifest, lockfile, or sibling-worktree source was edited.
No assigned task or shell was invoked: the assigned task still expects the previous HEAD, and the coordinator explicitly owns validation.
Editor diagnostics returned no errors in the three TypeScript files, which is not a compiled/runtime pass.

Required focused coordinator checks after integrating this follow-up:

1. From `rust-service/tests/sea-integration-tests`, run `pnpm run build:test:esm`, `pnpm run check:format`, and `pnpm run lint`.
2. From the same package, run `pnpm exec mocha --no-config --no-package lib/test/rustServiceArtifacts.spec.js`.
3. With an unrelated inherited Cargo target still present, rerun a previously failing Rust benchmark correctness case with builds enabled, then resume the intended integration gate.
   The focused assembly test does not substitute for observing the formerly missing executable being built and launched.

This follow-up is paused for coordinator validation and commit; pending browser execution remains unchanged.
