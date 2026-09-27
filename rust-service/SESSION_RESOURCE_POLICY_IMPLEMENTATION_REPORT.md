# Session Resource Policy Implementation Report

This is the cumulative implementation and evidence record for the [staged plan](SESSION_RESOURCE_POLICY_PLAN.md).
It records an experimental design, not supported production behavior.

## Checkpoint 0: Freeze The Cache Experiment

### Authority And Scope

- Approved starting revision and fixed review base: `852551e68182da4c7fca02c65a9b79351d055d2a`.
- Isolated worktree: `/workspaces/FluidFramework-session-resource-policy`.
- Branch: `rust-service-session-resource-policy`.
- Authorization: execute checkpoint 0 sequentially, obtain a fresh independent Standard review, and commit only after its gates pass.
  Stop before checkpoint 1; do not merge, push, or activate production behavior.
- Scope: this report, a plan-status link, and a generated compressed baseline evidence archive; no Rust, TypeScript, dependency, generated API, or production configuration changes.
- User decision on 2026-09-23: use one shared cache with revocable claims for all cache readers.
  The user also approved the workload, numerical tolerances, and stop criteria below before baseline execution.
- `rust-service-live-event-buffer` is experimental evidence only.
  No merge, cherry-pick, source reuse, or binary reuse from that worktree is authorized by this checkpoint.
  Historical revision `6231d99841a116edc0827ad9c37d1c4bf392f4f3` is not the acceptance baseline.

### Accepted Semantic Decision

The hypothesis is that a shared representation at settled publication removes repeated live archive reads, especially file-worker dispatch, without adding reader-dependent sequencing.
The smallest owner is a private delivery cache associated with one `LocalSequencer` opening.
It is shared by sessions on that opening, is not durable, and does not own sequencing, writer-reference eligibility, or storage settlement.
Recovery uses storage and starts a fresh cache generation.

Cache use will be an explicit opening-level experiment, disabled by default.
Checkpoint 1 must preserve cache-disabled construction as the storage-backed comparison path.
Enabling the cache opts **all** live readers on that opening into the neutral revocation contract, including direct construction and paths without session decorators.
Managed means factory/decorator participation, not exclusive permission to retain cache entries.
No factory is needed for checkpoint 1.

| Reader path | Retention owner | Removal and revocation authority |
| --- | --- | --- |
| Direct/unmanaged live `read` on a cache-enabled opening | One claim in the opening's cache registry per subscription | Stream drop removes its claim; a narrow neutral revocation capability removes it synchronously and signals termination without reader polling |
| Managed/decorated live `read` on the same opening | The same registry, not a second decorator-owned cache | A later decorator invokes that same capability; checkpoint-4 policy must also cover direct claims |
| Live suffix from `load`, snapshot catch-up, reconnect, or a future optimized transport read | No live claim during historical replay; the same registry after coherent handoff | Same capability after handoff; wrappers must preserve it and never bypass registration |
| Finite `read` with `stop_after` | Storage stream only | Existing finite completion, error, drop, and session closure; no live-cache claim |
| Historical phase of an unbounded read | Storage stream only | No cached suffix is pinned while catching up; drop ends the storage stream |
| Cache-disabled opening, raw backend archive, or a separate storage-backed path | No claim in the experimental cache | Existing storage and session lifecycle; cannot pin this cache |
| Item already returned to a local caller or held downstream | The item/handle owner can retain its allocation independently | Claim removal cannot free caller-owned memory or fabricate delivery completion |

The cache registry owns the authoritative claim state and identity/generation checks.
Only capabilities issued by that owner may remove a claim; they expose no author, storage mutation, or sibling-subscription authority.
Removal is idempotent across drop, explicit revocation, session closure, shutdown, and invalidation.
A stale capability must not remove a replacement claim.
Reclamation and terminal signaling occur when the claim is removed, not when the subscriber next polls.
The subscriber observes an explicit terminal outcome on its next poll; no silent switch to storage or automatic resubscription may undo revocation.
The precise typed error is a checkpoint-1 API detail and must preserve classified errors.
Transport-send interruption and exact-once delivery receipts remain checkpoint 3 work.

Checkpoint 4 selects count/byte lag thresholds outside sequencer policy and uses this neutral capability for every cache claim.
It must not depend on an outer decorator having authority over direct readers.
Publication/progress transitions must permit enforcement and reclamation without subscriber polling and without an unbounded notification backlog.
The later enforcement mechanism must bound detection/publication overshoot; this decision does not assert that such a bound exists yet.
Lag shedding can disconnect a functioning client delayed by congestion.
Subscription revocation preserves author authority, sibling reads, and snapshot participation and emits no departure.
Whole-session closure remains the separate ordered close operation.

### Publication And Handoff Contract

The controlling baseline paths are [runtime application and membership settlement](crates/sea-sequencer/src/session.rs), [idle and batched application settlement](crates/sea-sequencer/src/pipeline.rs), and [storage publication guarantees](crates/sea-core/src/storage/mod.rs).
Checkpoint 1 must cover each successful settled publication path, rather than attaching only to normal application submit completion.

- Publish each application, join, and leave once, only after the backend's existing acknowledgment boundary and successful runtime application.
  Buffered acknowledgment remains process-local; durable acknowledgment retains its synchronization guarantee.
  Do not wait for buffered disk flush to deliver, and do not publish queue admission or an unresolved ambiguous result.
- Use one canonical event with shared payload ownership.
  Include idle-ready submissions, queued batches, cancellation-retained settlement, explicit/recovery departures, and terminal failures.
  Recovery replay must not manufacture a live subscriber or retain all replayed history.
- Accepted work, controls, checkpoint/snapshot work, reference-floor updates, and cleanup never wait for reader delivery.
  Keep the durable writer-reference floor independent of cache reclamation.
- Historical/finite reads remain authoritative storage reads.
  For unbounded catch-up, track the last **delivered** opaque position.
  Register a live claim and select its first cached item atomically with respect to publication and reclamation, or verify a captured generation/frontier under the same synchronization.
  Forward only events strictly after the last delivered position.
- If the captured handoff range was reclaimed, retry storage from the last delivered position without acquiring a live claim.
  Yield between attempts; do not spin, skip, duplicate, restart from the beginning, or pin the full suffix.
  A reader that cannot catch up may stay storage-backed; no finite catch-up time is promised.
  Storage failure or invalidation terminates explicitly rather than retrying indefinitely across an invalid opening.
- Do not treat a progress notification alone as proof that all data through its head was delivered.
  [Monitored progress](crates/sea-core/src/monitored_stream.rs) can precede buffered data.
  Preserve progress monotonicity and finite range semantics without subtracting backend positions.
- Drop/termination removes a claim immediately.
  With no claims, release all settled cache payloads; no retained handoff allowance is selected.
  Outstanding returned handles remain a separate allocation owner.
- An actively polled cached read must drive retained accepted work after submitter cancellation.
  It must not require another writer, an archive poll per event, or a fan-out task per document.
- Backend invalidation must wake live observations with no subsequent submission or archive poll.
  The baseline storage contract does not provide a general standalone invalidation observer.
  Checkpoint 1 must add or prove the smallest neutral terminal notification needed for supported backends; this is not the optional storage-pressure policy signal.
  Missing this evidence blocks checkpoint 1.

Before checkpoint 4, an unpolled live claim can retain unbounded history.
Checkpoint 1 may prove neutral forced removal in deterministic tests, but must not implement lag thresholds or claim production resource safety.
The process guards below control experiments only.
They do not bound allocation overshoot, downstream buffers, stored history, subscriber count, document count, or total service resources.

### Frozen Comparison Protocol

Frozen before running baseline samples on 2026-09-23.

| Input | Selection |
| --- | --- |
| Baseline source | Approved revision `852551e68182da4c7fca02c65a9b79351d055d2a`; checkpoint-0 changes are documentation only |
| Candidate source | Future checkpoint-1 fixed commit or immutable full source snapshot, recorded before comparison; no experimental-branch binary |
| Activation | Record baseline storage-backed construction and candidate cache-enabled direct construction; require a marker or scoped counter proving the measured path |
| Build | Pinned Rust toolchain, locked dependencies, release server with `websocket-stream`, native `presentation-native`; separate target directory per source snapshot |
| Primary | Durable-file, 32 documents, one writer plus one observer each, 64-byte application payloads, 1,000 total offered operations/s |
| Transport | Native loopback WebSocket; no substitution after admission or setup failure |
| Service | CPUs `0,2,4,6,8,10,12,14`; 32 durable-file workers |
| Generators | Four processes on CPUs `16,18,20,22`, eight documents and 250 offered operations/s each |
| Storage | Fresh workspace-backed directory per sample; record filesystem, device, guarantee, worker count, and service mode marker |
| Timing | 3 s warmup, 10 s measured, up to 10 s drain; 120 s outer deadline per sample |
| Repetitions | Three matched pairs per cell in order baseline/candidate, candidate/baseline, baseline/candidate |
| Controls | Memory and buffered-file (four workers), otherwise primary settings; 8,192-byte fixed-payload cells on all three backends; no-reader cells on all three backends |
| No-reader definition | Same 32-document offered writes and payloads, zero live subscriptions including writer echo; measure CPU per acknowledged operation and verify finite replay outside the timed interval |
| Checkpoint-0 baseline | Three uncached primary samples and one memory and buffered-file reference sample; these establish repeatability, not cache benefit |
| Provenance | Source revision/dirty scope, command/environment, binary and runner/generator hashes, toolchain, CPU topology/affinity, guarantee, actual duration, raw workers/resources, failures and drain outcomes |

No-reader and mixed-payload instrumentation do not exist in the current transport harness.
Checkpoint 1 must use a bounded direct-session fixture for the no-reader comparison, with identical settings on both sides.
Its exact command and measurement instrumentation must be frozen before either side runs.
For variable payloads, the fixed 64/8,192-byte cells are acceptance controls; additionally run an alternating 64/8,192-byte sequence in a controlled fixture for reclamation and allocation correctness.
Maximum-legal-item/backing-slice cases are correctness and allocation probes, not substituted throughput workloads.
Open/close cost is recorded if measured here but is not a checkpoint-1 acceptance metric; independent wrapper and lifecycle budgets must be frozen before checkpoints 2 and 3 comparisons.

The primary efficiency metric is service-process CPU seconds per successful observer operation delivered in **the same** measured interval.
Report raw CPU utilization (100% is one occupied CPU), generator CPU, delivered throughput, worst-worker p95 latency, scheduling lag, raw backlog, process mean/peak resident set size (RSS), and actual allocation/retention observations separately.
The baseline runner's CPU sample endpoints are inside the workers' wider delivery interval.
Do not divide those existing columns to claim aligned efficiency.
Checkpoint 1 must align CPU and delivery endpoints for both builds and rerun the approved baseline; checkpoint-0 samples cannot be reused as paired CPU-efficiency evidence.
Fixed-rate efficiency is not sustainable maximum throughput.

### Numerical Acceptance And Stop Criteria

All candidate ratios are candidate/baseline within a matched pair; use the median of three ratios, not a ratio of unrelated runs.

| Gate | Required result |
| --- | --- |
| Primary CPU efficiency | Median ratio at most `0.90`, with improvement in at least two of three pairs |
| Memory, buffered, 8,192-byte, and no-reader CPU controls | Median ratio at most `1.05` in each cell |
| In-window completion | Every accepted sample submits and delivers at least 98% of offered operations during the measured interval; no-reader uses acknowledgments |
| Exact drain and integrity | Every sent operation acknowledged; expected writer and observer deliveries complete; zero missing, duplicate, out-of-order, corrupt events or worker errors |
| Latency | Each paired candidate worst-worker p95 at most `max(1.10 * baseline p95, baseline p95 + 1 ms)` and at most 100 ms; each worker scheduling lag at most 100 ms |
| Resident memory | In every pair, candidate mean and sampled peak service RSS may exceed baseline by at most `max(10% of baseline, 16 MiB)` |
| Cache mechanism | Zero per-event archive reads once live handoff has completed, verified by scoped instrumentation or a controlled backend, not inferred from CPU |
| Allocation evidence | Record unique retained payload backing capacity, cache entry/container capacity, allocation/copy counts or bytes, and overlap with input/encoding/downstream ownership; visible payload length alone is insufficient |
| Reclamation | Deterministic probes show no settled cache entries with zero claims, prefix reclamation after progress, and claim removal without another reader poll |

If the baseline varies by more than 10% in CPU or worst-worker p95 across its three primary samples (`max / min - 1`), stop acceptance comparisons and inspect host noise.
Retain the samples and repeat one complete baseline set under the same inputs after resolving the cause; persistent instability requires user guidance.
Do not discard a failed attempt or pick the fastest baseline.

- Stop a sample at 120 s elapsed, or when the 250 ms sampler observes service RSS above 4 GiB.
  These are sampled guards, not strict instantaneous limits.
- Preserve the generator limits of 8,192 outstanding operations and 1,000,000 submissions per generator.
  Stop on integrity errors, incomplete drain, child failure, or missing resource/provenance observations.
- For new direct fixtures, keep the same wall-clock/RSS limits, at most 8,192 outstanding operations and 1,000,000 submissions per generator-equivalent shard, and no more than the selected 32 documents.
  Stopped-reader probes use at most 3 s publication and 10 s cleanup and the same memory guard; they do not demonstrate bounded disabled-policy retention.
- Before builds or samples, require at least 8 GiB available memory and 4 GiB free workspace disk.
  Limit builds to four jobs, 20 minutes per invocation; stop owned work rather than deleting another worktree's artifacts if space becomes insufficient.
- **Proceed:** applicable correctness, documentation, provenance, ownership, performance, and review gates pass.
  Checkpoint 0 proceeds only to readiness for checkpoint 1, not cache activation.
- **Optimize:** a correct candidate misses a performance gate.
  Profile the responsible cache path and allow at most two localized optimization rounds, each followed by the complete affected matched comparison.
  Do not add wrappers or policy to hide the regression.
- **Stop:** safety/integrity failure, unresolved ownership or invalidation gap, unstable baseline, missing required measurement evidence, or gates still failing after those rounds.
  Report the retained failures and ask for a product/performance decision.
  Do not relax tolerances, lower offered load/fan-out, change transport, or increase the optimization allowance without approval.

### Baseline Contract Tests And Future Gaps

Run the existing `sea-sequencer` library tests as one bounded test invocation.
The smallest controlling regression witnesses are:

| Existing test in [fault tests](crates/sea-sequencer/src/fault_tests.rs) unless noted | Boundary protected |
| --- | --- |
| `idle_ready_submissions_apply_before_receipts_and_rejection_ends_authority` | Inline completion applies metadata before acknowledgment and rejection ends authority |
| `delayed_persistence_admits_a_bounded_ring_and_publishes_only_after_commit` | No reader visibility before gated persistence, bounded admission, queued-batch delivery |
| `cancelling_before_or_after_commit_retains_the_same_backend_future_until_settlement` | Retained backend future, no resubmit, exact committed prefix on replay |
| `cancelled_dispatched_same_session_batch_settles_before_leave_without_queued_suffix` | Cancellation and ordered departure follow the accepted prefix |
| `floor_advances_only_with_the_committed_event` and `batch_floor_does_not_invalidate_a_prepared_lower_reference` | Committed reference-floor rules are not delivery policy |
| `snapshot_cancellation_and_ambiguity_preserve_publication_order` | Snapshot settlement and ambiguous outcomes |
| `direct_reads_close_with_membership_and_load_policies_preserve_replay` in [session tests](crates/sea-sequencer/src/session.rs) | Direct/load replay and membership closure |
| `shutdown_and_session_close_work_when_backend_streams_retain_writer_ownership` | Stream ownership can outlive session closure |

These tests do not prove a cache that has not been implemented.
Checkpoint 1 must add deterministic publication/handoff races, progress-ahead-of-data, direct and decorated claim removal/isolation, stale revocation, zero-reader reclamation, backing-allocation ownership, cached-read-driven cancelled settlement, backend invalidation wakeups, and zero steady-state archive-read evidence.
Run memory, buffered-file, durable-file, native/WASM, and affected integration coverage when implementing that boundary.

### Experimental Evidence Disposition

The experimental branch's checkpoint-0 measurement README was inspected read-only.
Its single 1 s warmup/3 s measurement sample per backend is setup evidence only; it explicitly disclaims aligned CPU-efficiency comparisons.
Its reported encoding/maximum-size probes remain candidates for remeasurement against the eventual canonical representation, not accepted byte bounds here.

