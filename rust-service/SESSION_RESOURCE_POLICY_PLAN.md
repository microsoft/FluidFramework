# Document Session And Soft-Budget Resource Policy Plan

Revised: 2026-09-26.
Status: Stages A and B accepted; stopping before Stage C.
Execution worktree: `/workspaces/FluidFramework-session-interception`.
Branch: `rust-service-session-interception`.
Starting revision: `b89ec852722d3373bd38f9780f5676973a33c117`.
Evidence and historical checkpoint results: [implementation report](SESSION_RESOURCE_POLICY_IMPLEMENTATION_REPORT.md).

This is an implementation plan, not a claim of currently supported resource guarantees.
On 2026-09-26 the user authorized updating this plan, salvaging useful local changes, and committing progress at the next clean stopping point.
That authorization stopped after the revised factory foundation was committed and the worktree was clean.
Do not merge or push.
Use sequential checkpoints, not parallel-iteration machinery.

The user subsequently approved a clean commit of the functionally validated, independently reviewed foundation with performance acceptance still pending.
This exception defers the measurement campaign below; it does not change its limits or count as a performance pass.
The factory remains opt-in.
At that stopping point Stage A was not performance-accepted.
Stages B through E were not authorized in that foundation run.
The user subsequently authorized resuming the performance campaign.
Its completed measurements and harness repair are recorded below and in the cumulative report.
After that clean stopping point, the user authorized Stage B, stopping before C.

## Change Of Direction

The previous plan required a strict per-cache retention bound, including finite publication overshoot, while policy decisions ran outside sequencing and cache locks.
That combination led to a proposed one-publication-obligation protocol and lifecycle-gate restructuring.
The user now explicitly permits an outgoing queue to exceed its budget while live readers still need its entries.
Its budget is therefore a **soft target and pressure signal**, not a hard memory limit.
The strict-bound publication protocol is not needed and must not be implemented as a prerequisite.
Keep its rationale and limitations as historical evidence in [Decision 0028](historical/decisions/0028-session-factory-ownership-probe.md), not as active tests or acceptance requirements.
The revised direction is recorded in [Decision 0029](historical/decisions/0029-document-soft-budget-policy.md).

Completed cache checkpoints 0, 1, and 1a remain historical results.
Their accepted performance/evidence exceptions are not retroactively changed.
The old checkpoint 2 was a reviewed, uncommitted draft, not a completed performance acceptance.
Old checkpoint numbers 3a, 3b, 4, and 5 are superseded by stages A through E below.
No supervisor, actor, receipt framework, strict bound, or storage-pressure design from the old proposal is automatically required.

## Intended Architecture

1. Storage owns its inbound mutation accounting and authoritative admission limits.
   Start with durable-file storage; use fixed document-opening configuration unless a real use case requires more.
   Memory storage does not report disk-drain pressure.
   Buffered-file storage accounts for application-owned buffering, not operating-system page cache.
2. Existing bounded sequencing and storage ownership may overlap.
   Do not add a unified accounting ledger merely to assign every byte to one budget.
   If a distinct storage-to-sequencer handoff queue is introduced, retain its charge until consumption or cancellation actually releases its payload.
3. One shared outgoing queue/cache retains settled events and reader progress.
   Remove entries no reader needs; optional spare-history caching is a later heuristic.
   If readers prevent reclamation, retain required entries even when over budget.
4. A per-document session factory can be implemented by local sequencing, network clients, and factories that inject session decorators.
   Document creation and network connection/stream admission remain separate boundaries.
5. Decorators preserve session semantics while optionally rejecting admission, waiting before new work, terminating one subscription, or closing a session.
6. Policy-enabled sessions share one document-wide policy instance, using `Arc` on native or appropriate local ownership on WASM.
7. Ordinary construction code or a closure supplies storage/output observations to that policy.
   Do not add a generic service-factory hierarchy or require a policy trait to expose `new` unless concrete callers need it.
8. Begin with a small explicit rule set for storage pressure, output pressure, reader admission, and shedding.
   No adaptive balancing, tenant quotas, billing, or aggregate host-resource ledger is required.

Storage/cache code provides observations and narrow actions; policy chooses thresholds and responses; decorators/hosts apply the decisions.
Do not send local pressure observations over the protocol merely because network clients implement the same factory contract.

## Contracts That Remain Mandatory

### Accepted Work And Cleanup

