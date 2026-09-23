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