| Experimental work | Disposition |
| --- | --- |
| Encoding/maximum-item and blocked-send fixtures | Re-evaluate and selectively adapt only when the owning checkpoint requires them; none ported in checkpoint 0 |
| Neutral receipts, subscription termination, opening-failure observation at `44e24d3453c` | Contract/test references for later checkpoints, not dependencies or inherited validation |
| Publication ledger, fan-out debt, admission delivery waits, `BroadcastHost`, deadlines | Discard for checkpoints 0-4; do not copy |
| Historical performance numbers | Diagnostic motivation only; rebuild and measure the approved baseline independently |

### Validation And Evidence

The [compressed checkpoint-0 evidence](historical/measurements/session-resource-policy-checkpoint0-20260923.json.gz) retains all eight samples, full worker/resource records and service logs, build/test/policy/documentation logs and exit statuses, frozen pre-measurement protocol, source and binary hashes, and the host intervention.
It is generated JSON compressed with gzip, not a source or executable change.
The collection script verified lossless decompression and parsed every sample before retention.
Original command logs and a decompressed copy also remain in `/home/node/.copilot/session-state/2673ffd5-f5f4-4771-bcd5-35aab7f3c5b0/files/`.
Data directories were fresh under this worktree's `rust-service/target/checkpoint0/`, on ext4 backed by `/dev/loop4`.

| Sample | Observer operations/s | Service CPU, % | Worst-worker p95, ms | Mean / peak RSS, MiB | Sent = acknowledged |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial durable 1 | 998.7 | 133.519 | 16.672 | 47.312 / 47.555 | 12,994 |
| Initial durable 2 | 998.2 | 140.553 | 18.928 | 47.433 / 47.836 | 12,994 |
| Initial durable 3 | 982.7 | 133.915 | 22.526 | 47.690 / 47.934 | 12,995 |
| Memory reference | 999.7 | 29.818 | 0.295 | 48.020 / 49.922 | 12,994 |
| Buffered-file reference | 999.9 | 116.442 | 0.630 | 46.238 / 46.391 | 12,995 |
| Repeat durable 1 | 998.8 | 125.942 | 14.705 | 47.271 / 47.523 | 12,996 |
| Repeat durable 2 | 998.9 | 126.230 | 14.438 | 47.370 / 47.547 | 12,995 |
| Repeat durable 3 | 998.9 | 125.568 | 13.591 | 47.309 / 47.492 | 12,995 |

All samples completed within the duration and memory guards, with four worker results, exact acknowledgments, zero missing writer/observer deliveries, empty worker error arrays, and scheduling lag at most 100 ms.
The existing native generator checks both recipients' exact payload and document order, and waits for both recipient counts and acknowledgments during drain.
The harness's bounded `sustainable` classification passed in all eight samples; this does not establish maximum sustainable capacity.
Sent/acknowledged totals include warmup and final drain, whereas the throughput column covers the measured interval.
Do not combine that throughput with sampled CPU to claim aligned efficiency.

The initial durable set failed the frozen latency-repeatability gate: p95 spread was approximately 35.1%.
Read-only host inspection found unrelated `rg` process 899554 consuming approximately 11.37 CPU cores and concurrent I/O pressure.
The coordinator did not terminate it.
The user reported killing the noisy process at 03:55 UTC and requested another attempt.
After verifying its absence and available resources, the single permitted unchanged three-sample durable repeat passed: CPU spread `0.527%`, p95 spread `8.201%`.
This supports baseline repeatability after the intervention, not proof that the search caused all earlier variance.
The initial set is retained, not replaced or relabeled successful stability evidence.
Memory and buffered references remain one-sample setup observations made before the intervention.
No cache comparison, no-reader measurement, maximum-item allocation result, or wrapper overhead claim is made.

| Validation | Outcome |
| --- | --- |
| Independent release build, locked dependencies, four jobs | Passed; server and native generator built in 63.2 s in this worktree's target directory |
| VS Code targeted test discovery | No Rust tests discovered; no test success inferred |
| `cargo test --locked -p sea-sequencer --lib` | Passed: 44 tests, zero failed; includes the witnesses listed above |
| Initial `pnpm policy-check --path rust-service` | Failed because this new worktree could not resolve TypeScript in four package roots |
| Policy dependency restoration and rerun | Passed: reused `/workspaces/FluidFramework/node_modules` through an ignored worktree-local symlink; TypeScript 6.0.3; no manifest or lockfile changes |
| `node scripts/check-documentation.mjs` | Passed; final affected-link check recorded with the reviewed snapshot |
| `git diff --check` | Passed |
| Source/binary provenance | Measured Rust/manifests/scripts unchanged from approved base; binaries hashed before and after all samples, with identical hashes |
| Safety and cleanup | Fresh data directories; no surviving owned server/generator found after measurements; no external process stopped by the coordinator |

The toolchain was `rustc 1.98.1 (48a229cea 2026-09-01)` and Node.js `v22.23.2`, on an AMD EPYC 7763 virtualized Linux host.
The service binary SHA-256 was `bdfd9567b662c84a3fea1b4bbf89cb500ac242d79dfbd23b4f7820db29222799`.
The native generator SHA-256 was `e164503fba639021beef6ee2163bed5d60d515cbaf9fc0a6e755086b66f5d617`.
No experimental-branch artifact was used.
The ignored dependency symlink is tooling reuse only; the release/test Cargo targets and measured source are isolated.

To reproduce from this worktree's `rust-service/` directory, use a new output directory for every sample:

```bash
CARGO_BUILD_JOBS=4 cargo build --release --locked \
  -p sea-webtransport-server --features websocket-stream \
  -p sea-benchmarks --bin presentation-native --bin sea-webtransport-server
bash tests/webtransport-browser/generate-cert.sh tests/webtransport-browser/.certs
SEA_MAX_CONNECTIONS=128 timeout 120s node scripts/benchmark-stress.mjs run \
  '{"backend":"sea","generator":"native","transport":"websocket","storage":"durable-file","rate":1000,"payloadBytes":64,"documents":32,"cores":8,"seconds":10,"warmupSeconds":3}' \
  "$PWD/target/checkpoint0/new-durable-sample"
```

Use the frozen repetition schedule and substitute only the selected storage mode for the memory/buffered reference cells.
The retained command records use `benchmark-run.mjs` to capture source, machine, exact command, stdout/stderr, duration, and exit status.
The current runner reads binaries from `target/release`; build each source snapshot into that snapshot's own target directory.
Do not point it at another worktree's binaries.

Documentation-only scope requires the documentation checker, repository policy check, whitespace/link validation, the baseline measurements, and the selected existing regression tests.
Rust format/Clippy/rustdoc/workspace-wide build/tests, WASM/browser/Fluid suites, and repository `build:fast` are not claimed for this documentation-only checkpoint.
No generated build input, API, or user-facing behavior changes, so no changeset is required.
Checkpoint 1 must run the applicable canonical implementation gates in [Development](DEVELOPMENT.md).

### Independent Review And Completion

Completed a fresh independent Standard review with read-only agent `checkpoint-zero-standard` (`code-review`), using the checkpoint-review skill and shared review criteria.
The reviewer inspected the complete fixed-base diff, all three changed files, relevant baseline implementations and test assertions, and the generated evidence.
The coordinator owned validation execution; the reviewer ran read-only inspection only and launched no nested agents.
No implementation edits occurred during review.

| Reviewed identity | SHA-256 |
| --- | --- |
| Full binary-capable diff from approved base | `9468940e1bc17c472b0d0b8a42a9ecc9153ef5972d3b4f067bb6cc3459e64a20` |
| Report before this review bookkeeping | `53ed43ff3b22529bf52d7d2ace8c74efc05df27914f93fb43140f06b5ade0e51` |
| Plan | `0190070ba486726bced50fab3eb7a1dfd2644ccb807fed3c7e351fa84d8786cc` |
| Compressed evidence | `50b15c7d58ef60902ca014f981c6d67fd1c70c5ace949764b6e5f8cacb15f83b` |

The manifest and immutable source/diff copies are in the session artifacts' `checkpoint0-review-1/` directory.
Base and HEAD at review were both `852551e68182da4c7fca02c65a9b79351d055d2a`.
All three files were staged; there were no other nonignored changes.
The coordinator rechecked all content hashes and the complete fixed-base diff after review; they matched.
Only this completion bookkeeping was added afterward.

Disposition: **No actionable findings**.
No blocking findings, coverage gaps, requested reproductions, or repair cycles remain.
The reviewer independently checked 101 source hashes against the fixed-base blobs, both binary hashes, gzip/JSON identity, all eight samples and recalculated metrics, and successful build/test/documentation/policy logs.
Host intervention, pre-run free resources, cleanup observations, and unavailable editor test discovery remain implementer/user-reported observations.
The reviewer did not run tests or establish future cache correctness, allocation bounds, performance benefit, or cross-platform behavior.

Checkpoint-0 gates pass without a tolerance exception.
The repeat after user intervention is the accepted repeatability evidence; the failed initial stability check remains visible.
The authorized commit is titled `docs(rust-service): freeze session resource policy checkpoint 0` and contains this completion entry.
Its exact Git identity is returned with the completion response; the next authorized checkpoint should append that predecessor identity here.
This avoids trying to embed a commit's own hash in its tree.

Checkpoint 0 is ready to commit, and the design/evidence is ready for checkpoint 1 when separately authorized.
Checkpoint 1 remains not started.
Its first required work includes the opt-in cache and neutral revocation boundary, coherent handoff, terminal invalidation observation, reader-driven retained work, and aligned comparison fixtures.
No factory, lag policy, production behavior, merge, or push was introduced.

## Checkpoint 1a: Built-In Server Default-On Rollout (Complete)

On 2026-09-23, the user authorized the proposed scoped default-on rollout after discussing stalled-reader retention.
This explicitly accepts the risk that a stalled live reader can retain unbounded subsequent history, not only the modest measured RSS increase.
The native server and `BuiltInSeaHost::new` now default to cached delivery for built-in memory, buffered-file, and durable-file backends.
`SEA_EXPERIMENTAL_LIVE_CACHE=false` and `BuiltInSeaHost::new_with_live_cache(..., false)` preserve rollback.
Generic `BuiltInSeaHost::with_storage` and direct Rust/WASM sequencer recovery remain unchanged.
No lag thresholds, factory, automatic shedding, or production resource guarantee are added.

The clean checkpoint-start revision is `78bcd86e0ebf0e48c4c68967717a0c9d31cd4ef1`, following checkpoint 1 commit `2cb7012c030a15c47a7935b243b68464435483db`.
The intervening benchmark temporary-storage commit is preserved and excluded from this default-only change.
The same isolated worktree and branch are used.
Historical checkpoint entries below retain their original default-off decisions; this section supersedes that default only for the stated server surfaces.
Benchmarks continue to set the cache state explicitly, so default-on does not change comparison identities.
No additional performance acceptance campaign is required or claimed.
Validation and fresh independent Standard review remain completion gates.
No merge, push, or checkpoint-2 implementation is authorized.

Coordinator validation passed: workspace formatting, strict all-target/all-feature Clippy and rustdoc, workspace build, 272 Rust tests, documentation check, focused repository policy, and repository `pnpm build:fast`.
The configuration regression checks unset/true/false and rejects malformed values.
`env -u SEA_EXPERIMENTAL_LIVE_CACHE ./test.sh` passed the complete generated-WASM/Fluid/SharedTree/browser suite, with activation markers observed for WebTransport, WebSocketStream, and ordinary WebSocket.
The separate `SEA_EXPERIMENTAL_LIVE_CACHE=false SEA_BROWSER_SKIP_BUILD=1 tests/webtransport-browser/run-test.sh` rollback matrix passed all three transports with no activation markers.
Existing generic-registry and direct-sequencer tests remain part of the workspace suite.
Logs and command records are retained at `/workspaces/FluidFramework-session-resource-policy-measurements/20260923-checkpoint1a-validation/`.
The reviewer must inspect these results rather than treating this account as independent execution.

Fresh independent Standard reviewer `checkpoint-one-a-standard` returned **No actionable findings**.
The complete six-file snapshot patch SHA-256 is `05004bd0a59b5246c17453621a4813662dcd00ae3a4809c0de735f43249fb918`, against fixed base and HEAD `78bcd86e0ebf0e48c4c68967717a0c9d31cd4ef1`.
The reviewer inspected the full diff, baseline/current configuration and construction paths, direct/WASM defaults, explicit benchmark selection, and validation logs.
It verified all frozen/current source hashes; the coordinator verified them again before this completion bookkeeping.
There are no findings, missing source inputs, or requested reproductions.
Browser evidence covers all three transports on durable-file storage; native tests cover all three storage modes, not every browser/backend cross-product.
The reviewer ran only read-only inspection, not tests/builds or nested agents.
No new performance or resource-bound claim is made.
Implementation and validation are complete.
The user separately authorized committing the reviewed six-file rollout on 2026-09-23.
The coordinator verified that only plan/report completion bookkeeping changed after review; implementation hashes and the starting HEAD remained unchanged.
The commit records this completion entry; its exact identity is returned in the completion response rather than embedded in its own tree.
No merge, push, running-deployment change, or checkpoint-2 work is included.

## Checkpoint 1: Minimal Cache (Complete With Explicit Exceptions)

Authorized on 2026-09-23 after checkpoint 0 committed as `c9ce497936d6ecbbacb3e529dd64bf5706816638`.
The user approved merged revision `c41a02a33d5ec09f737b912e6b60d0eae1f88ecb` as the checkpoint-1 fixed comparison base.
The same isolated worktree and branch are used sequentially.
An unrelated report was independently committed as `81026c0eab7e36c8af03847b3bdb355526682691` during this work; that report is preserved and excluded from checkpoint scope.
No checkpoint-1 commit, production activation, merge, or push has been made by this implementation.

### Implementation And Focused Evidence

The current uncommitted implementation adds an opening-local opt-in cache, exact-sized canonical payload backing, atomic historical handoff, neutral subscription revocation, and backend invalidation observation.
Default construction remains storage-backed.
The server's experimental setting is explicit and disabled by default.
There is no session factory, lag threshold, write-delivery gate, or production retention bound.
Cached reads can drive retained application/control settlement; parked reads do not hold runtime or lifecycle guards.

Sequential implementation agent `cache-implementation` reported passing 58 sequencer tests, 12 core tests, 24 memory tests, 49 file tests, two focused server tests, scoped Clippy/rustdoc/format, and a WASM check.
Its logs remain in this worktree's `rust-service/target/checkpoint1-*.log`.
These are focused implementation results, not a completed canonical validation or independent review.
Sequential measurement agent `cache-measurements` reported seven focused Rust tests, three Node tests, formatting and scoped Clippy passing.
It retained initial benchmark compilation/lint failures and their repairs before measurements.

### Measurement Outcome And Blocking Gate

The initial three matched primary pairs completed with exact acknowledgments, no missing writer/observer deliveries, and no worker errors.
Their baseline p95 values were `226.214132`, `15.482213`, and `28.542452` ms.
The baseline latency spread exceeded the frozen 10% stability gate.
The descriptive median paired CPU-per-delivery ratio was `0.550862881`, improving all three pairs, but this is not accepted performance evidence.
The initial evaluator incorrectly treated the raw harness's baseline 100 ms latency classification as an acceptance gate; the frozen absolute latency cap applies to the candidate.
The evaluator was corrected and tested, retaining the original result and continuing the unchanged schedule without discarding or rerunning a sample.
The corrected evaluation still failed baseline stability.

The user explicitly authorized the single unchanged repeat despite the unresolved source of host noise.
The coordinator ran all six sides in the same baseline/candidate, candidate/baseline, baseline/candidate order, using the same binary, native generator, runner, and alignment hashes.
Original evidence remains under `/workspaces/FluidFramework-session-resource-policy-measurements/20260923-checkpoint1/`.
The repeat, full per-run results, commands, and host-pressure observations remain under `/workspaces/FluidFramework-session-resource-policy-measurements/20260923-checkpoint1-repeat/`.
The repeat directory links only to the original immutable build outputs, not to another source snapshot.