- Apply backpressure before entering a new application mutation, not after it has been accepted.
- Already accepted writes, storage reconciliation, internal controls, authority revocation, close, and cleanup must not wait for reader consumption or output credit.
- Preserve accepted-prefix ordering, ambiguous results, snapshot authority, durable writer-reference floors, and at-most-once required departure.
- Dropping a wrapper or close waiter is not successful durable closure.
  Identify a polling owner only for cleanup the selected policy actually promises to complete autonomously.
- Preserve incarnation-specific token cleanup, replacement isolation, rejected-binding isolation, and the existing distinction between reconnect grace and prompt signal/publisher revocation.
- Subscription termination must not close sibling reads or revoke author/snapshot authority.
- No new policy callback runs under storage, cache, sequencing, or lifecycle-gate locks.
  Observing state and applying identity-scoped actions may use short synchronization; callback evaluation must not retain those guards.

### Pressure And Memory

- Pressure is advisory; a ready signal is not an atomic capacity reservation.
  Storage admission remains authoritative under racing writers.
- Bound or reject waiting admission before accumulating unbounded pending payloads.
  Suspended futures and network request buffers still own memory.
- Do not hold blocking-worker capacity or locks needed for progress while waiting for policy admission.
- Output budget overruns are allowed; no finite RSS, hard cache bound, or finite overshoot is claimed.
  A delayed policy task or unmanaged writer may continue increasing retained history.
- Report actual owned backing bytes where practical, not just sliced payload lengths.
  Distinguish canonical cache allocations, metadata, storage staging, and downstream handles.
- Use level-triggered state or registration/recheck to avoid missed wakeups.
  Terminal storage failure must wake waiters with a classified error, not masquerade as readiness.
- A pressure-paused writer must have a path to resumption or explicit failure that does not depend on a stopped reader polling.
  Select the simplest finite policy when output pressure can pause writers.

### Reader Ownership

- Keep the existing deque and reader cursors unless measurement demonstrates a reason to replace them with per-entry reader counts.
- Historical handoff must remain coherent under publication/reclamation; no gaps, duplicates, or silent loss.
- Decide explicitly whether progress means dequeue or complete local/transport delivery.
  Current local cache progress is dequeue-based.
  For transport accounting, retain send ownership to full write or separately bound/account the in-flight item.
- Drop, cancellation, transformation failure, and subscription termination release ownership exactly once without fabricating delivery.
- Refusing a new session is not sufficient to refuse new readers: existing sessions can open multiple `read`/`load` subscriptions.
- Direct/unmanaged paths remain explicit.
  They need not provide policy guarantees, and cannot be included in a claimed managed bound merely because they share a cache.

## Existing Implementation To Reuse

- Durable-file mutation admission already limits each opening to 128 requests and 16 MiB of charged input; saturation currently rejects.
- Buffered-file already accounts for queued/in-flight work and bounded waiting inputs; exclude OS buffering.
- Sequencer application admission already limits queued/in-flight work to 256 entries and 4 MiB.
  Do not remove this cancellation/ordering machinery as an incidental resource-policy cleanup.
- The live cache already shares canonical payloads, tracks cursors, provides neutral revocation, and wakes on invalidation.
  Generic/direct construction remains storage-backed by default; the built-in server cache defaults on with an explicit off switch.
  Its accepted unbounded-retention risk remains.
- Existing connection binding already scopes operations and cleanup to admitted incarnations.
- The salvaged factory draft preserves concrete handles and forwards underlying futures/streams without an extra steady-state future box.
  It does not promise automatic closure or policy behavior.

## Stages And Exit Checks

### A. Salvage The Document Factory Foundation — Accepted

Keep the per-document factory contract, local-sequencer adapter, pass-through decorator, useful native/WASM tests, and opt-in host composition.
Remove the redundant service-factory wrapper and the standalone publication protocol model.
Keep an explicit direct path for comparisons.
Exercise the contract with a real network-client adapter that opens independent sessions on one fixed document; do not retarget an existing session incarnation.
Compile platform-appropriate adapters without erasing availability handles.
Generated local memory construction can remain explicitly direct; do not advertise it as policy-managed.

No resource policy, pressure signals, automatic lifecycle owner, storage admission change, or production sequencing/cache rewrite belongs in A.
Update API documentation and a changeset.
Run the applicable [Development](DEVELOPMENT.md) gates and focused forwarding/cancellation tests.
The frozen overhead comparison below has now run and passed independent evidence review.
Obtain a fresh independent Standard review of the complete fixed-base change.
Commit only after passing gates or an explicitly accepted, recorded exception.
Do not reinterpret missing evidence as a pass to obtain a clean tree.

### B. Expose Storage Pressure