| Repeat pair | Baseline p95, ms | Candidate p95, ms | CPU-per-delivery ratio |
| --- | ---: | ---: | ---: |
| 1 | 16.795697 | 12.592865 | 0.551704 |
| 2 | 77.884199 | 12.897835 | 0.539279 |
| 3 | 15.169990 | 12.315547 | 0.548788 |

The coordinator parsed all six repeated raw results and verified sent equals acknowledged, zero missing deliveries, and empty error arrays for every worker.
Observer throughput was 998.5-999.2 operations/s.
The descriptive median CPU ratio was `0.548787855`; candidate latency and resident memory satisfied the paired limits in these samples.
Baseline CPU spread was `0.106%`, but p95 spread was `413.410%`: **the repeat remains blocked by baseline instability**.
At repeat start, host I/O pressure `some avg10` was 0%; afterward it was 16.67%, with `full avg10` 13.57%.
This demonstrates concurrent host I/O pressure, not its cause or exclusive attribution to an external process.
No unrelated process was terminated by the coordinator.

The permitted repeat is consumed.
Controls, complete canonical/cross-stack validation, cumulative acceptance evidence, changeset completion, and fresh independent Standard review remain pending.
No tolerance was relaxed and no performance acceptance is claimed.
Further acceptance runs or a stability exception require user guidance under the frozen stop criteria.

### I/O Variability Diagnosis

After the blocked repeat, the user authorized diagnosis rather than more acceptance runs.
The coordinator made no further acceptance comparison and changed no workload tolerance or durability guarantee.
Read-only process-I/O sampling over ten idle seconds found only modest visible background writes (about 2.6 MiB combined) and no sustained I/O pressure.
This did not identify a noisy process to stop.
The workspace is ext4 on `/dev/loop4`, whose backing file is `/mnt/cloudenvdata/dockerlib`; the host also exposes a separate ext4 `/tmp` mount on `/dev/sdb1`.
The full host-side backing/mount chain is not visible from the container.

One diagnostic-only baseline run traced `fsync`/`fdatasync` with `strace`.
Tracing materially changed execution: each worker submitted 3,249 operations but acknowledged only 1,047-1,054 before socket failures, so exact drain failed.
The failed run and worker errors are retained and are not acceptance, throughput, or correctness evidence against the untraced cache.
The trace captured 13,107 successful fsync calls, with p50 2.113 ms, p95 3.781 ms, p99 5.222 ms, and maximum 62.569 ms.
Thirty calls exceeded 20 ms, including clustered journal/cursor/directory syncs.
Host counters show that the workload/tracer itself generated substantial disk traffic; I/O pressure during a benchmark must not be labeled external contention without further evidence.
The trace's slowdown prevents attribution of the original 77.9/226.2 ms application tails.
No owned service or tracer remained after this run.

A second diagnostic isolated synchronous writes without the service, native generator, or cache.
On each mount it issued at most 12,992 64-byte write-plus-fsync operations across 32 files and 32 threads, in batches paced at 1,000 operations/s, with a 3 s warmup, 10 s target measurement, and 45 s stop guard.
It deleted only its own 32 probe files and directory afterward.

| Diagnostic mount | fsync/write p50, ms | p95, ms | p99, ms | Maximum, ms | Calls over 20 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Workspace `/dev/loop4` | 4.084 | 5.369 | 15.441 | 37.099 | 64 |
| Local `/tmp`, `/dev/sdb1` | 0.966 | 1.939 | 2.511 | 5.608 | 0 |

These are single diagnostic microprobe observations, not interchangeable service workloads or a durability-equivalence assertion.
They demonstrate materially different storage-path latency and workspace synchronization tails without the cache.
They do **not** reproduce the full original application tail or prove that storage alone caused the failed stability gate.
No cache defect, generator saturation, or specific external noisy process has been established by this investigation.
Continuing acceptance requires an explicit user decision: preserve the workspace and accept a narrowly defined baseline-stability exception, approve a new matched campaign on another storage path, or pause for a more controlled environment.
All initial/repeat/diagnostic evidence remains in the two measurement artifact directories named above, including `io-diagnostic-host.json`, `io-diagnostic-fsync.log`, and `io-diagnostic-fsync-probes.json`.

### Authorized Storage-Path Revision

After diagnosis, the user approved a **new matched campaign with data directories on `/tmp`**, retaining every other gate.
This is a separately attributable workload revision, not replacement of failed workspace samples or a claim that the old stability gate passed.
Approved source revisions, binaries, generator, alignment instrumentation, storage mode and guarantees, worker counts, affinity, payloads, rate, warmup/measurement/drain durations, pair ordering, and all numerical criteria remain unchanged.
The new artifact root is `/tmp/sea-session-resource-policy-checkpoint1-20260923`; fresh per-sample data lives beneath it on ext4 `/dev/sdb1`.
Its two target-directory links refer to the existing independently built, hashed baseline and candidate outputs.
The new campaign starts with `node rust-service/scripts/checkpoint1-pairs.mjs /tmp/sea-session-resource-policy-checkpoint1-20260923 primary`.
Run controls only if that primary passes.
Preserve and report this campaign separately from both workspace primary sets.

The initial `/tmp` primary passed every candidate/paired gate but missed the strict baseline p95 percentage-spread criterion: `2.236127`, `2.512874`, `2.508116` ms, a `0.276747` ms or `12.376%` spread.
CPU spread was `0.336%`.
The user then explicitly approved **`max(10% of the minimum baseline p95, 1 ms)`** as the baseline p95 repeatability allowance and directed continuation to controls.
This is an accepted numerical criterion revision, not a claim that the original 10% gate passed.
Baseline CPU stability remains 10%; candidate paired latency, its 100 ms cap, CPU benefit/overhead, throughput, memory, integrity, and all safety limits are unchanged.
The existing `/tmp` samples are reevaluated under this approved criterion without new or discarded samples.
The evaluator's focused tests cover both sides of the 1 ms and 10% boundaries and reject nonfinite input.
The much larger workspace tails would fail this revised rule as well.

### Allocation Optimization And Authorized RSS Revision

Before optimization, the `/tmp` primary had median CPU ratio `0.509816`; memory/64-byte and buffered-file/64-byte controls passed at `1.040883` and `0.506181`.
The first memory/8,192-byte pair failed the original peak-RSS limit: baseline `154.546875` MiB, candidate `173.578125` MiB, versus the allowed `170.546875` MiB.
Mean RSS differed by only `2.558008` MiB; CPU and latency passed.
The stopped cell and earlier results are retained under the original `/tmp` campaign.

The first permitted localized optimization round found a straightforward redundant allocation: application decoding copied encoded bytes, and live publication copied the decoded payload again.
The decoder now parses metadata through a shared input view and allocates the exact-sized payload once; cache publication and readers share it.
The result does not retain an oversized encoded backing slice.
Two regression tests verify exact capacity, release of encoded backing, and identical payload backing through publication and two readers.
The optimization agent reported 60 sequencer tests, scoped Clippy, and formatting passing.
Its exact patch and diagnostics are retained as `rust-service/target/checkpoint1-opt1-*`; patch SHA-256 is `69259db1a06959fe968abf23f33c74f8652fb1b94c619e16c0fc0040a19d4b84`.
This decreases allocation/copy work without deliberately exchanging CPU for memory; measured effects require a new matched campaign.

The user stated that extra memory is acceptable for lower CPU and explicitly approved **`max(20% of baseline RSS, 32 MiB)`** additional candidate RSS for checkpoint 1.
This replaces the original `max(10%, 16 MiB)` mean/peak RSS allowance only.
All CPU, latency, integrity, throughput, and safety gates remain unchanged, including the previously approved baseline-p95 floor.
No additional memory redesign or optimization round is authorized merely to recover a small RSS difference.
Because the finalized simple optimization changed production code, rebuild the candidate into a new isolated target, retain its source/binary provenance, and rerun every matched cell; do not combine old candidate samples with the new binary.

The rebuilt candidate source archive SHA-256 is `e197cf24d1a6a356e06362b4cc35dd5ed79a72fb86d0b5ac2a024acf8572eee5`.
The new `/tmp/sea-session-resource-policy-checkpoint1-opt1-20260923` campaign passed primary and every reader control: median CPU ratios were primary `0.510705`, memory/64 `1.032809`, buffered/64 `0.502629`, memory/8,192 `1.046339`, buffered/8,192 `0.551261`, and durable/8,192 `0.557856`.
The no-reader memory control passed pair 1, then its second candidate process hit a harness shutdown race (`missing RSS`), not an integrity or memory-limit failure.
The sampler was reading `/proc` during process teardown after the timed phase and replay.
The harness now records terminal-process observations, stops sampling for zombie/dead/disappeared processes, and still requires successful process exit, complete timed results, and exact finite replay.
It also stops its timer when the replay result is received.
No running process's missing RSS is tolerated, and no measurement sample is fabricated.
Retain the failed no-reader cell, rerun all no-reader pairs in a separate attempt, and retain the unchanged reader-cell evidence; measured binaries and the timed workload are unchanged by this harness-only fix.

### Explicit User Acceptance Of The Performance Tradeoff

On 2026-09-23, the user accepted the measured performance tradeoff rather than requiring every automatic threshold to pass.
The user judged the substantial CPU reduction in the intended reader workloads to outweigh modest extra memory and possible CPU overhead when the cache provides no benefit.
This is an explicit checkpoint-1 performance exception, not a change to the automatic evaluator or a claim that the failed gate passed.

The corrected no-reader memory campaign completed all three pairs with exact replay and successful process exits.
Its CPU ratios were `1.100338`, `1.104471`, and `0.952771`; the median `1.100338` exceeds the automatic `1.05` ceiling.
Baseline CPU spread was `10.504%`.
Each run consumed about `0.2` CPU seconds, so the sampler's `10` ms CPU ticks materially limit precision.
The evidence does not establish whether the observed increase is a reproducible regression or measurement variability.
The accepted result is retained under `/tmp/sea-session-resource-policy-checkpoint1-opt1-no-reader-20260923/samples/no-reader-memory`.
No higher-resolution rerun or further optimization is required for this accepted result.

The measured large CPU improvements apply to the file-backed reader workloads (about 44-50%); memory-backed reader controls instead showed increases of about 3.3% and 4.6%.
Do not generalize the file-backed benefit to every workload with one or more readers.
The prior RSS exception remains in effect.
Unmeasured buffered-file and durable-file no-reader controls still need evidence; correctness, safety, canonical validation, and independent review requirements remain unchanged.
This decision does not enable production behavior or authorize checkpoint 2.

On resuming at 16:11 UTC, the coordinator found that all three `/tmp/sea-session-resource-policy-checkpoint1-*` campaign directories were absent.
The attempt to start the remaining controls failed before launching a benchmark because its output directory no longer existed.
The persistent source snapshots, independently built binaries, initial workspace campaigns, and diagnostic evidence remain under `/workspaces/FluidFramework-session-resource-policy-measurements/`.
The optimized local-disk results above remain recorded in this report and the session transcript, but their raw per-run evidence is no longer available for independent inspection.
The current `/tmp` mount is reported as `/dev/sda1`, rather than the earlier `/dev/sdb1`; no cause of the environment change is established.
Do not present the missing raw samples as available evidence, silently reconstruct them, or relabel newly measured samples as the accepted prior campaign.
The user's performance decision remains recorded; the raw-evidence loss requires a separate disposition before checkpoint completion.

The user explicitly accepted the recorded summaries with missing raw evidence disclosed and directed execution of only the two remaining controls.
This is a separate evidence exception: independent review can inspect the surviving source/binary provenance and recorded results, but cannot verify the lost local-disk sample details.
The pair runner's explicit `--accepted-primary <report-path>` option records the accepted evidence path and hash without fabricating a passed primary summary.
The automatic CPU/RSS/latency/integrity checks for the new controls remain unchanged.

Both remaining no-reader controls passed all automatic gates: buffered-file median CPU ratio `0.999898`, durable-file `0.994010`.
Each completed three alternating pairs with exact finite replay.
Their raw results, commands, provenance, and logs were copied immediately to persistent compressed archives under `/workspaces/FluidFramework-session-resource-policy-measurements/20260923-checkpoint1-final-controls/`.
These new samples use the surviving unchanged baseline and optimized candidate binaries on the current temporary filesystem.
Performance measurement is complete with the two explicit user exceptions above; no second optimization round was used.

### Checkpoint 1 Canonical Validation

Coordinator-owned validation on 2026-09-23 used four Cargo jobs and the explicit worktree-local target `rust-service/target/checkpoint1-validation`.
The immutable release targets used for measurement were not rebuilt during validation.
Logs are retained in `/workspaces/FluidFramework-session-resource-policy-measurements/20260923-checkpoint1-validation/`.

| Gate | Result |
| --- | --- |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Passed |
| `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` | Passed |
| `cargo build --workspace --all-targets` | Passed |
| `cargo test --workspace --all-targets --all-features` | 269 passed; one browser-only test ignored by this command |
| `node scripts/check-documentation.mjs` | Passed |
| Node measurement alignment and gate tests | Five passed |
| `pnpm policy-check --path rust-service` | Passed after fixing copyright-header blank lines in two new tests |
| Repository `pnpm build:fast` | Passed after the header repairs and repository formatting of two measurement scripts |
| `./test.sh` | Passed, including generated WASM, package tests, Fluid/SharedTree, and all three real Chromium transport modes |
| `SEA_EXPERIMENTAL_LIVE_CACHE=true SEA_BROWSER_SKIP_BUILD=1 tests/webtransport-browser/run-test.sh` | Passed with activation markers for WebTransport, WebSocketStream, and ordinary WebSocket |

The real-browser harness explicitly ran the ignored browser lifecycle test.
The separate cache-enabled run exercised the same browser/Fluid scenarios with the opt-in path; the complete suite also exercised the default path.
The installed `wasm-bindgen 0.2.128` matched the pinned dependency.
Initial policy/build failures and subsequent passing logs are retained, not replaced.
No tracked TypeScript API report changes were generated.

The focused allocation tests establish exact decoded backing for nonempty 64/8,192-byte payloads, release of an oversized 4 MiB input backing, shared publication/read pointers, and cache-container release after final delivery.
The source-level optimization analysis records removal of 8,206-8,222 requested allocation/copy bytes per 8 KiB publication, excluding allocator metadata/rounding and original input/encoding ownership.
These observations do not establish aggregate RSS bounds, a universal maximum-item bound, or transform/transport peak-memory guarantees.
No lag policy is active.

The dated [checkpoint-1 evidence archive](historical/measurements/session-resource-policy-checkpoint1-20260923.json.gz) retains the surviving initial evidence, failed repeat summaries, optimized-source and binary hashes, allocation diagnostics, focused/canonical validation logs, and complete final two-control raw results.
Its initial-review SHA-256 was `92a90c2ec0d2e0cc3060dea2723c14d0c587e28436581b9ed76e93613e233f9c`.
After adding the first review-repair evidence, its SHA-256 was `3a955b08f7e05d28dc4d7e9d3ffc661f70faf135c68d86ceba9171c66ababa3f`.
With the second repair and renewed validation evidence, its SHA-256 was `351d9d80fe5b444e8e637f9e07ca80af899149c910673c21cf254011f21989d4`.
With the explicitly authorized additional repair evidence, its SHA-256 was `c95807331c3e67f5d91b12c5ad779781803fdd3693ea6ba7fbf6853b72d816df`.
With the authorized JavaScript acknowledgment-drain repair evidence, its SHA-256 is `e0dc9d1ac823162523c94945393f101da3098fdec360270cb1b3459d63a5eeda`.
The missing temporary samples are explicitly listed; the archive does not reconstruct them.
The performance exceptions do not replace independent change review.

### Independent Standard Review: Initial Findings And Repairs

Fresh read-only reviewer `checkpoint-one-standard` inspected the complete 40-file checkpoint scope against fixed base `c41a02a33d5ec09f737b912e6b60d0eae1f88ecb`.
The sole exclusion was the independently committed performance-opportunities report.
The frozen patch SHA-256 was `ccf83f929acd4883ca92e1e9dd3511098dc753b306a493c86a8674043f20772a`; the reviewer checked all source hashes before and after review, baseline/current context, surviving binaries/source archives, validation logs, and both final-control raw datasets.
The reviewer did not execute tests or delegate further work.
The lost temporary samples and explicitly accepted performance exceptions were disclosed as limitations, not silently treated as available raw evidence.

Disposition: **Changes requested**, with two blocking Medium findings.

| Finding | Mechanism | Disposition and evidence |
| --- | --- | --- |
| Tinylicious stress runs always fail the new acknowledgment assertion | Tinylicious deliberately reports `acknowledged: null`, unlike Sea | Confirmed and repaired: shared drain validation requires Sea acknowledgments only, while retaining zero missing deliveries/errors for both backends. Regression tests cover both schemas, incomplete Sea acknowledgment, missing events, and corruption. A bounded real Tinylicious smoke (one document, 50 ops/s, 1 s warmup, 3 s measurement) passed. |
| A stalled reader causes quadratic lookup work for an advancing sibling | Each `next` linearly rescans the retained deque from its front under the shared cache lock | Confirmed and repaired: ordered `VecDeque::partition_point` locates the next opaque position without subtraction or rescanning the prefix. A two-reader regression uses gapped positions, a parked sibling, exact ordered advancement, and synchronous revocation/reclamation. |

The retained-prefix probe ran against the old and repaired lookup with 2,048 and 16,384 retained entries.
Before repair, advancing-reader time was `44.383263` ms and `2854.285021` ms; after repair, `3.627099` ms and `17.123692` ms.
These are single debug-build diagnostic observations, not throughput acceptance measurements or timing assertions in the test.
They support the source-level change from linear to logarithmic lookup per delivery.
The complete sequencer suite then passed 61 tests and the Node measurement suite passed six tests.
The repair does not add lag policy, change payload ownership, or reinterpret the user's accepted results.
The accepted release-binary measurements precede this narrowly scoped lookup correction; do not claim that those exact binaries contain the correction.
No new optimization campaign is being used to overturn the user's decision.
This is repair/review cycle 1 of at most two; renewed canonical validation and a fresh full-scope review are required before acceptance.

All required post-repair gates passed: formatting, all-target/all-feature Clippy, rustdoc, workspace build and tests (270 passed, one browser-only ignored), documentation check, focused policy, repository fast build, complete `./test.sh`, and the separately cache-enabled real-browser matrix.
The browser harness again explicitly ran the otherwise ignored lifecycle test.
The first post-repair formatting check caught wrapping in the new test; `cargo fmt` repaired it before the passing gate sequence.
Both the failure and subsequent logs are retained with the new Tinylicious smoke and before/after lookup diagnostics.

### Independent Standard Review: Progress Repair

Fresh read-only reviewer `checkpoint-one-standard-repair1` reviewed the full 40-file scope at patch SHA-256 `1525f163521ed15cececfb60fb51ce01d0b06339065d517caed4d28e4c500369` against the same fixed base.
It verified the first two repairs, all current snapshot hashes, baseline contents, surviving provenance, validation logs, and recomputed the aligned metrics for the final two controls.
Disposition: **Changes requested**, for one new blocking Medium correctness finding.

On direct cache attachment or delivery after an idle wait, the reader could return an event while its public progress still reported an older `latest_known` frontier.
The common stream wrapper advances only `previous` on data, so that snapshot violated the monitored-stream consistency contract.
A deterministic two-reader test reproduced the issue: after delivering position 1, `latest_known` was `None` instead of position 2.

The reader now tracks the separately reported discovery frontier.
It reports a cache frontier before delivering any items from that frontier, and drains the discovered prefix before reporting a newer frontier.
That ordering avoids starvation under continuing publication and does not consume cache ownership before returning data.
It also avoids a head-sampling race by attempting data delivery only when the already reported frontier exceeds the delivered cursor.
The regression checks progress after each item, direct retained-prefix attachment, idle-to-live delivery, and publication between discovery and the next data item.
Two retained-work tests now use their existing data helper to skip the newly correct progress observations while retaining their pre-acknowledgment and wakeup assertions.
The original failing progress test and the intermediate two test-expectation failures are retained.
All 62 sequencer tests pass after repair.

This is the second and final permitted repair/review cycle.
The prior release measurements remain explicitly attributed to their pre-review source snapshots; this progress-contract correction is not hidden in that provenance.
Canonical and cross-stack gates will be rerun, followed by a fresh full-scope Standard review.
No additional policy or production default is introduced.

The complete second-repair gate sequence passed: formatting, strict workspace Clippy/rustdoc, workspace build, 271 workspace tests with the browser-only test subsequently exercised, documentation, focused policy, repository fast build, `./test.sh`, and separately cache-enabled browser/Fluid coverage across all three transports.
Logs are retained as `progress-final-*.log`, `progress-policy.log`, and `progress-build-fast.log` in the same validation directory and evidence archive.
Performance was not remeasured after the progress repair.

### Final Permitted Review: Unresolved Progress-Status Finding

Fresh read-only reviewer `checkpoint-one-standard-repair2` inspected all 40 files against the fixed checkpoint base at patch SHA-256 `ea6acb6ede6ade4bbac9d3eced796ecc86ccd0082811d880abcd8fd3e3607bd6`.
It verified the earlier repairs and their evidence, full snapshot/baseline hashes, renewed validation, surviving provenance, and final-control raw metrics.
The coordinator rechecked the manifest and HEAD after review: no unexpected change occurred.
Disposition: **Changes requested**, for one blocking Medium finding.

The cache reader never reports `FallenBehind`: historical replay overwrites every backend status with `StreamingBacklog`, and live discovery only constructs `StreamingBacklog` or `AwaitingNewItems`.
The coordinator confirmed that the memory backend reports `FallenBehind` for more than one unread entry and that the monitored-stream contract requires eventual reporting when unread items accumulate.
This is a progress-observation regression, not a requirement to implement future lag shedding.
The prior latest-known-frontier repair is verified, but it does not resolve this separate status issue.
The requested repair is to preserve applicable historical backlog status and provide equivalent cached-backlog observation, with focused tests for both paths and without write gating or position subtraction.

The initial review and two permitted repair/review cycles are exhausted.
Checkpoint 1 remains uncommitted and blocked by this finding; the user's accepted CPU/RSS and missing-data exceptions remain unchanged.
No further implementation or review cycle starts without user guidance.

The user subsequently authorized one additional focused repair and fresh review round for this status finding.
That authorization extends the review allowance by one cycle only; it does not waive the finding or reopen performance optimization.

The bounded historical/cached backlog test reproduced status suppression before repair.
The repair preserves historical `FallenBehind` while translating only the finite segment's `AwaitingNewItems` into live-handoff backlog.
Cached discovery atomically observes the head and unread entry count, with ordered lookup rather than subtraction of opaque positions, and reports `FallenBehind` for more than one unread entry.
A narrow local monitored-stream wrapper clears that status once the delivered cursor reaches the reported frontier; without this adjustment, the generic positioned wrapper would leave `FallenBehind` with equal cursors after the last item.
No additional event/payload queue, pre-delivery claim advancement, policy threshold, or writer gate is introduced.
Tests cover both historical and direct retained-cache paths, each per-item snapshot, and backlog that accumulates after an idle wait.
All 63 sequencer tests pass after the repair.

All required gates passed again after the additional repair: formatting, strict workspace Clippy/rustdoc, workspace build, 272 workspace tests (plus the browser-only lifecycle test in the browser harness), documentation, policy, repository fast build, complete cross-stack suite, and cache-enabled real-browser/Fluid scenarios over all three transports.
The additional gate logs are `backlog-final-*.log`, `backlog-policy.log`, and `backlog-build-fast.log`.
The failed pre-repair regression and successful focused run are also retained.
The final source still differs from the accepted measured release binaries by the disclosed review repairs; no new release-performance measurement is claimed.

The additional fresh reviewer `checkpoint-one-standard-extra` returned: "No significant issues found in the reviewed changes."
Its supplied frozen patch was `b3440febc0c45ad4a865c36736a455620cfbb5bec70ec79e3a41841c0b454d73`.
However, the response omitted the required reviewed identity, coverage, and evidence record.
The coordinator attempted to request the missing report from the same reviewer; the agent tool rejected follow-up because that invocation was synchronous, and reading its result yielded only the same sentence.
Treat this as an incomplete formal review record, not proof of complete checkpoint coverage.
No additional code repair is currently identified, but the checkpoint is not committed pending disposition of this review-report gap.

The user explicitly authorized one replacement read-only review for the incomplete report and authorized committing checkpoint 1 if that review passes.
No further implementation or performance work was authorized by this replacement.

The replacement reviewer `checkpoint-one-replacement-standard` completed the full Standard coverage/evidence record against patch `e6537e5434ad87a11bd40f87da4a5b6339695542964189564f45b6b451e63244`.
It verified the four earlier repairs, all 40 snapshot hashes, surviving provenance, final validation logs, and both final-control raw datasets.
Disposition: **Changes requested**, for a distinct Medium benchmark correctness issue.
The default Sea JavaScript worker waits for writer/observer deliveries but not outstanding submission acknowledgments before capturing its result.
Because event delivery can precede the author response, the new exact-acknowledgment assertion can reject a valid run whose last acknowledgment arrives after that snapshot.
The coordinator confirmed that the bounded drain predicate omits acknowledgment counts while the result captures them.
The native generator and direct no-reader fixtures already drain acknowledgments; the reviewer explicitly found that this issue does not invalidate their inspected measurements.
The requested correction is a bounded Sea acknowledgment drain with a deterministic delayed-acknowledgment regression, preserving Tinylicious's unavailable acknowledgment observation.
No repair or new review has been authorized for this finding.
Checkpoint 1 remains uncommitted; the replacement review's conditional commit gate did not pass.

The user then explicitly authorized fixing this harness race, adding deterministic coverage, and obtaining a focused follow-up from the same reviewer, with commit permitted if it passes.
The bounded JavaScript worker drain now waits for outstanding Sea acknowledgments as well as both deliveries.
Tinylicious still drains deliveries without requiring its unavailable acknowledgment observation.
The existing ten-second deadline and error termination are unchanged.
A deferred-promise regression failed before the repair and passed afterward: both deliveries can complete while the Sea acknowledgment remains pending, and the drain becomes complete only after that acknowledgment.
The combined Node suite passes seven tests.
A real default JavaScript/Node-WASM Sea smoke completed with 199 sent, 199 acknowledged, zero missing deliveries, and no errors, against the preserved optimized release server with cache enabled.
This smoke validates the repaired generator, not the performance of post-review Rust source.
Focused policy, repository fast build, documentation check, and whitespace checks passed.
All Rust source and manifest hashes still match the fully validated replacement-review snapshot; no further Rust change was made.
The earlier 272-test and complete cross-stack/browser validation therefore remains applicable.

### Checkpoint 1 Final Review Gate And Completion

Under the user's explicit authorization, the same replacement Standard reviewer completed the focused acknowledgment-drain follow-up while retaining its preceding complete fixed-base coverage.
Final disposition: **No actionable findings**.
The reviewed patch SHA-256 is `830c1b0e144859c06346f288c07de2314a0e350abaebb42695e5a8866aacbbe8`; the reviewed source-tar SHA-256 is `6ee2c5f27538296da532e53023bd7a40e1b4c84f9dd680b8d03c7f110346298e`.
All 40 reviewed files and their frozen contents matched; 35 files were unchanged from its complete review, and it inspected all five subsequent changes.
The reviewer verified the delayed-acknowledgment regression and real smoke, policy/build evidence, artifact hashes, and all prior finding dispositions.
No unresolved blocking findings, coverage gaps, or requested reproductions remain.
The coordinator reverified every reviewed file hash and HEAD before this completion-only bookkeeping.

The review was read-only and independent; it ran no tests, builds, edits, commits, or nested agents.
Its evidence consists of directly inspected source, baseline/current diffs, immutable snapshots, raw surviving measurements, and coordinator-produced logs, not independently rerun experiments.
The only scope exclusion remains the independently committed performance-opportunities report.
Final bookkeeping updates this report and plan status only, without further implementation changes.

Checkpoint 1 is accepted with the user's explicit CPU/RSS tradeoff and missing-raw-data exceptions.
The final Rust implementation passed 272 workspace tests, strict Clippy/rustdoc, formatting, workspace build, complete generated-client/Fluid/browser validation, and a separate cache-enabled matrix.
The final scripts passed seven focused Node tests, real Sea/Tinylicious smoke checks, repository policy/build, and documentation/whitespace checks.
Accepted release-performance measurements precede the disclosed Rust review repairs; final-source release performance was not remeasured.
The recorded results establish the user's accepted experimental value judgment, not a production resource bound or a new final-binary performance claim.

The user authorized committing the reviewed checkpoint after this gate passes.
The commit records this completion entry; its exact identity is returned in the completion response rather than embedded in its own tree.
The cache remains explicitly experimental and disabled by default.
Checkpoint 2 is ready for separate authorization, not started.
No production activation, merge, or push is part of checkpoint completion.

### Checkpoint 1 Measurement Protocol

Frozen on 2026-09-23 before either measured side runs.
This subsection specifies measurement, not checkpoint completion or performance acceptance.
The user-approved comparison revision is `c41a02a33d5ec09f737b912e6b60d0eae1f88ecb`.
The working HEAD is `81026c0eab7e36c8af03847b3bdb355526682691`; its unrelated `PERFORMANCE_OPPORTUNITIES_REPORT.md` is preserved and excluded from the comparison.
The candidate is the current dirty cache implementation plus benchmark instrumentation, not an experimental-branch artifact.
The immutable candidate Rust-service source archive has SHA-256 `ce7ec25947eb9ee087ad9be5a2b38f8ce7524d2167aaf5ca86bafa7778a22ada`.
The independently archived approved baseline, with only the identical benchmark crate and scripts overlaid, has SHA-256 `0a16310b6abde0b422a23dd8119fc8fa794aa9b6e607d78dbb5ae98f2a3d2b7f`.
These archives precede this protocol-only appendix.
Their extracted source, full dirty patch, build logs, binary hashes, environment records, commands, worker results, resource curves, and failed attempts belong under `/workspaces/FluidFramework-session-resource-policy-measurements/20260923-checkpoint1/`.
No original-worktree source or shared Cargo target is used to build either server.

The baseline is extracted with `git archive c41a02a33d5ec09f737b912e6b60d0eae1f88ecb rust-service`.
Only `rust-service/crates/sea-benchmarks/` and `rust-service/scripts/` receive the new instrumentation on that extraction.
The baseline sequencer and server sources have neither `recover_with_live_cache` nor `EXPERIMENTAL_LIVE_CACHE`.
The primary comparison uses this approved baseline server with `liveCache:false` versus the snapshot candidate server with `liveCache:true`.
The runner explicitly sets `SEA_EXPERIMENTAL_LIVE_CACHE` and requires the candidate `EXPERIMENTAL_LIVE_CACHE=true` marker and its absence on baseline.
Every network sample uses the exact same candidate-built native generator executable and identical runner/clock instrumentation; hashes are recorded for every side.
The runner validates optional absolute `serverBinary` and `generatorBinary` paths instead of relying on locally staged binaries.

The native generator anchors host-epoch microseconds once to `Instant`/`SystemTime`.
It exports timestamps for every successfully validated application delivery to the observer, including warmup submissions and drained deliveries.
The external runner independently anchors the same host epoch to its monotonic clock, brackets each `/proc` service CPU read, and samples RSS every 250 ms.
The aligned interval is half-open: the midpoint of the first CPU bracket at or after warmup through the midpoint of the last CPU bracket at or before the measured-window end.
CPU seconds and the successful application-observer count both use those exact endpoints.
The denominator includes all observer operations delivered there, not only submissions classified as measured by a worker.
`aligned.serviceCpuSecondsPerDeliveredOperation` is the efficiency metric; the existing raw throughput and submit-to-observe latency remain separately named.
Reject missing/old telemetry, wall/monotonic discrepancies above 2 ms, anchor or endpoint sampling brackets above 2 ms, or more than 1% of aligned deliveries within 2 ms of an endpoint.
Report those endpoint-uncertain counts and the actual aligned duration rather than claiming instantaneous sampling.
Also require at least 98% of the offered rate over the aligned duration, in addition to the unchanged raw-window completion gate.
Checkpoint-0 CPU and delivery columns are never reused as aligned evidence.