The user authorized B after Stage A acceptance, stopping at another validated/reviewed commit before C.
Fixed checkpoint base: `6fecba0ea093aa07f62038870bd2ea4b0d6aaca8`.
The user selected separate durable-file preparation and mutation observations, without a new core trait or combined ledger.
Expose a concrete handle through `FileBlobs` (available via `SeaView::blobs()`), preserving fixed 128-request/16-MiB budgets and immediate saturation rejection.
The handle supplies advisory samples and a level-triggered wait for both stages to be at or below caller ceilings.
It must not retain the document or its lock, reserve capacity, run policy, or follow replacement openings.
Terminal errors remain sticky and wake waiters; cancellation removes only the wait registration.
Memory and buffered storage have no advertised pressure observation.

Before measurement, select the same conservative overhead limits as A for B's changed write path: median paired CPU increase at most 5%, each paired p95 increase at most `max(10%, 1 ms)`, and each paired mean/peak RSS increase at most `max(10%, 16 MiB)`.
Use three alternating cached durable-file/64-byte native WebSocket pairs against this checkpoint's unchanged Rust baseline, with a buffered-file control because preparation is shared.
Keep A's workload and sample-integrity/resource guards; require primary baseline CPU repeatability within 10%.
These checks exercise publication with no pressure waiters; focused tests cover waiting observers.
No new service dependency, extra per-operation heap allocation, storage protocol, or sequencer changes are intended.

Reuse storage-owned accounting, starting with durable-file.
Select fixed configuration and the smallest observation needed by the first policy.
Distinguish queued writes from generic worker utilization: reads and cleanup also use workers.
Decide whether saturation waits or rejects, preserving ordered admission and cancellation.
Keep failure classification and existing admitted work intact.
Test races, bounded waiting ownership, cancellation, shutdown, and unrelated-document progress.
No need to unify storage-to-sequencer accounting unless an actual unbounded interval is found.

### C. Expose Outgoing Soft-Budget Pressure

Add maintained count/byte observations and a soft-budget pressure signal to the existing shared cache.
Preserve required entries when over budget; reclaim unneeded entries without invoking policy under locks.
Initially reclaim immediately rather than adding speculative spare-history caching.
Document dequeue versus transport-send ownership and downstream retained allocations.
Test stopped readers, drop/revocation, handoff, invalidation, and progress while over budget.
Do not add a publication barrier or block accepted writes to make the soft budget hard.

### D. Add Minimal Decorator Controls

Support pre-allocation session rejection, pre-operation waiting, reader admission, subscription-only termination, and explicit session closure as required by the first policy.
Keep native/WASM ownership and cancellation semantics explicit.
For promised autonomous actions, identify who drives completion if the caller disappears.
Reuse existing settlement and transport ownership rather than building a second lifecycle state machine.
Test blocked sends and all managed event-producing paths, including `load`, transformations, snapshot catch-up, and replacement.
Only add delivery receipts or retained-close infrastructure where a concrete required test demonstrates the need.

### E. Compose One Shared Document Policy

Construct one policy from storage and outgoing-pressure observations; share it across document session decorators.
Start with explicit rules: storage pressure pauses new application writes; output pressure can reject new live subscriptions and shed lagging readers.
If output pressure also pauses writers, select an independent finite resumption/failure route.
Keep asynchronous policy work bounded/coalesced and independently runnable without reader polling.
Test real transports, durable/buffered storage, native/WASM consumers, and Fluid replacement/recovery.
Measure policy-off versus policy-on on the same implementation.
Claim only tested managed behavior, not total-process or hard cache-memory bounds.

Stop at each coherent validated/reviewed commit; do not add the next layer to rescue an unexplained regression.
Choose numerical budgets for B through E before measuring their respective changes.

## Frozen Factory Measurement Gates

The user approved these limits before factory measurement; they remain unchanged:

- Median paired service CPU per delivered event: at most 5% increase.
- Each paired p95 latency increase: at most `max(10%, 1 ms)`.
- Each paired mean/peak RSS increase: at most `max(10%, 16 MiB)`.
- Median open/close cost: at most 10% increase.
- No additional steady-state per-operation allocations.

Use explicit caching on both sides: cached direct versus cached pass-through.
Primary: durable-file, 32 documents, one writer and one observer per document, 64-byte payloads, 1,000 total operations/s, 3-second warmup, 10-second measurement, and exact drain.
Use three alternating pairs: direct/wrapped, wrapped/direct, direct/wrapped.
Include memory/buffered controls, 8,192-byte payload controls, no-reader controls, and local open/close measurements.
Retain failed attempts and exact source/binary/toolchain/configuration provenance.
Measure the host document-wrapper change against the original direct path as well as same-foundation direct/wrapped paths if it changes measured cost.
Do not hide that overhead inside a shared foundation.
Use isolated target directories for source snapshots.
No concurrent owned builds/tests during measured samples.

Keep prior guards: 120 seconds per sample, 4 GiB sampled service RSS, exact acknowledgment/delivery or finite replay, bounded outstanding requests, at least 8 GiB available memory and 4 GiB free disk before builds/samples.
Primary instability or failed acceptance stops the campaign for diagnosis; tolerances require user approval to change.
Performance acceptance is independent of functional test success.

## Validation, Review, And Resume Record

Use [Development](DEVELOPMENT.md) as the authority for affected-crate, workspace, generated-consumer, extended/browser, documentation, and policy checks.
Run extended tests where lifecycle, transport, or WASM-facing boundaries are affected.
Run root `pnpm build:fast` only when that guide requires it; do not reintroduce an unrelated monorepo build as a ceremonial gate.
Use the [checkpoint review workflow](../.github/skills/checkpoint-review/SKILL.md): fixed base, complete tracked/untracked snapshot, one fresh Standard reviewer, shared criteria, and at most two repair/review cycles.
No commit on unresolved blocking findings or missing required evidence without explicit exception.

Before stopping, record here and in the cumulative report:

- actual commits and remaining stage;
- source, evidence locations, checks and failures, limitations, and review dispositions;
- exact next action and unresolved design choices;
- whether production behavior changed and which opt-ins are still required.

Current transition: the original draft is backed up outside the worktree in the session's `files/soft-budget-reset/` directory as a tracked diff plus an archive of untracked additions.
Historical logs and reviews remain in the cumulative report.
The strict-bound publication detour is retired, not accepted as production design.
At the foundation stopping point, no resource-observation or policy stage had started.

The foundation passes workspace format, strict Clippy/rustdoc, native build, native/WASM checks, scoped policy, and the extended generated-consumer/integration/browser gate.
The final extended run contains 380 passing native tests and one browser-owned ignored fixture.
Local churn smoke checks pass on all three backends in both modes; these are correctness checks, not the deferred measurements.
Earlier compilation, test-expectation, environment-configuration, missing-dependency, and timeout failures are preserved with their repairs/rechecks in the cumulative report.
Default host construction remains direct.
Fresh complete fixed-base Standard review found no actionable findings.
The coordinator verified all 22 source hashes and the staged diff unchanged after review.
Only gate/commit bookkeeping changed afterward.
The original clean stopping point accepted the foundation under the performance-timing exception, not Stage A performance acceptance.

### Resume After The Foundation Commit

Commit `9edf2b2dc1a` contains the reset and reviewed factory foundation; its parent is the fixed comparison base above.
Documentation commit `02302fe93e7` records that original stopping point.
Use the latest dated section of the cumulative report for final checks and review identity.

The new `sea-benchmarks` `session-factory` binary provides bounded direct/pass-through open/close correctness and timing samples.
Its allocation count is explicitly unavailable, not zero.
The no-reader fixture also supports explicit direct/pass-through selection with live caching enabled.
See the [benchmark instructions](crates/sea-benchmarks/README.md) for exact commands.
Neither fixture alone supplies the full acceptance campaign.
Preserve the original direct-host baseline when comparing the extra retained document wrapper.
Do not reuse the old checkpoint-1 RSS helper unchanged: its 20%/32 MiB tolerance is not the frozen 10%/16 MiB factory tolerance.

### Resumed Performance Campaign

The original direct-host baseline is `b89ec852722d3373bd38f9780f5676973a33c117`; the candidate is `02302fe93e75390d808392abf44edd02468762f9`.
Both use live caching.
The candidate additionally runs a same-foundation direct-versus-wrapped comparison.
Isolated release targets, source manifests, binary hashes, configurations, commands, raw samples, and failed attempts are retained under the session's `files/factory-performance/` directory.
The cumulative report gives the full absolute evidence path and reproduction commands.

All 60 successful workload samples across ten three-pair cells meet the frozen CPU, p95, RSS, and integrity gates.
Primary median CPU cost is +0.19%; its baseline CPU variation is 0.69%.
The largest paired p95 increase is 0.084 ms; largest mean/peak RSS increases are 1.12/1.37 MiB.
The no-reader memory control is noisier (21.18% baseline CPU variation); only the primary has a frozen repeatability gate, and no control speedup is claimed.
Open/close medians pass on memory (+5.12%), buffered-file (+1.33%), and durable-file (+2.73%).
A separate current-thread allocator-instrumented memory submit/live-read probe reports zero extra allocations or allocated bytes in all six pairs.
That probe excludes factory opening/closure and file-worker/network allocation totals; it is not a process-memory bound.