The no-reader control is `checkpoint-no-reader`: 32 fresh documents, zero subscriptions during all measured writes, 64-byte deterministic payloads, 1,000 total offered operations/s, 3 seconds warmup, 10 seconds measurement, and up to 10 seconds acknowledgment drain.
There is no writer echo.
Four generator-equivalent shards each pace eight documents at 250 operations/s, preserving serial writes per document.
The complete direct-fixture process runs on the eight service CPUs and includes identical pacing overhead on both sides; there is no remote transport or separate generator CPU denominator in this control.
It emits acknowledgment timestamps using the same host-epoch instrumentation; CPU per acknowledgment uses the same aligned-interval calculation.
The parent samples a timed-result boundary before permitting finite replay.
After timing, finite replay verifies every receipt, session identity, exact payload, count, and order.
Baseline compiles this exact fixture source against the approved baseline production APIs, with default features.
Candidate alone enables the benchmark-only `sea-benchmarks/checkpoint-live-cache` feature to select `recover_with_live_cache`; no candidate production module is copied to baseline.
Candidate no-reader observations expose the exact `LiveCacheStats` fields `subscriptions`, `claims`, `entries`, `payload_bytes`, and `entry_capacity`.
No aggregate allocation or copy counts are manufactured.
Mixed 64/8,192-byte and maximum-backing correctness/allocation probes remain sequencer-test evidence owned by the coordinator, not substituted performance cells.
Zero per-event archive polls must likewise come from the scoped mechanism tests, not CPU inference.

Exact build and measurement entry points, executed sequentially:

```bash
SOURCE=/workspaces/FluidFramework-session-resource-policy
ARTIFACT=/workspaces/FluidFramework-session-resource-policy-measurements/20260923-checkpoint1

cd "$ARTIFACT/baseline/rust-service"
CARGO_BUILD_JOBS=4 CARGO_TARGET_DIR="$ARTIFACT/target-baseline" timeout 1200 \
  cargo build --release --locked -p sea-webtransport-server -p sea-benchmarks \
  --features sea-webtransport-server/websocket-stream \
  --bin sea-webtransport-server --bin presentation-native --bin checkpoint-no-reader

cd "$ARTIFACT/candidate/rust-service"
CARGO_BUILD_JOBS=4 CARGO_TARGET_DIR="$ARTIFACT/target-candidate" timeout 1200 \
  cargo build --release --locked -p sea-webtransport-server -p sea-benchmarks \
  --features sea-webtransport-server/websocket-stream,sea-benchmarks/checkpoint-live-cache \
  --bin sea-webtransport-server --bin presentation-native --bin checkpoint-no-reader

cd "$SOURCE"
node rust-service/scripts/checkpoint1-pairs.mjs "$ARTIFACT" primary
# Only after primary passes, in this order:
for cell in memory64 buffered64 memory8192 buffered8192 durable8192 \
  no-reader-memory no-reader-buffered no-reader-durable; do
  node rust-service/scripts/checkpoint1-pairs.mjs "$ARTIFACT" "$cell" || break
done
```

The paired runner records each fully expanded child command and exit status before proceeding.
Network commands are `node benchmark-stress.mjs run CONFIG NEW_OUTPUT`, with `SEA_MAX_CONNECTIONS=128`, native loopback WebSocket, 32 documents, one writer and one observer per document, eight service cores `0,2,4,6,8,10,12,14`, and four generator processes on `16,18,20,22`.
The primary CONFIG is durable-file, 64-byte payload, rate 1,000, warmup 3 seconds, measurement 10 seconds, and at most 10 seconds drain.
Durable-file uses 32 filesystem workers; buffered-file uses four.
Controls substitute only the frozen storage and fixed-payload selection.
Each cell runs baseline/candidate, candidate/baseline, baseline/candidate.
The exact direct control child command is `node benchmark-no-reader.mjs SERVER_SNAPSHOT_TARGET/release/checkpoint-no-reader BACKEND CACHE_BOOLEAN NEW_OUTPUT`.
No builds, tests, or other owned work run concurrently with measured samples.

All original numerical gates remain unchanged:

- Primary median paired CPU ratio at most `0.90`, improving in at least two of three pairs.
- Memory, buffered-file, all three 8,192-byte backend cells, and all three no-reader backend cells each have median paired CPU ratio at most `1.05`.
- Every sample submits and delivers at least 98% of offered measured-window operations; no-reader counts acknowledgments.
- Exact acknowledgments and expected writer/observer drain, or exact no-reader finite replay, with zero missing, duplicate, reordered, corrupt events or worker errors.
- Every candidate worst-worker p95 is at most `max(1.10 * baseline p95, baseline p95 + 1 ms)` and at most 100 ms; every worker scheduling lag is at most 100 ms.
- Each paired candidate mean and sampled peak service RSS increases by no more than `max(10% of baseline, 16 MiB)`.
- Baseline primary CPU or worst-worker p95 variation above 10% (`max / min - 1`) stops acceptance comparisons for noise inspection.
  Retain the failed set; one unchanged complete repeated set is allowed only after resolving the cause.
  Persistent instability requires user guidance.
- Stop at 120 seconds per run, service RSS above 4 GiB on a 250-ms sample, integrity failure, incomplete drain, child failure, or missing required observations.
- Preserve the 8,192-outstanding-operation and 1,000,000-submission limits per native generator or direct-fixture shard, with at most 32 documents.
- Before each build or sample require 8 GiB available memory and 4 GiB free workspace disk; builds use four jobs and a 20-minute deadline.
- Stop on a blocking primary failure rather than continuing the matrix.
  A correct but slow candidate permits at most two coordinator-owned localized optimization rounds with complete affected remeasurement; this measurement task does not optimize production.
  No tolerance, payload, fanout, transport, resource guard, wrapper, lifecycle, or lag-policy change is authorized by this protocol.

Gate-evaluator clarification before continuing the first planned pair:
the existing raw `sustainable` flag includes a 100-ms baseline latency cap, but the frozen absolute p95 cap applies only to the candidate.
The pair evaluator now checks the frozen submission, delivery, scheduling, and candidate-only latency gates explicitly rather than treating that raw flag as acceptance.
Its SHA-256 is `475c77b37ef85a1b3326e483b8ebe42f32e3dc5440ba11c9ab8655e4c7f6986f`, with gate module SHA-256 `232371c6a897b304290611e51a5e14328903f7e25b2d493ec5e51bc14a4e6a58`.
The original orchestration version and its stopped summary remain retained.
The command `node rust-service/scripts/checkpoint1-pairs.mjs "$ARTIFACT" primary --resume` continues the same alternating schedule without discarding or repeating the first side.
Resume verifies the original child command, server, generator, measurement runner, and alignment hashes before reading an existing successful result.
No measured binary, timing instrumentation, denominator, workload, or numerical tolerance changes in this clarification.

## Checkpoint 2: Pass-Through Interception (In Progress)

### Authority And Frozen Limits

- On 2026-09-24 the user authorized checkpoint 2 only, starting from `b89ec852722d3373bd38f9780f5676973a33c117`.
- Worktree: `/workspaces/FluidFramework-session-interception`; branch: `rust-service-session-interception`.
- Commits are authorized only after the plan's measurement, validation, and independent Standard review gates pass.
  Checkpoints 3a, 3b, 4, and 5 remain unauthorized.
- The attached plan snapshot is read-only; this checkout's plan and this cumulative report record execution.
- Before any measurements, the user approved a maximum median paired CPU-per-delivered-event increase of 5%, each paired p95 increase of `max(10%, 1 ms)`, each paired mean/peak RSS increase of `max(10%, 16 MiB)`, a maximum median open/close cost increase of 10%, and no additional steady-state per-operation allocations.
- Preserve the prior 32-document, one-writer/one-observer, 1,000-operation/s, 64-byte primary workload, alternating three-pair order, exact drains, 3-second warmup and 10-second measurement windows, no-reader and 8,192-byte controls, and existing duration/memory/disk guards.
  Cache selection must be explicitly on for both factory-comparison sides.
  Primary failures block later acceptance comparisons; no implicit tolerance exceptions carry forward from checkpoint 1.

### Probe And Design Status

The [proposed decision](historical/decisions/0028-session-factory-ownership-probe.md) records the factory boundary, provisional and constructed ownership, clone responsibility, native/WASM abandoned-close polling owners, failure/shutdown outcomes, and publication investigation.
The user declined synchronous threshold enforcement inside cache/sequencer locks and requested investigation of publication restructuring.
The current publication path cannot justify a finite outside-lock scheduling-based overshoot.
A candidate one-obligation helping protocol is recorded, but its ordering and cancellation premises remain unproved.
This is a checkpoint acceptance blocker, not permission to implement lag policy or a second settlement state machine.

The draft core factory and local adapter compile on native and WASM without erasing availability handles.
The native registry retains a pass-through document factory before opening a membership; interception is opt-in and is separate from live-cache activation.
Pass-through forwards source futures and streams directly and introduces no cleanup task, reservation, receipt, rejection policy, or threshold.
The work remains uncommitted and the factory shape is not yet accepted.

The user subsequently authorized a preparatory publication design and probe, with a mandatory new authorization before any sequencing behavior change.
The standalone `publication_shape_probe` integration-test target models the helpable one-obligation protocol without changing production publication.
It requires refreshing stale cursor observations before clearing maintenance; advancing past a small item may still leave an oversized unread item above the byte threshold.
The proposed decision identifies the remaining real lifecycle-gate, retained-intent, idle-maintenance, and settlement integration obligations.
The factory checkpoint remains blocked on that integration design and its separately authorized evidence, not on a failure of the factory type probe.

### Initial Focused Evidence

- The editor test runner reported no discoverable Rust tests; validation used Cargo instead.
- `cargo test -p sea-core -p sea-sequencer factory -- --nocapture`: passed four core forwarding/ownership tests and two local-factory tests.
- `cargo check -p sea-core --tests --target wasm32-unknown-unknown`: passed, including the local-only `Rc` fixture and dynamic factory/session shape.
- `cargo check -p sea-sequencer --lib --target wasm32-unknown-unknown`: passed.
- `cargo test -p sea-webtransport-server --all-features --bin sea-webtransport-server session_interception`: passed the strict opt-in configuration test.
- No performance acceptance, full validation, independent review, or checkpoint completion is claimed by these focused checks.

### Construction-Path Inventory

| Surface | Current path and checkpoint-2 status |
| --- | --- |
| Built-in native host, both transports | The document registry can retain an optional pass-through factory at document recovery; every advertised intercepted open goes through that factory before sequencer allocation. Default and generic storage hosts remain direct. |
| Direct local Rust construction | `LocalSequencer::open_session` stays unmanaged. `LocalSessionFactory` plus `PassThroughService` is the explicit opt-in alternative; local memory tests exercise all facets. |
| WASM memory bindings | `SeaMemoryService::open` in `crates/sea-wasm/src/bindings.rs` recovers/retains sequencers and directly calls `open_session`. It is not advertised as intercepted; the factory shape is cross-compiled separately. |
| WASM remote and generated TypeScript consumers | Binding adapters wrap an already opened remote session. Remote membership allocation uses the selected server path. TypeScript `wrapSession` and the driver-owned `SeaSessionFactory` do not become Rust policy boundaries. No generated API changes are made. |
| Compression and encryption | Generic decorators wrap caller-supplied sessions; their concrete handle/error mappings remain unchanged. They can wrap a pass-through result without opening another membership. Their local tests still construct direct sources. |
| Existing benchmarks and example | The main local benchmark, `storage-pipeline`, `checkpoint-no-reader`, and `sea-counter` directly open sequencers. No benchmark result yet measures pass-through; local churn and paired performance integration remain pending. |
| Conformance, composition, and failure tests | Existing fixtures retain direct construction to protect the unmanaged path. New factory tests cover opt-in forwarding; production publication and failure injection are unchanged. |

### Draft Validation And Pause Boundary

The final draft validation log is retained at `/home/node/.copilot/session-state/34f82e87-71c9-4d27-9572-80785c3995a8/files/checkpoint2-probe-validation.log`.
It records the pinned toolchain, starting revision, command output, and successful completion of:

- workspace formatting;
- strict all-target/all-feature Clippy for `sea-core`, `sea-sequencer`, and `sea-webtransport-server`;
- warnings-as-errors rustdoc for those crates;
- complete all-target/all-feature suites for those crates: 150 passing tests and one intentionally ignored browser-owned fixture;
- applicable doctest commands, which currently contain zero examples;
- WASM compilation of the core factory tests and the standalone publication model; and
- the documentation checker: 29 roots, 56 documents, and 346 local links.

The native registry test verifies opt-in/off selection, retained document identity, no allocation during factory construction, consecutive allocated identities, dispatch, close, and sibling independence.
The factory tests establish future/stream allocation identity and capability preservation; they are not a replacement for the still-pending allocation and churn measurements.
No native production sequencing, cache publication, or settlement implementation was modified.
The original `rust-service` worktree remains clean.

This is a validated draft and design probe, not a completed checkpoint.
Performance comparisons, the complete workspace/generated-consumer/browser gates, repository policy, and checkpoint acceptance remain pending.
Further changes to sequencing behavior require the user's next explicit authorization.
No commit, merge, or push has been made.

### Initial Independent Draft Review And Repair

The fresh `checkpoint2-draft-review` reviewer inspected the complete fixed-base diff and all untracked additions at Standard depth, including controlling baseline/current code and the validation log.
The frozen manifest SHA-256 was `3123e2b7a3787eb03e0eff6789362612c466caf696d40f3590d4859d0b8c3db9`.
All 16 manifest entries and the tracked/untracked inventories were verified unchanged during review.
The reviewer requested one draft repair and independently retained the known feasibility, measurement, and full-validation blockers.

The confirmed medium-severity finding concerned only the design model: `try_lock().is_ok()` detects whether any thread holds a lock, not whether the selector's caller retained a guard.
A legitimate competing cache operation therefore made the model panic before policy selection.
The requested deterministic reproduction failed against the reviewed code with `cache lock held by selector caller`.
The complete failure is retained in `checkpoint2-review-reproduction.log` beside the validation log.

Repair cycle 1 removes global lock-availability assertions from the concurrent helper.
A separate single-threaded test verifies guard release, while the regression permits selection during another thread's cache-lock ownership and waits for that owner to release before reclamation.
The eight model tests pass after repair.
No production behavior changed.
The initial log's silent command invocations were a review-evidence limitation; repair validation records the actual command lines.
Fresh complete-diff review completed after repair validation.

### Repaired Draft Review And Current Outcome

The fresh `checkpoint2-repair-review` reviewer inspected the complete fixed-base draft at Standard depth, all six untracked additions, controlling source boundaries, the failed reproduction, and the command-attributed repair log.
The reviewed manifest SHA-256 was `73f81ee0a13d687f2c5711ad942e178242092d789393d8700c6df6064bd5cac4`; the complete tracked diff SHA-256 was `7864fe31c753ede733e593546ca737bf5c53f24ecdb471f551019b3a2ed9f194`.
All 16 source hashes and the scope inventory matched at the start and end of review and during coordinator verification afterward.
Only this report's review bookkeeping changed after that verification.

The review confirmed the model repair and returned **No actionable findings** for draft quality.
It separately classified checkpoint acceptance as **blocked**, without waiving any missing evidence.
Repair cycle 1 was sufficient; the second allowed repair cycle was not used.

`checkpoint2-repair-validation.log`, alongside the earlier retained logs, records 152 passing native tests, one browser-owned ignored fixture, strict affected-crate checks, zero-example doctest commands, WASM compilation, documentation links, and whitespace validation.
Its SHA-256 is `d1153fe88bcd3a8448524ed3fc1618511b884f595192932b0f8b95076871acac`.
These are implementer-run checks directly inspected by the reviewer, not independent test reruns.

The authorized preparatory design/model is complete as a probe.
Execution is paused before changing real sequencing behavior, as requested.
The new worktree retains the uncommitted factory/host draft, proposed ownership decision, executable model, and evidence record.
Checkpoint 2 is not complete: production publication feasibility, measurement integration and acceptance, and full cross-stack/repository gates remain outstanding.
There is no checkpoint commit, merge, or push.

## 2026-09-26: Soft-Budget Plan Reset And Factory Salvage

This section supersedes the previous draft's active prerequisites, not its historical evidence.
The user authorized replacing the strict-bound plan with storage-owned inbound pressure, a soft outgoing queue/cache budget, and document-wide policy applied through session decorators.
The user requested a clean committed stopping point before starting the next policy layer.
[The revised plan](SESSION_RESOURCE_POLICY_PLAN.md) and [Decision 0029](historical/decisions/0029-document-soft-budget-policy.md) now control the work.