The first no-reader run failed before measurement because its fixture received an already-created directory.
The runner now passes a new child path inside its owned temporary root; a regression test and all three repaired no-reader cells pass.
No production Rust source, dependency manifest, default activation, workload, or acceptance threshold changed.
The extra allocation-counter dependency exists only in the isolated measurement probe, not the service workspace.

Fresh Standard review found no actionable findings, independently recomputed all gates, and verified the complete source, binary, and measurement manifests.
The coordinator verified the unchanged evidence afterward and accepts Stage A's specified performance gates without a threshold exception.
Only review and commit bookkeeping changed after the reviewed snapshot.
Commit `27ff061eda2` records the accepted campaign and tested no-reader harness repair; the following documentation-only commit records this stopping-point identity.
The next implementation stage is B; do not start it in this measurement run.
When moving to B, choose fixed durable-storage configuration and a minimal advisory observation before adding a policy.
Check whether current storage-to-sequencer ownership actually leaves an unbounded interval; do not introduce a handoff ledger speculatively.
Leave lifecycle ownership and dequeue-versus-delivery accounting decisions to the concrete controls in C through E.

### Stage B Validation And Resume Boundary

The concrete durable-file handle now observes the existing preparation and mutation semaphores without adding a core trait, combined accounting ledger, admission wait, or policy task.
Each budget keeps its fixed 128-request/16-MiB limit and immediate rejection behavior.
The observation handle does not retain the opening or filesystem lock.
Release, cancellation, opening replacement, shutdown, and classified failure are covered by focused tests.
There is no new storage-to-sequencer queue: the existing application pipeline retains its own 256-entry/4-MiB charge through result application; control settlement has one pending slot.
Storage charges still end at blocking completion and do not measure returned results, caller-owned memory, or the outgoing cache.

Workspace format, strict Clippy/rustdoc, all-target build, documentation checks, scoped policy, and the extended native/generated-consumer/integration/browser gate pass.
After the review repair, the native workspace gate reports 389 passing tests and one browser-owned ignored fixture; the extended gate separately runs that fixture successfully.
All 67 `sea-file` tests pass.
The crate has no executable doctests; its doctest command succeeds with zero tests.

All twelve performance samples on the repaired candidate pass the preselected CPU, paired p95, RSS, and integrity gates.
Median paired CPU changes are -0.64% for durable64 and -0.81% for buffered64; no speedup is claimed.
Primary baseline CPU variation is 1.88%, and its p95 repeatability check passes.
The largest paired increases are 0.030296 ms p95, 0.311719 MiB mean RSS, and 0.296875 MiB peak RSS.
The sample path has no pressure waiters; no waiter fan-out, storage saturation, or allocation-count performance claim is made.
The timed generator submits events without blob trees; the buffered control does not establish sustained content-preparation overhead.
Source inspection finds no new per-operation heap allocation, but the permit wrapper and retained futures are larger and notification adds work.
Full provenance, commands, source/binary manifests, and raw samples are in the session's `files/stage-b-pressure/` evidence directory.

Initial independent review identified a cancellation gap between the irreversible shutdown fence and pressure termination.
The deterministic reproduction failed before repair; termination now precedes shutdown's first suspension, and late initializations check the fence after registration.
A cancelled shutdown therefore leaves terminal observers, without claiming successful durable draining.
The full lifecycle gates and exact-candidate measurements were rerun; initial evidence remains intact and repaired evidence is under `files/stage-b-pressure/repair/`.
Fresh complete fixed-base Standard repair review found no actionable findings and verified the shutdown repair, all source/evidence manifests, and the repeated measurements.
The coordinator verified the frozen state unchanged afterward and accepts Stage B without a validation or performance exception.
Only plan/report review and commit bookkeeping changed after that verification.
Stop with B committed and the worktree clean; do not implement C in this run.
Commit `66499d1d6fe` contains the reviewed Stage B implementation and acceptance record; the following documentation-only commit records this stopping-point identity.
The next step is C: expose count/byte and soft-budget observations on the existing outgoing cache, preserving required entries and leaving accepted writes independent of reader progress.
Later D/E must bound waiting caller memory and select concrete control/lifecycle ownership; this checkpoint does not solve those policies.