The original draft is recoverable from `files/soft-budget-reset/original-draft.diff` and `original-additions.tar.gz` in session `/home/node/.copilot/session-state/34f82e87-71c9-4d27-9572-80785c3995a8`.
The standalone publication model was removed, and Decision 0028 was marked historical.
No production sequencing, storage admission, settlement, or cache-publication code was restructured.
The redundant generic service-factory hierarchy was removed.
The retained document factory supports the local sequencer, native/browser network clients, and a pass-through decorator, preserving concrete handles and error types.
Each network-factory open connects independently to its fixed document.
The host retains an opt-in document factory; the default remains direct.

The user explicitly approved committing a functionally validated, independently reviewed foundation with the inherited performance campaign pending.
This is an exception to timing, not a change to thresholds or a performance pass.
Future/stream identity assertions do not measure total allocations.
The new bounded local churn and explicit no-reader modes prepare later measurements; their presence is not acceptance evidence.
Stage A performance acceptance remains open.
No pressure signals, policy implementation, or autonomous cleanup guarantee is included.

### Validation Attempts

- Focused core/local factory tests passed after pruning the service-factory hierarchy.
- The first network regression compilation failed because `Sha256Digest` is not `Copy`; the adapter and test now clone it where reused.
- Scoped repository policy initially failed because this new worktree lacked dependencies.
  `pnpm install --frozen-lockfile --ignore-scripts` restored them, after which `pnpm policy-check --path rust-service` passed.
  The installation and policy logs are retained in `files/soft-budget-reset/`.
- The first extended run built generated WASM/TypeScript consumers but failed the new network regression.
  The test expected an unprefixed message; the existing server forwards `SessionError::Rejected`'s full display text.
  The assertion now checks both `Rejected` and `session rejected operation: invalid session reference`.
  No production error mapping changed.
  Factoring the facet checks into a helper also resolved strict Clippy's test-length failure without adding an allowance.
  The focused test and affected Clippy passed; see `network-repair.log`.
- Workspace format, strict all-target/all-feature Clippy, warnings-as-errors rustdoc, all-target build, and core WASM test compilation passed in `final-validation.log`.
  An extra standalone WebTransport WASM check initially omitted the existing build script's required `--cfg=web_sys_unstable_apis`; it failed to import the experimental browser types.
  The corrected check uses that same configuration, not a source workaround.
- The corrected WebTransport WASM check passed.
  The next extended run passed native tests, generated/package checks, and the real Chromium transport matrix, but failed the integration Mocha task.
  Its browser-lifecycle case timed out, and its Tinylicious correctness case lacked the separate Routerlicious dependencies.
  The unchanged lifecycle suite passed all ten tests in isolation.
  `pnpm install --frozen-lockfile --ignore-scripts` in `server/routerlicious` restored the missing dependencies without changing manifests or lockfiles.
  No timeout, assertion, or unrelated production source was weakened.
- `SEA_EXPERIMENTAL_SESSION_FACTORY=true CARGO_BUILD_JOBS=4 bash test.sh --extended` then passed in full, including 380 native tests across 24 targets and one browser-owned ignored fixture.
  Generated TypeScript/WASM consumer builds, package tests, integration/benchmark correctness cases, and the real Chromium transport matrix passed.
  The host opt-in was enabled for the inherited server environment.
  See `extended-restored.log`; earlier failures remain in `extended.log` and `final-extended.log`.
- The four affected library doctest commands passed with zero examples.
  The feature-enabled `session-factory` binary completed six debug correctness smoke runs: memory, buffered-file, and durable-file, each direct and pass-through.
  These unpaired debug runs are not performance acceptance.
  Commands are `cargo build -p sea-benchmarks --bin session-factory --features checkpoint-live-cache`, then `target/debug/session-factory BACKEND MODE NEW_DIRECTORY`, each under a 120-second timeout.
  See `fixture-build.log` and `fixture-smoke.log`.
- Final scoped policy passed in `policy-restored.log`.
  The documentation graph passed with 29 roots, 55 documents, and 351 local links before final review bookkeeping.
  The original worktree remains clean.

### Independent Review

The complete reset/foundation change is reviewed against `b89ec852722d3373bd38f9780f5676973a33c117`, not merely against the earlier draft.
The performance deferral is explicitly authorized; it is not an unreported gap or a passing measurement.
The first reviewer (`a389f075-a52b-4d98-8072-fb1aa5497d9f`) returned no significant issues but omitted the required snapshot, coverage, and evidence report.
That result was not accepted as a completed gate.
The synchronous agent could not accept follow-up messages, so a fresh evidence-completion reviewer inspected the entire frozen scope.

Reviewer `foundation-gate-review` (`913f0262-6a79-4649-a59b-59e1cd2b9595`) completed Standard review of all 22 changed files and their controlling boundaries, with no exclusions.
Its disposition was **No actionable findings**, with no requested reproductions.
It verified all source hashes at the start and end and reproduced the supplied staged diff.
The coordinator independently verified the same snapshot afterward:

- fixed base and pre-commit HEAD: `b89ec852722d3373bd38f9780f5676973a33c117`;
- full diff SHA-256: `0e86770cb41ef917fe70fc3a85cbe69ec191da1842ac31d65b14c15940d49ca4`;
- source-manifest SHA-256: `d7e64c1323ccefd420493bd1f6e8b9162311493e3248439c1da236564b93311e`.

The reviewer directly inspected the validation/failure logs listed above and traced core platform bounds and forwarding, local allocation/closure, client handshakes, incarnation-specific server cleanup, both host listeners, and benchmark replay/count boundaries.
No test or build was run by the reviewer.
The browser network factory was inspected and cross-compiled but has no new factory-specific browser runtime regression; the real transport matrix and native factory regression are separate evidence.
The review retains the missing performance/allocation acceptance explicitly.
No implementation repair was required after this complete review.

The coordinator accepts the foundation for the authorized stopping-point commit under the explicit performance-timing exception.
Only report/plan gate bookkeeping changes after snapshot verification.
No resource-policy stage starts, and no merge or push is authorized.

### Committed Stopping Point

Commit `9edf2b2dc1a` (`feat(rust-service): salvage document factory foundation for soft budgets`) contains the reviewed 22-file reset and foundation.
The following documentation-only commit records that identity and stopping state.
Documentation and scoped policy checks passed again before the foundation commit.
All implementation work is committed; no pressure/policy stage was started, merged, or pushed.
Resume with the deferred Stage A measurements, or obtain explicit reprioritization before moving to storage pressure in B.
The factory remains opt-in and Stage A remains performance-unaccepted.

## 2026-09-26: Resumed Factory Performance Campaign

The user authorized completing the deferred measurements.
This campaign does not implement pressure signals or resource policy.
Its change-review base is `02302fe93e75390d808392abf44edd02468762f9`.
The performance comparison instead retains the original direct-host baseline `b89ec852722d3373bd38f9780f5676973a33c117`, so the host's extra retained document wrapper is not hidden in a common baseline.
The candidate release source is `02302fe93e75390d808392abf44edd02468762f9`.

### Artifacts And Reproduction

Evidence root: `/home/node/.copilot/session-state/34f82e87-71c9-4d27-9572-80785c3995a8/files/factory-performance/`.
This persistent session evidence contains source copies, isolated release targets, command logs, runners, manifests, raw results, and failed attempts; large generated artifacts are not committed.
`provenance.log` records source archive hashes, Rust/Node versions, and host details.
`sources.sha256` identifies both extracted source trees; `source-verification.log` confirms they remained unchanged after measurements.
The host is a 32-logical-CPU AMD EPYC 7763 environment; service affinity is `0,2,4,6,8,10,12,14`, with four native generators on their existing separate CPUs.
Service data uses the owned `/tmp` filesystem, not the artifact filesystem.
No owned build or test ran during timed samples.

`build.log` records isolated `cargo build --release --locked` commands for both sources, using `sea-webtransport-server/websocket-stream` and `sea-benchmarks/checkpoint-live-cache`.
The candidate also builds `session-factory`.
All network comparisons use the same candidate `presentation-native` generator.
Each `samples/*/summary.json` records exact executable/helper hashes, commands, environment, start/finish times, paired metrics, and gate outcome.
The original campaign runner is preserved as `run-pairs-original.mjs`, whose hash matches the completed pre-repair summaries.
`run-pairs.mjs` adds only a new-attempt suffix to preserve failed attempts; it does not relax gates.

From the evidence root, the recorded runner commands are:

```bash
node run-pairs.mjs primary
node run-pairs.mjs same-foundation
node run-pairs.mjs memory64
node run-pairs.mjs buffered64
node run-pairs.mjs memory8192
node run-pairs.mjs buffered8192
node run-pairs.mjs durable8192
node run-pairs.mjs no-reader-memory path-repair
node run-pairs.mjs no-reader-buffered path-repair
node run-pairs.mjs no-reader-durable path-repair
node run-churn.mjs
node run-allocations.mjs
```

These runners refuse to overwrite completed attempts.
Reproduction requires new artifact directories and the same recorded source-specific binaries and configuration, not deleting earlier evidence.
The paired runner reuses sample-integrity and primary-repeatability helpers, but explicitly applies the factory RSS tolerance of 10%/16 MiB rather than the old cache helper's 20%/32 MiB.
Every cell has three alternating pairs, with original/current direct first in pairs one and three and wrapped first in pair two.
Both sides enable caching.
The native WebSocket workload retains 32 documents, one writer and observer each, 1,000 total operations/s, three-second warmup, ten-second measurement, and exact bounded drain.
The no-reader fixture instead checks exact finite replay after writes, without subscriptions during measurement.
Existing 120-second, 4-GiB sampled RSS, 8-GiB available memory, and 4-GiB disk guards remain.
Activation markers distinguish original, current-direct, and wrapped servers.

### Workload Results

All ten cells passed their frozen gates, totaling 60 successful samples.
CPU changes below are median paired service CPU-per-aligned-operation ratios, not ratios of independently selected medians.

| Comparison | Median CPU change | Paired p95/RSS and integrity |
| --- | ---: | --- |
| Original direct versus wrapped: durable-file, 64 bytes (primary) | +0.19% | Pass |
| Current direct versus wrapped: durable-file, 64 bytes | +0.90% | Pass |
| Original direct versus wrapped: memory, 64 bytes | -1.88% | Pass |
| Original direct versus wrapped: buffered-file, 64 bytes | -1.28% | Pass |
| Original direct versus wrapped: memory, 8,192 bytes | -1.43% | Pass |
| Original direct versus wrapped: buffered-file, 8,192 bytes | -0.26% | Pass |
| Original direct versus wrapped: durable-file, 8,192 bytes | -0.12% | Pass |
| Original cached no-reader versus wrapped: memory | -0.02% | Pass |
| Original cached no-reader versus wrapped: buffered-file | -5.68% | Pass |
| Original cached no-reader versus wrapped: durable-file | +0.95% | Pass |

Primary baseline CPU variation was 0.69%, below the frozen 10% gate; baseline p95 repeatability also passed.
Across all successful cells, the largest paired p95 increase was 0.083195 ms and the largest mean/peak RSS increases were 1.1173/1.3672 MiB.
The no-reader memory control had 21.18% baseline CPU variation.
Only the primary has the frozen repeatability requirement; the control's median and all paired limits passed, but its coarse low-CPU measurements must not be presented as a reliable speedup.
No retry selected a more favorable primary or discarded a measured regression.

### Local Churn And Allocation Results

`run-churn.mjs` runs the existing release fixture on CPU 2 for three alternating pairs per backend.
Each sample uses 32 cached documents, a 320-open warmup and 3,200 measured opens/closes, with exact correctness and cleanup checks.
The preselected metric is `(open_seconds + close_seconds) / successful_opens`, excluding the separately reported drop, verification, and shutdown durations.
All 18 samples pass; median paired increases are 5.12% for memory, 1.33% for buffered-file, and 2.73% for durable-file, below the frozen 10% limit.

The separate `allocation-probe/` uses pinned `allocation-counter` 0.8.1 with the candidate's path dependencies and an isolated `target-allocation` build.
It adds no dependency or unsafe allocator to the service workspace.
Its lockfile preserves the service dependency versions and records the additional instrumentation crate.
Allocator sanity checks verify zero allocations for an empty region and one for an opaque boxed value.
A single current-thread runtime executes the same generic cached-memory submit/live-read loop for direct and pass-through sessions.
It performs 64 verified warmup operations before counting; factory opening, initial stream construction, close, and final shutdown are outside the measured region.
Each operation reaches the pending live-read boundary before submitting, then checks exact identity, position, payload, and order.
The probe verifies empty cache ownership after subscription drop.

`allocations/summary.json` retains source/lock/binary hashes and twelve instrumented samples: three alternating pairs each at 1,000 and 2,000 measured operations.
Both modes report exactly 17,359 allocations at 1,000 operations and 34,717 at 2,000.
Every pair has zero additional allocations and zero additional allocated bytes.
This measures the steady submit/live-read path, not whole-process network or file-worker allocations.
The instrumented binary was never used for CPU, latency, RSS, or churn acceptance.
Concrete forwarding source and the existing future/stream identity tests remain complementary evidence for the other session facets.

### Failures, Repairs, And Validation

The first `no-reader-memory` original-baseline attempt failed before the timed workload with `File exists (os error 17)`.
Both original and candidate Rust fixtures create their requested data directory; the Node runner incorrectly supplied the already-created temporary root.
The narrow repair passes `resolve(temporaryData.path, "fixture")` while retaining root ownership, filesystem provenance, and cleanup.
The failed sample remains in `samples/no-reader-memory/`.
The new runner regression failed before the repair (`no-reader-reproduction.log`) and passed afterward with the helper/gate tests (`no-reader-repair.log`).
It checks a fresh child path and cleanup even when a fixture exits before measurement.
The three `*-path-repair` no-reader cells then passed with unchanged binaries and workload.

The first allocation-probe build needed an explicit `LocalSequencer<MemoryStorage>` type parameter.
That compile failure remains in `allocation-build.log`; the corrected build, strict probe Clippy, and initial direct/wrapped smoke outputs are in `allocation-repair.log`.
No service source changed for either repair.
The editor test runner did not discover the Node regression, so validation used `node --test`.

`validation.log` records passing targeted Biome checks, the complete script test suites, scoped repository policy, workspace formatting, strict Clippy/rustdoc, all-target native build, and `bash test.sh`.
The scoped integration gate includes native tests and generated TypeScript/WASM consumer package tests.
The extended transport matrix had already passed for the unchanged foundation; this repair affects only the no-reader harness path, which was additionally exercised on all three backends through the full paired cells.
No policy stage, default activation, protocol, production Rust source, or service dependency changed.

### Measurement Review And Stopping Point

Final independent review covers the harness repair relative to `02302fe93e75390d808392abf44edd02468762f9`, the measurement scripts/probe and raw evidence, and the exact gate calculations above.
Reviewer `factory-performance-review` (`a3ea9489-535b-4afa-a38b-0d6c0d3389e4`) completed Standard review of the entire five-file change and its measurement inputs, outputs, and controlling boundaries.
Its disposition was **No actionable findings**, with no requested reproductions or implementation repair.
It independently recomputed all 60 workload samples, 30 workload pairs, 18 churn samples, and 12 allocation samples against the unchanged limits.
It also checked both source trees against their Git blobs and verified the source archive hashes, binary/configuration/activation provenance, directory repair, allocator behavior, and exact output/integrity contracts.
It did not run tests or benchmarks.

The frozen review identity is:

- change-review base and pre-commit HEAD: `02302fe93e75390d808392abf44edd02468762f9`;
- diff SHA-256: `d1d94862c216fbd91570915b73135a1928fca80f650f7f9d7ebddbb452dd3727`;
- source-manifest SHA-256: `3c189f3ffaaf0fbbd5f3322d7271009bb6c84d21629321548b1f7b0ba7073b5c`.

All five repository source hashes, 229 data/probe files, 15 tooling/log/provenance files, seven binaries, and 1,396 extracted source files matched at both reviewer boundaries and in the coordinator's verification afterward.
The reviewer directly inspected the failed and passing validation logs, including 25 passing script tests and the scoped native/generated-consumer gate.
Prior extended-matrix and editor-discovery results remain historical implementer-reported evidence.
Recorded workload intervals do not overlap; historical absence of other owned work is an execution record rather than something source inspection alone proves.

Six short memory churn executions ended before the 25-ms RSS sampler fired.
Their recorded zero peak is an absent sample, not a zero-memory measurement.
Churn acceptance concerns the measured open/close duration; the full workload cells provide the paired RSS evidence.
The current-thread allocation and noisy no-reader control limitations above remain unchanged.

The coordinator accepts Stage A's specified performance gates without changing thresholds or using the earlier deferral as a waiver.
Only plan/report review and commit bookkeeping changes after verification.
No production default is enabled, and no hard-memory or future-policy guarantee is inferred.
The next implementation stage is B, but it does not start in this measurement run.

Measurement checkpoint `27ff061eda2` (`perf(rust-service): validate document factory overhead`) commits the reviewed harness repair, regression, measurements, and acceptance record.
The following documentation-only commit records that identity.
The work stops at this committed boundary; nothing is merged or pushed.

## Stage B: Durable Storage Observations

### Authority And Scope

After accepting Stage A, the user authorized the next stage and another clean validated/reviewed stopping point.
The checkpoint-start base and pre-commit HEAD are `6fecba0ea093aa07f62038870bd2ea4b0d6aaca8`.
Work remains on `rust-service-session-interception` in `/workspaces/FluidFramework-session-interception`.
The user explicitly selected separate durable-file preparation and mutation observations through a concrete handle, without a new core trait.
Only Stage B is implemented; C through E, default factory activation, and session policy are unchanged.

`FileBlobs::write_pressure()`, obtainable through `SeaView::blobs()` before constructing a sequencer, returns an optional `DurableWritePressure`.
It is present only for durable storage.
`current()` reports each stage's requests, conservative byte charge, and fixed limits.
`wait_below(requests, bytes)` waits until both stages independently meet the inclusive ceilings, registering before checking to avoid lost releases.
Above-limit ceilings reject; readiness never reserves capacity.
The handle shares the existing semaphore authorities and a release notification, not the opening, worker, or filesystem lock.
Old handles terminate and do not follow replacement openings.

Both original 128-request/16-MiB budgets and their immediate saturation rejection remain unchanged.
The preparation and mutation stages overlap for some writes and are not a unique-backing-byte ledger.
Accepted mutation reservations remain in the same blocking-operation scope and survive caller cancellation.
Partial byte-admission failure explicitly releases the request before notifying.
Final preparation ownership releases both permits before notification.
Opening failure is sticky `Ambiguous`; shutdown/drop is sticky `Rejected`; the first terminal transition wins, matching existing invalidation.
There are no policy callbacks, permanent tasks, new service dependencies, or sequencer/transport changes.
Buffered preparation shares the reservation implementation but does not advertise this observation API.

No separate storage-to-sequencer handoff queue was introduced.
The unchanged application pipeline keeps its own 256-entry/4-MiB admission charge until result application and completion; control settlement retains one pending slot.
Storage pressure ends at blocking completion, not caller result consumption.
This does not bound caller-owned buffers, returned handles/results, transport memory, waiting observers, OS buffering, or total process memory.
Later decorators must bound pending payload work independently and admission must remain authoritative after an advisory wait.

### Tests And Development Corrections

Focused regressions cover separate and overlapping stage charges, actual final-owner release, waking every registered waiter, dropping a wait registration, and release racing the first poll.
They also cover sticky failure/shutdown before capacity drains, handle drop/reopen isolation without retaining the OS lock, cancelled accepted work retaining charges, partial admission rollback, and another document progressing while a hot document waits.
The existing cancelled-worker-panic regression now also checks that a waiting pressure observer receives `Ambiguous`.

Initial test development exposed misplaced module braces, a pinned-future borrow extending beyond document cleanup, and a Clippy `similar_names` warning; these were corrected before the final gates.
One initial expectation incorrectly assumed preparation and mutation never overlap while a blob write waits for worker capacity.
The actual path acquires both; the corrected test asserts one request and the same conservative byte charge in each separate stage.
These were development failures, not discarded measurements or changes to storage semantics.
Earlier focused commands passed 58 existing tests, then 65 tests and eight pressure-filtered tests as the regressions were completed.
Those early outputs are conversation history; the final command-attributed log is the acceptance evidence.

Evidence root:
`/home/node/.copilot/session-state/34f82e87-71c9-4d27-9572-80785c3995a8/files/stage-b-pressure/`.

`validation.log` records successful:

- `cargo fmt --all -- --check`;
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`;
- `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps`;
- `cargo build --workspace --all-targets`;
- `cargo test -p sea-file --doc` (zero executable doctests, not additional coverage);
- `node scripts/check-documentation.mjs`;
- `CARGO_BUILD_JOBS=4 bash test.sh --extended`.

The initial native workspace gate contains 388 passing tests and one browser-owned ignored fixture, including all 66 `sea-file` tests.
The extended gate separately runs that native fixture successfully, giving 389 native passes across the initial extended run.
The extended gate also passes the generated TypeScript/WASM consumers, integration and benchmark-correctness tests, and real Chromium transport matrix.
`policy.log` records passing `pnpm policy-check --path rust-service`.
Editor diagnostics report no errors in the changed Rust implementations.
No unrelated monorepo build or dependency installation was required.

### Frozen Write-Path Overhead Check

Before measuring, the plan selected three alternating primary durable64 pairs and three buffered64 control pairs.
Limits were the same conservative limits used for A: median paired CPU at most +5%, each p95 increase at most `max(10%, 1 ms)`, and each mean/peak RSS increase at most `max(10%, 16 MiB)`.
Primary baseline CPU variation must be at most 10%; its p95 stability check is also retained.
The workload uses 32 cached documents, eight service cores, native WebSocket generators, 1,000 operations/second, 64-byte payloads, three seconds of warmup and ten measured seconds.
Both hosts use direct construction with `SEA_EXPERIMENTAL_SESSION_FACTORY=false`.
The runner retains A's sample integrity, aligned CPU, offered-load, affinity, and resource guards.
No builds or tests ran during timed samples.

`provenance.log` establishes that the production crates, manifests, lockfile, Cargo configuration, and toolchain at the B base are unchanged from `02302fe93e75390d808392abf44edd02468762f9`.
The original Stage A candidate release server is therefore reused as B's baseline, with the same prior generator for both sides.
Its original build/source/binary evidence remains in the sibling `factory-performance/` directory.
The B candidate was built from a separate `git archive` of B's exact base, overlaid only with the changed `sea-file` source and included README.
`candidate-source.sha256` records every extracted file, including the new untracked pressure module; an archive of HEAD alone would not have included B.
`release-build.log` records the isolated locked release build with the same server and benchmark features.
The candidate-source manifest was verified unchanged after all samples.

Reproduction commands, from `rust-service/`:

```bash
node /home/node/.copilot/session-state/34f82e87-71c9-4d27-9572-80785c3995a8/files/stage-b-pressure/run-pairs.mjs primary
node /home/node/.copilot/session-state/34f82e87-71c9-4d27-9572-80785c3995a8/files/stage-b-pressure/run-pairs.mjs buffered64
```

The script refuses to overwrite an existing attempt; preserve evidence and use a distinct evidence directory for another campaign.
Each sample records its exact binary/generator hashes, command, environment, timestamps, configuration, raw resource samples, and result.
Both six-sample cells passed on their first attempt, without changing limits.

| Cell | Median paired CPU change | Baseline CPU variation | Result |
| --- | ---: | ---: | --- |
| Durable-file, 64 bytes | -0.3034% | 0.8493% | Pass |
| Buffered-file, 64 bytes | -1.0160% | 4.0214% | Pass |

All paired latency/RSS and per-sample integrity checks pass.
Primary p95 stability passes.
The largest paired increases are 0.001903 ms p95, 0.143653 MiB mean RSS, and 0.121094 MiB peak RSS.
The small negative CPU medians are not evidence of a speedup.
Measurements exercise the changed storage path with no pressure waiters; focused tests, not timing measurements, cover waiting/cancellation/failure.
No saturation, waiter-fan-out performance, or allocator-count result is claimed.
The timed generator submits events with no blob tree; the buffered control does not establish sustained preparation-path overhead.
Source inspection shows no new per-operation heap allocation: preparation replaces the contents of its existing `Arc`, and mutation reservations remain inline in the retained task.
The wrapper adds an `Arc` reference and notification work, increases retained value sizes, and adds per-opening budget/signal ownership.
These are not zero-overhead or total-memory-bound claims.

### Review Gate And Next Stage

Fresh Standard review must cover the complete tracked/untracked diff against the fixed B base, plus raw performance evidence, source/binary provenance, and all directly affected admission/lifecycle boundaries.
The coordinator owns terminal execution; the reviewer is read-only and may request focused reproductions.
At most two repair/review cycles are allowed after the initial review.
No unresolved blocking findings or missing required evidence may be treated as accepted.
The next implementation stage after a reviewed B commit is C, exposing the existing outgoing cache's count/byte and soft-budget observations without blocking accepted writes or enforcing a hard cache limit.
Do not begin C in this run.

### Initial Review Finding And Repair

Reviewer `stage-b-pressure-review` (`6d802534-6219-419d-b4be-a3c864dec265`) returned **Changes requested** after complete Standard review.
It verified all nine source hashes and all measurement/source/tool/binary manifests, inspected the full fixed-base diff and controlling lifecycle/admission paths, and independently recomputed all twelve samples and paired gates.
It did not execute tests or benchmarks.
The reviewed diff SHA-256 was `3ab247a9282027187d2e857aff500ae044d92bb13b3d84c1646200eb9fba1bea`; source-manifest SHA-256 was `4f83a1ae1a57a75e45abea9a1186d00818d9eefed1bb378444f17461fafe3aaa`.

One **MEDIUM, blocking** finding concerned cancelled shutdown during initialization.
`Factory::shutdown` irreversibly set the shared closed flag before awaiting initialization, but pressure was terminated only in the later drain.
Cancelling at that await could leave observers live permanently although admission was closed.
It could also let a registered waiter report available capacity instead of terminal rejection when its reservation drained.
The reviewer requested a deterministic cancellation test including an opening initialized after the fence.

`shutdown-reproduction.log` records the requested regression failing before the repair: the registered observer received zero wakeups instead of one.
The test holds all worker capacity so a real create operation retains initialization ownership, polls and cancels shutdown, then checks prompt rejection and sticky terminal state before and after releasing preparation capacity.
After releasing workers, it checks that the late-created opening's pressure is rejected and new mutation admission remains rejected.

The repair publishes terminal pressure to retained openings before shutdown's first suspension.
Newly initialized openings register first, release the registry lock, and then check the shared shutdown fence.
Either the shutdown snapshot sees the registration or that post-registration check sees shutdown.
Notification is outside the registry lock.
The existing initialization wait, durable drain ownership, admission rules, and successful-shutdown meaning are unchanged.
The README now distinguishes immediate terminal notification from successful draining.

`repair-validation.log` records all 67 `sea-file` tests passing, then the complete canonical format/Clippy/rustdoc/build/doctest/documentation and extended lifecycle gate passing again.
The extended run contains 389 workspace native passes, one ignored browser-owned fixture, and one separate successful execution of that fixture.
No new editor diagnostics were reported.
The reproduction failure and initial successful measurements remain preserved rather than overwritten.

`repair/` contains a separate exact-source snapshot, manifest, locked release build, runner, and all twelve repeated samples.
The only runner-path change resolves the prior accepted baseline directory from the additional nesting level; workload, activation, alternation, integrity gates, and thresholds are unchanged.
All samples pass on the first repaired-candidate attempt:

| Cell | Median paired CPU change | Baseline CPU variation | Result |
| --- | ---: | ---: | --- |
| Durable-file, 64 bytes | -0.6364% | 1.8828% | Pass |
| Buffered-file, 64 bytes | -0.8097% | 3.1731% | Pass |

Primary p95 stability passes; the largest paired increases are 0.030296 ms p95, 0.311719 MiB mean RSS, and 0.296875 MiB peak RSS.
These supersede the earlier candidate's performance numbers for final acceptance, without invalidating its historical evidence.
No speedup, sustained preparation-path, waiter-fan-out, allocation-count, or saturation claim is added.
The finding is repaired and reproduced locally, pending fresh review of the complete updated checkpoint against the same fixed base.
This uses the first of at most two repair/review cycles.

### Stage B Acceptance And Stopping Point

Fresh reviewer `stage-b-pressure-repair-review` (`45731bb2-5066-4534-b88a-2e72ae49ed5e`) reviewed the complete nine-file original-base checkpoint at Standard depth, not merely the repair.
It returned **No actionable findings**, verified the prior shutdown-cancellation finding resolved, and requested no further reproduction.
No changed scope or required boundary was excluded.
It inspected baseline/current admission, cancellation, error/unwind, shutdown/initialization, wait registration, handle ownership/replacement, shared buffered preparation, and sequencer handoff ownership.

The final reviewed identity is:

- fixed base and pre-commit HEAD: `6fecba0ea093aa07f62038870bd2ea4b0d6aaca8`;
- diff SHA-256: `967c7402ab5d35fd6300acbbf7896c755b03d0a11e8dc9dc122824601b776fc2`;
- source-manifest SHA-256: `078159c55763d68377cb1f77815a8f6c7e45ac31d2589842e872f6c5606d4599`.

The reviewer verified all nine worktree source hashes at both review boundaries, plus 703 frozen source files, 38 measurement files, nine tooling/log entries, and three binaries.
It inspected the failure/passing validation evidence and independently recalculated all twelve repaired samples and paired gates.
Its execution was limited to read-only inspection, hashing, and calculations; tests/builds/benchmarks remained coordinator-owned.
The coordinator then verified all frozen source/evidence manifests unchanged in `repair/post-review-verification.log`.
Only plan/report review and commit bookkeeping changed afterward.

Stage B is accepted with no unresolved blocking finding and no validation or performance exception.
The one confirmed review defect was reproduced, repaired, and independently re-reviewed within the first repair cycle.
All stated measurement limitations remain: no sustained preparation-path, waiter-fan-out, saturation, allocator-count, hard-cache, or total-process-memory claim.
No policy is enabled and default session construction remains direct.

Stop after committing this checkpoint and recording its commit identity.
The next authorized implementation would be Stage C: outgoing shared-cache count/byte and soft-budget observations, preserving reader-required entries and accepted-write progress.
Stages D/E must still choose bounded waiting ownership, concrete decorator controls, and shared policy rules.
Nothing is merged or pushed.

Commit `66499d1d6fec2df4dabc6e707a8c437862c8a09b` (`feat(rust-service): expose durable storage write pressure`) contains the reviewed implementation, tests, changeset, and acceptance record.
The following documentation-only commit records this identity.
The implementation worktree was clean after the checkpoint commit; stop again after this bookkeeping commit, without beginning C.

## Stage D: Bounded Policy Decorator Controls

### Selected Contract And Implementation

After C, the user selected the recommended existing caller/host-driven close path.
Policy rejection makes decorated append authority terminal across clones, but no autonomous close owner or successful-durable-close claim is added.
The exact checkpoint base is `7a482a307d056b14a9a392a5dd9968dbb6bee7d8`.
The continued work remains in `/workspaces/FluidFramework-session-interception`, branch `rust-service-session-interception`.

The core implementation was delegated to `stage-d-decorators` (`1c2aa99c-0c6b-4b0e-b0c4-6e85c64c4f42`); it modified only core implementation, shared test fixtures, localized policy tests, and core documentation.
The coordinator implemented host composition, host limits/tests, activation, changeset, and plan/report updates and owns all validation and measurement execution.
The implementer is not the independent reviewer.

`DocumentPolicy` supplies synchronous session admission, live-reader admission returning a reader permit, write acquisition returning a bounded permit, and asynchronous write readiness.
`WriteRequest` borrows a submit, blob, or directory input without copying payloads.
`PolicyFactory` shares one `Arc<Policy>` across its document sessions and checks admission before opening the source.
It does not suspend between successful source opening and wrapping the returned session.
`PolicySession` preserves concrete blob/event handles and maps source/policy/terminal errors without hiding classification.

Write permits precede all FIFO and pressure suspension and release before invoking the source.
Submits share identity-scoped FIFO state and terminal authority across clones; only the head can enter source submission, and it retains its turn through completion.
State locks protect only short transitions, never policy callbacks, source calls, or awaits; wakeups occur outside locks.
Pre-source cancellation removes the turn without manufacturing acceptance.
After source entry, cancellation/failure terminates decorated append authority while the source retains its own accepted-work semantics.
Close marks terminal and wakes policy-paused operations without waiting for their admission.
Source close/reconciliation remains caller/host-driven; an abandoned close is not a completion barrier.
Control/snapshot operations bypass write-pressure waiting.

Reader permits are acquired before constructing an unbounded source read or entering a pending load.
They survive pending snapshot selection and remain owned by the returned live stream, releasing on cancellation, load failure, observed stream error/end, or drop.
Finite reads do not acquire them.
This prevents concurrent pending loads from bypassing document reader admission.
Reader permits do not retain payloads or source/session capabilities.
An unpolled revoked stream may keep its admission permit until dropped, even though the cache separately releases retained entries.
The generic wrapper does not create a second cache-retention registry or promise unpolled generic-stream eviction.
Stage E will use the existing opening-local cache revocation capabilities.

The server adds default-off `SEA_EXPERIMENTAL_RESOURCE_POLICY=true` and `BuiltInSeaHost::new_with_policy`.
The executable rejects simultaneous pass-through and policy activation and prints the selected policy mode.
Each retained document owns one bounded policy with 128 pending-write slots, 16 MiB logical input charges, and 128 live-reader permits.
The policy is immediately ready after bounded admission: no storage pressure waiting, output-pressure refusal, shedding task, or autonomous close owner yet.
Normal and pass-through host modes remain unchanged.
Logical input charges exclude larger shared backing allocations, never-polled caller futures, and transport buffers.

### Validation And Development Repairs

Evidence root:
`/home/node/.copilot/session-state/34f82e87-71c9-4d27-9572-80785c3995a8/files/stage-d-controls/`.

All 38 core tests pass, including twelve localized policy tests for pre-source admission, bounded waiting cancellation, FIFO/failure prefix, terminal clones, close independent of policy waits, pending-load reader admission, source error classification, progress/stream cleanup, and capability forwarding.
The browser-local core fixtures compile with `cargo check -p sea-core --tests --target wasm32-unknown-unknown`.
Host tests exercise direct/pass-through/policy opens, document-wide reader reservations, refusal before cache registration, load refusal, and release/replacement.
The concrete bounded policy test verifies request/byte/reader saturation, partial acquisition rollback, and permit release.

`focused-validation.log` preserves the first strict-lint failure: a policy test used similar names `clone` and `close`; the delegate renamed the clone binding.
`host-validation.log` preserves a coordinator test-module placement error repaired before compilation.
`validation.log` preserves a missing `SessionFactory` import in the new host test; it was added.
`host-validation-repair.log` and `validation-repair.log` record the corrected successful checks.
No failing attempt or measured sample was overwritten.

Final checks pass: format, workspace strict all-target/all-feature Clippy, strict rustdoc, all-target build, core/server doctests (zero executable tests), core WASM test compilation, documentation checker, scoped policy, and the extended gate with policy activation.
The extended native workspace has 410 passing tests and one ignored browser-owned fixture; the browser harness separately runs that fixture successfully.
Generated TypeScript/WASM consumer, integration, benchmark-correctness, and Chromium transport tests pass.
Executable activation markers in the integration log show `EXPERIMENTAL_RESOURCE_POLICY=true`.
Default-mode core/server tests also passed before the enabled extended gate.
Editor diagnostics report no errors.

### Frozen Bounded-Policy Measurements

Before measuring, the plan retained median CPU +5%, every paired p95 `max(10%, 1 ms)`, and every paired mean/peak RSS `max(10%, 16 MiB)` limits.
The primary requires CPU variation at most 10% and stable p95.
Three alternating pairs each compare the accepted C direct cached host to the D bounded-policy cached host for durable64, memory64, and memory8192.
Workload, affinity, source/binary provenance, resource guards, aligned CPU and integrity checks are unchanged from C.
The policy path intentionally adds guarded futures/streams; no zero-additional-allocation requirement or claim applies to it.

`provenance.log` compares every production crate/configuration/manifest/toolchain file of C's frozen binary source with D's exact Git base.
The candidate archive overlays all changed and untracked crate files, including the new policy modules/tests and included READMEs.
`candidate-source.sha256` records the complete frozen inputs and is verified after samples.
`release-build.log` records the locked isolated release build; both sides use the same earlier generator.
The runner checks `EXPERIMENTAL_RESOURCE_POLICY=true` on candidate samples and the absence of that marker in the original C baseline.
Pass-through remains off on both sides.
No builds/tests ran during timed samples.

All eighteen samples pass on their first attempt:

| Cell | Median paired CPU change | Baseline CPU variation | Result |
| --- | ---: | ---: | --- |
| Durable-file, 64 bytes | +0.3590% | 1.2449% | Pass |
| Memory, 64 bytes | +1.2387% | 4.7978% | Pass |
| Memory, 8,192 bytes | +1.5652% | 1.8307% | Pass |

Primary p95 stability and every paired/sample gate pass.
Largest paired increases are 0.146724 ms p95, 0.546680 MiB mean RSS, and 0.539063 MiB peak RSS.
This exercises full bounded policy decoration, not storage-pressure waiting, active shedding, waiter fan-out, or allocator counts.
The frozen runner and per-sample commands/configuration/timestamps/resources/results remain in the evidence directory.

### Review And E Boundary

Fresh read-only Standard review must cover the complete original-base scope and the new policy/state-machine, host-composition, admission/lifecycle, stream/error/handle, native/WASM, and performance boundaries.
The coordinator owns terminal reproductions and at most two repair/review cycles are allowed.
Do not commit on unresolved blockers or missing evidence.
After D acceptance, E supplies the concrete storage/cache feedback and independent coalesced reader-shedding driver, retaining the selected caller/host closure contract.

## Stage C: Outgoing Soft-Budget Observations

### Resumed Authority And Implementation

After B's stopping point, the user authorized the remaining plan through completion, a blocker, or a need for guidance.
Sequential validated/reviewed checkpoints remain mandatory; completing one stage alone no longer requires stopping.
The Stage C fixed base and pre-commit HEAD are `e8fc540c3a2ada51c389267529b345bc4717a74d`.
The worktree and branch remain `/workspaces/FluidFramework-session-interception` and `rust-service-session-interception`.

The existing live cache keeps its deque, reader cursors, and immediate reclamation of entries no attached reader needs.
It now maintains the canonical payload-byte total and attached-reader count at the ownership transitions that already occur under its short state lock.
`LiveCacheStats` snapshots are constant-time rather than scanning retained events and subscriptions.
Entry length, allocated entry capacity, and total subscription count still come directly from their owning collections.
Reclamation subtracts each removed payload's exact canonical length; attach, removal, session cleanup, and termination maintain the claim count.

`LocalSequencer::live_cache_pressure()` returns a concrete `LiveCachePressure<Storage::Error>` for cache-enabled openings and `None` otherwise.
It holds only a weak cache reference, never a sequencer or storage view.
`current()` reports ownership or the classified terminal error.
`wait_above(entries, payload_bytes)` waits for either retained total to exceed its supplied target; `wait_below` waits for both to be at or below their targets.
Zero and maximum-size targets are valid.
Each wait registers before sampling, rechecks authoritative state after coalesced notifications, and holds no strong cache reference across suspension.
Cancellation drops only its receiver; cache destruction wakes receivers and returns `Closed`.
Targets are advisory and observer-selected, not per-document admission configuration or a hard memory bound.

A separate coalesced watch channel carries pressure changes.
This avoids making every dequeue into readiness for sibling live readers.
When no pressure waiters exist, notification does not update the watch value.
Ownership updates and notifications remain separate: notification occurs after releasing the cache state lock.
No policy callback/task, storage/sequencing barrier, reader eviction, subscription admission rule, spare-history retention, or default activation is added.
Progress remains cache dequeue: returned `Bytes`, transformation buffers, and transport in-flight items can retain memory after the reported total falls.

### Validation

Evidence root:
`/home/node/.copilot/session-state/34f82e87-71c9-4d27-9572-80785c3995a8/files/stage-c-pressure/`.

`initial-validation.log` and `focused-validation.log` record passing implementation and affected-crate checks.
The final sequencer suite has 78 passing tests, including six new regressions:

- inclusive/both versus exclusive/either threshold semantics, retained entries above targets, and downstream ownership after dequeue;
- pressure notifications do not turn dequeue into sibling-reader readiness;
- every registered waiter is woken and cancellation removes its registration;
- registration racing publication cannot strand a waiter;
- terminal classification and cache destruction, without a waiter retaining the cache;
- independent recounts covering repeated attach, historical handoff, session cleanup, drop, and termination.

The first two bullets share one test; the sixth new test exercises the public observer through the sequencer and confirms that continued writes settle above the soft targets, dequeue drains pressure, and shutdown is terminal.
Existing cache tests continue to cover failed handoff, storage invalidation, revocation, cancellation, and exact backing ownership.
No failed validation attempt was discarded.

`validation.log` records passing workspace format, strict all-target/all-feature Clippy, strict rustdoc, all-target build, sequencer doctests, documentation check, and `CARGO_BUILD_JOBS=4 bash test.sh --extended`.
The doctest target has zero executable tests.
There are 395 passing workspace native tests and one ignored browser-owned fixture; the extended gate separately runs that fixture successfully and passes the generated TypeScript/WASM consumers, integration, benchmark-correctness, and Chromium transport matrix.
`policy.log` records passing scoped repository policy; editor diagnostics report no errors in the changed Rust files.

### Frozen Overhead Measurements

Before measurement, the plan selected the existing CPU +5%, paired p95 `max(10%, 1 ms)`, and paired mean/peak RSS `max(10%, 16 MiB)` limits.
The primary must retain CPU variation at most 10% and stable p95.
Three alternating pairs each cover durable64, memory64, and memory8192.
The workload remains direct cached hosts, 32 documents, eight service cores, native WebSocket generators, 1,000 operations/second, three warmup seconds and ten measured seconds.
The runner retains the existing affinity, resource, offered-load, integrity, and aligned-CPU guards.
No owned builds or tests ran during samples.

The baseline reuses B's final repaired release server.
`provenance.log` compares every production crate file, manifest, lockfile, Cargo configuration, and toolchain file in that frozen B source against the exact C Git base.
The candidate is an archive of C's base overlaid only with the three changed sequencer Rust files and the included README.
`candidate-source.sha256` records every source file and was verified unchanged after measurement.
`release-build.log` records the isolated locked release build with the same server/benchmark features.
Both sides use the same earlier native generator; no driver source or workload changed.

`run-pairs.mjs` runs the `primary`, `memory64`, and `memory8192` cells.
It refuses existing output directories; preserve the original evidence and use a distinct directory for another campaign.
Each sample retains commands, environment, timestamps, binary/generator hashes, configurations, raw resources, and results.
All eighteen samples passed on their first attempt:

| Cell | Median paired CPU change | Baseline CPU variation | Result |
| --- | ---: | ---: | --- |
| Durable-file, 64 bytes | +0.1494% | 1.0202% | Pass |
| Memory, 64 bytes | +1.0805% | 1.8385% | Pass |
| Memory, 8,192 bytes | -2.2541% | 2.9881% | Pass |

Primary p95 stability and every paired/sample gate pass.
Largest paired increases are 0.037340 ms p95, 0.028418 MiB mean RSS, and 0.050781 MiB peak RSS.
The negative control median is not a speedup claim.
There are no pressure observers in the measured workload, and these samples do not establish waiter-fan-out, saturation-policy, or allocator-count performance.
The implementation adds per-cache watch state and per-transition bookkeeping; it does not add a per-event heap object.
No total-process or hard-cache memory guarantee is inferred.

### Review And Continuation Gate

Fresh Standard review must cover the complete tracked/untracked original-base diff and all affected publication, reclamation, handoff, lifecycle, notification, and observation boundaries.
The reviewer is read-only; the coordinator owns execution and any requested reproductions.
The usual maximum two repair/review cycles applies.
Once C passes this gate and is committed, proceed to D/E under the user's resumed authority unless a concrete design decision requires guidance.

### Stage C Acceptance

Reviewer `stage-c-pressure-review` (`75c9bbea-9774-4c8f-9137-a71a4f273df4`) completed Standard review of the entire seven-file checkpoint against `e8fc540c3a2ada51c389267529b345bc4717a74d`.
The disposition was **No actionable findings**, with no scope exclusions, unresolved required evidence, or requested reproductions.
It inspected the actual fixed-base diff, counter ownership transitions, publication/handoff/reclamation, lifecycle and storage invalidation, exact backing ownership, generic error/Send constraints, and the pinned Tokio watch implementation.

The reviewed diff SHA-256 was `888840fe0edb484372db6a8f2589354423c28aab1782e9d840340e9865142fef`; source-manifest SHA-256 was `8211d4b84ce520c5f7b2f583b403508f54db7af52473cd1c042a9b6489fbf1ac`.
The reviewer verified all seven source hashes at both review boundaries, plus 703 candidate-source files, 57 measurement files, 12 tooling/log entries, and three binaries.
It inspected the validation logs and independently recalculated all eighteen samples' alignment, integrity, resource, and paired gates.
No tests, builds, benchmarks, edits, or delegation were performed by the reviewer.
The coordinator reverified the unchanged frozen source and evidence in `post-review-verification.log`.
Only acceptance/commit bookkeeping changed afterward.

Stage C is accepted without a validation/performance exception or repair cycle.
The same limitations remain: targets are advisory, cache dequeue excludes downstream retention, and the timed samples have no pressure waiters or saturated policy.

Read-only exploration of D/E identified the next concrete design decision: cleanup ownership after policy rejects an application submission because bounded waiting admission is exhausted.
The author-session contract requires the first append failure to terminate append authority across clones.
Existing compression/encryption adapters and host closure provide prior art, but do not by themselves promise autonomous durable cleanup for a new generic decorator after its caller disappears.
Choose between caller/host-driven close with explicitly terminal wrapper authority, or an independently polled retained close owner.
The former is the simpler recommendation; the latter adds a stronger lifecycle guarantee requiring additional native/WASM ownership machinery.
Ordinary pre-admission waiting cancellation, reader-only revocation, and already accepted source work must retain their distinct existing semantics.
No D/E source changes have been made before this choice.

Commit `3e782da73c721b3a2d4a7c2f7867c6f74f2a13fd` (`feat(rust-service): expose outgoing cache soft-budget pressure`) contains the reviewed Stage C implementation, tests, changeset, and acceptance record.
The following documentation-only commit records this identity.
The worktree was clean after the implementation commit; pause for the recorded D/E lifecycle decision after committing this bookkeeping.
Nothing is merged or pushed.

### Current Resume State: Stage D

The user resolved the C stopping-point decision in favor of caller/host-driven close.
Stage D is implemented, validated, and measured; its detailed record is under [Stage D: Bounded Policy Decorator Controls](#stage-d-bounded-policy-decorator-controls).
The C stopping-point directions above are historical and no longer pause execution.
Fresh complete Stage D review is the next gate before committing and continuing to E.

### Stage D Acceptance

Reviewer `stage-d-controls-review` (`96d23802-dd92-4b94-abae-76cda24b58d9`) completed Standard review of all thirteen changed files against `7a482a307d056b14a9a392a5dd9968dbb6bee7d8`.
It returned **No actionable findings**, with no scope exclusions or requested reproductions; no repair cycle was consumed.
Coverage included admission/FIFO and cancellation, terminal clones, source settlement and close forwarding, reader/load lifetimes, concrete handles, transformations, document sharing, dispatcher closure, connection-token replacement/reconnect cleanup, and existing cache revocation.
Third-party policy accounting and nonblocking callbacks remain documented responsibilities rather than enforced behavior of arbitrary policies.

The reviewed diff SHA-256 was `415dc986493ce3e003d69710fc93547f05c8d571397ab4e94d2c1db9faf47a98`; source-manifest SHA-256 was `88e897eec3ac038f37812b41b2f1fab1de04f3acf793060c3ee1fa85ff47d99b`.
All thirteen worktree hashes matched at both review boundaries.
The reviewer inspected successful and failed validation logs, verified the source/binary/tool/measurement manifests, and independently compared baseline production inputs and recomputed all eighteen samples and gates.
It ran only read-only inspection, hashing, and calculations.
The coordinator reverified frozen manifests in `post-review-verification.log`.
Only acceptance/commit bookkeeping changed afterward.

Stage D is accepted without validation or performance exceptions.
Continue to E after committing D; storage/output feedback and active shedding are not supplied by D's bounded immediately-ready host policy.
