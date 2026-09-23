# Live Read Cache And Session Policy Plan

Created: 2026-09-23.
Revised: 2026-09-23 to separate cache performance, wrapper overhead, lifecycle controls, and resource policy.
Status: checkpoints 0 and 1 completed; checkpoint 1 used approved base `c41a02a33d5ec09f737b912e6b60d0eae1f88ecb`.
The user accepted the checkpoint-1 performance tradeoff and missing-raw-evidence exceptions on 2026-09-23; required validation and independent review passed.
Checkpoints 2 through 5 are not authorized.
Checkpoint 1a is complete: the built-in server cache defaults on for controlled use with an explicit off switch and accepted unbounded-retention risk.
Decisions, frozen measurements, validation, and review are tracked in the cumulative [implementation report](SESSION_RESOURCE_POLICY_IMPLEMENTATION_REPORT.md).
Historical comparison baseline: `6231d99841a116edc0827ad9c37d1c4bf392f4f3`.
Implementation starts from an explicitly recorded, approved revision of `rust-service`, not from the live-buffer experiment.

This is an active design and implementation plan, not a description of supported behavior.
Implement the authorized checkpoints sequentially with focused commits and a cumulative evidence record.
Do not introduce parallel-iteration machinery unless the user explicitly requests a parallel iteration.

## Decision Summary

Prove each source of value and overhead separately, in this order:

1. Add a minimal shared live-read cache and measure whether it removes the storage-read cost for caught-up readers.
2. Add session-creation interception with a no-op, pass-through factory and decorator, then measure their overhead.
3. Prove that the factory can reject before session allocation and that decorators can terminate subscriptions or close sessions cleanly.
4. After those stages are validated and committed, implement simple count- and byte-based lag shedding to bound live-cache retention.
5. Optionally add production resource limits using the proven factory and decorator boundary.

Keep sequencing, ordered membership, reference validation, and storage settlement in `sea-sequencer`.
The cache supplies a shared delivery optimization at the publication boundary; it is not a fan-out admission ledger or a policy engine.
Reader progress may determine cache reclamation but must never constrain writer-reference eligibility or completion of accepted writes and internal controls.
Service-owned factories and decorators choose rejection, shedding, and any later quotas or rate policy.
Direct construction remains an explicit unmanaged mode, and pass-through adds no policy behavior.

Checkpoints 0 through 4 do not gate new writes based on reader output pressure; they culminate in subscription shedding instead.
Reader-output-based write gating belongs only to the separately authorized optional checkpoint 5, making the initial deliverable narrower than the earlier decorator-backpressure proposal.
This replaces the experiment's indefinite reader-protection guarantee with eventual subscription shedding when configured lag limits are exceeded.
The initial cache experiment deliberately does not establish production resource guarantees.
The slowest reader determines what can be reclaimed, but only an enforced lag threshold makes that retained history bounded.
Do not expand into aggregate accounting, storage-pressure gating, deadlines, or transport scheduling before the simpler stages justify their cost.

## Goals

- Remove repeated archive reads for caught-up readers through one shared event representation.
- Measure cache benefit before adding the session wrapper, then measure the wrapper independently.
- Keep transport, tenant, account, billing, rate, and deployment resource policy out of the sequencer.
- Provide a small optional session-creation and decoration boundary that supports later policy.
- Reject sessions before sequencer allocation and preserve clean cancellation and early closure.
- Observe output completion at the actual local or transport boundary.
- Terminate an individual lagging subscription without revoking author authority or unrelated reads.
- Permit an explicit whole-session shedding action through normal ordered session closure.
- Keep accepted-prefix, ambiguous-result, departure, snapshot, and reference-floor behavior unchanged.
- Bound cache retention with simple lag limits after the performance and lifecycle stages pass.
- Leave room for optional storage-pressure response, account quotas, rates, priorities, and billing without requiring them for initial completion.

## Non-Goals

- Do not port the experimental publication ledger, fan-out debt, or reader-delivery waits into writer admission or lifecycle work.
- Do not couple the cache's retention cursor to the durable writer-reference floor.
- Do not add transport scheduling, account identity, billing, or host resource counters to `sea-sequencer`.
- Do not infer that a blocked network write proves client failure.
- Do not retry ambiguous storage operations or change ordered session lifecycle semantics.
- Do not make storage responsible for selecting sessions to terminate.
- Do not require pass-through or the initial cache experiment to provide bounded aggregate service resources.
- Do not implement adaptive hysteresis, rate estimation, fair egress scheduling, or a general policy framework in the first stages.

## Architecture

| Boundary | Responsibility | First required stage |
| --- | --- | --- |
| Sequencer and storage | Ordering, accepted work, publication guarantees, recovery, writer-reference floor | Existing behavior |
| Shared live-read cache | Published events, live cursors, coherent archive handoff, reclamation | Cache experiment |
| Service and document session factory | Intercept opens before allocation, return decorated sessions | Pass-through experiment |
| Session and stream decorators | Forward every facet, preserve ownership, apply explicit lifecycle actions | Pass-through and lifecycle |
| Simple lag policy | Observe count/byte lag and terminate only the offending live subscription | Lag shedding |
| Optional production policy | Aggregate resources, pressure response, deferred admission, quotas or rates | Separately authorized extension |

Choose the cache's smallest owning abstraction near the canonical publication boundary during the first checkpoint.
It may be private to the sequencer's delivery implementation, but it must not become a second sequencer or durable storage layer.
Storage-backed history remains authoritative for recovery and catch-up.
Policy consumes neutral progress and termination capabilities rather than manipulating sequencer state.

The built-in server's document registry is the first factory composition point.
Interception occurs before `LocalSequencer::open_session`; wrapping an already-created session is insufficient for clean rejection.
The service factory creates document factories, which open and decorate sessions.
Initially these are pass-through operations with no counters or policy tasks.
Add aggregate reservations only in the optional production stage.
Every path advertised as managed must use the same interception boundary; unmanaged paths remain explicit.

## Core Contracts

Names below are provisional.
Resolve cache ownership in checkpoint 0 and factory shape in checkpoint 2, preserving these boundaries.

### Shared Live-Read Cache

Checkpoint 0 must choose how direct/unmanaged readers relate to the cache that checkpoint 4 will bound: every reader of that cache accepts eventual hard lag shedding, unmanaged reads remain storage-backed, or managed and unmanaged readers use separate cache owners.
Record which component owns each retention claim and can revoke it without reader polling; an outer decorator has no authority over readers that bypass it.
Checkpoint 1 implements that ownership boundary, but need not activate lag enforcement or add the later factory and policy machinery.
Under the shared-cache choice, direct readers must accept the neutral claim-revocation contract needed for later enforcement even though they bypass session decoration.
Checkpoint 4 adds policy and proves the bound using the chosen boundary; it is not the point at which unmanaged-reader ownership is first decided.

Retain one canonical published representation with shared payload ownership, not a per-reader payload queue.
Publish only after the selected backend's existing acknowledgment boundary, including its buffered or durable guarantees.
Cover application and ordered membership/control events consistently, including idle fast paths and cancellation-retained batches.
Accepted writes, publication, minimum-reference updates, and cleanup never wait for reader delivery.

Caught-up readers consume the cache without polling the archive for each new event.
Historical and finite reads remain supported, with an atomic or generation-checked handoff that cannot skip or duplicate events racing catch-up.
An old historical reader must not pin the archive's entire suffix in the live cache.
Define behavior when catch-up loses the retained handoff range; use explicit retry or termination semantics rather than silently dropping events.
Keep backend positions opaque; measure lag using event counts and retained bytes, not numeric position subtraction.

Use the slowest active live cursor to reclaim entries no live reader needs.
Dropping or terminating a reader removes its retention claim without requiring another poll.
With no readers, release settled cache payloads unless a separately documented bounded handoff allowance needs them.
Outstanding local or transport handles may still retain an allocation after its cache entry is reclaimed; account for that distinction when claiming bounds.
Backend invalidation must wake and terminate live observations without another submission or archive poll.
An actively polled read must still drive retained accepted work after submitter cancellation, without adding a task per document merely for fan-out.

Before lag shedding exists, a stalled reader can retain unbounded history.
Except for the authorized checkpoint-1a built-in server rollout, keep that experimental path opt-in under controlled workload, duration, and memory stop guards; do not describe it as production-safe.
The built-in server default accepts unbounded stalled-reader retention for controlled use, not a fixed RSS overhead or a production safety guarantee.
Generic storage hosts and direct Rust/WASM construction remain storage-backed by default.
Measure actual retained allocation capacity, including oversized backing slices, rather than assuming payload length equals retained memory.
Do not build the old multi-stage resource ledger just to run this experiment.

### Pass-Through Factory And Decoration

Inventory server, local, WebAssembly (WASM), TypeScript, benchmark, and test session-producing paths.
Use a compile-only native/WASM probe to resolve object safety, generic availability handles, and clone ownership before committing to a public factory shape.
The factory opens the underlying session and returns a decorator that forwards every session facet, including snapshot coordination, close, reads, and loads.
It must not erase handle capabilities or change cancellation, ambiguity, or error classification.

Pass-through creates no policy counters, background tasks, deadlines, output tracking, or admission queues.
It forwards any existing cache progress or delivery ownership unchanged.
Measure direct cached construction against cached pass-through construction, including steady-state delivery, open/close churn, and allocations.
If overhead is material, profile and optimize the boundary, then repeat the same comparison before deciding whether to proceed.
Do not hide wrapper overhead by comparing only against the slower uncached baseline.

### Rejection, Cancellation, And Early Closure

Start with deterministic test policies for immediate rejection, subscription termination, and whole-session closure, not aggregate quotas.
Reject before allocating a sequencer identity or membership record.
Define a cancellation boundary between a provisional open and a constructed session, including cancellation before the caller receives the result.
After construction, shared ownership must retain cleanup responsibility across clones and outstanding operations.
Dropping a wrapper is not proof that the underlying session has closed.

Close uses the existing idempotent ordered path: revoke authority, preserve the accepted prefix and ambiguous outcomes, and publish at most one required departure.
Specify who drives retained close work if the initiating future is abandoned.
Do not introduce an unbounded detached cleanup queue or release a future session-capacity reservation while membership or retained cleanup still consumes that capacity.
When reservations are later added, failure before construction returns provisional ownership exactly once; after construction it transfers to the shared lifecycle owner until cleanup completes.

Subscription termination is a separate action that preserves sibling reads, snapshot participation, and author authority.
It must interrupt a blocked transport send and release its cache claim even when the application stops polling.
Neither action may fabricate successful delivery, discard an accepted write, or duplicate departure.

### Output Ownership And Progress

Local delivery may credit progress when returning the item; this does not prove application consumption.
A transport must retain delivery ownership until the complete response is written or abandoned, not merely dequeued or serialized.
Completion advances progress; abandonment ends the affected subscription and releases ownership exactly once without pretending delivery succeeded.
Keep incomplete downstream items bounded, preferably one per subscription, without requiring a new aggregate accounting framework.

Preserve ownership across every event-producing path:

- `SeaArchive::read`;
- the live suffix returned by `SeaArchive::load`;
- any optimized or tracked read path used by a transport; and
- reconnection or snapshot-assisted catch-up paths.

Compression, encryption, and future payload decorators must preserve receipt ownership while transforming a payload.
Malformed transformation must abandon the receipt and release policy state.
No decorator may silently convert a managed read into an auto-completing read.

When introducing output resource limits, reserve before fetching, decoding, transforming, or serializing an item, not after its receipt is created.
Include maximum legal item size, backing allocation capacity, transformation overlap, serialization buffers, and retained in-flight handles in feasibility and peak calculations.
Distinguish cache lag from already-fetched output: one outstanding receipt does not measure all unread history.
Historical catch-up can have independent output limits without becoming a live-cache retention owner before handoff.

The `TrackedRead`, delivery-receipt, and independent termination work committed on `rust-service-live-event-buffer` at `44e24d3453c` is a candidate contract and test source.
Reuse only the smallest neutral ownership contract needed at each stage, not its fan-out debt machinery.

### Simple Lag Shedding

After cache, pass-through, and lifecycle stages are validated and committed, add fixed configurable event-count and byte-lag thresholds.
Define equality, maximum-item feasibility, and permitted publication-batch overshoot before implementation.
Reader cursors determine the reclaimable prefix; the threshold and actual removal of lagging claims establish the retention bound.
Do not claim that the slowest reader alone bounds memory.
Every retention-owning reader in a cache claimed to be bounded must participate in lag enforcement.
Unmanaged readers must either opt into that enforcement or use a separate cache or storage-backed path that cannot pin the bounded cache.
Use the composition boundary selected in checkpoint 0 and implemented in checkpoint 1; a managed session factory alone does not constrain readers opened through other paths.

Evaluate lag on publication/progress transitions through a cheap notification or bounded observation mechanism, not by polling storage.
Termination and reclamation must run without a reader poll, free delivery credit, or reader cooperation.
Policy runs outside cache and sequencing locks.
If evaluation is deferred, bound the extra retained publication prefix while it is pending; an unbounded notification backlog invalidates the cache-bound claim.
Reader completion, termination, and invalidation must remain runnable while writers are active.

The first policy terminates only the offending live subscription; it does not gate writers or close the entire session.
Cache publication and accepted-write completion never wait for that reader.
Keep the cache reclamation boundary independent of the durable writer-reference floor.
Document the cache-entry bound separately from the memory retained by downstream handles, concurrent catch-up, subscribers, and documents.
This stage is not a total-process memory bound or an aggregate service admission policy.

Lag shedding can disconnect a functioning reader delayed by shared congestion.
Diagnostics distinguish lag-limit termination, explicit subscription termination, factory rejection, transport failure, backend invalidation, and whole-session closure.
Add pressure and expiry classifications only when those optional policies exist.

## Sequencer Scope After Simplification

`sea-sequencer` continues to own:

- allocation of session identities;
- accepted submission prefixes and cancellation-retained persistence work;
- application and membership event ordering;
- reference validation and the durable minimum-reference floor;
- ambiguous-result reconciliation;
- snapshot publisher authority;
- ordered close and terminal departure; and
- backend invalidation effects required by those contracts.

The delivery implementation may additionally own the minimal cache and neutral reclamation cursors.
Do not port mechanisms whose only purpose is the previous coupled resource policy:

- host and document reader-resource counters;
- per-reader allocation models and deadline indexes;
- publication fan-out debt in writer admission;
- reader positions constraining the sequencer's write floor;
- transport scheduling and connection-buffer policy in sequencer modules; and
- lifecycle waits for reader delivery credit.

The sequencer may expose neutral progress or termination capabilities needed to wrap its streams, but it must not choose service admission, lag thresholds, expiry, quotas, or rates.

## Optional Production Resource Policy

This is a separately authorized extension, not a prerequisite for cache, wrapper, lifecycle, or simple lag-shedding completion.
Select only limits required by measured deployment needs, such as:

- fixed host and document session limits;
- fixed host and document live-subscription limits;
- bounded deferred opens, defaulting to immediate rejection;
- fixed per-subscription outstanding event and byte limits;
- fixed aggregate host and document outstanding output bytes;
- storage-pressure gating for new mutations;
- reader-output-pressure gating for new application mutations;
- a configurable no-progress deadline for outstanding output; and
- deterministic subscription termination when a hard output bound or deadline is reached.

Do not begin with occupancy percentiles, inferred reader health, adaptive hysteresis, or rate estimation.
Measure each policy against pass-through and simple lag shedding before accepting its overhead.
Future tenant quotas, priorities, rates, and billing must remain outside sequencer internals.

### Storage Pressure And Mutation Admission

Only at this stage add a cheap cloneable storage-pressure observation, separate from terminal opening invalidation.
Define level-triggered `Ready`, `Pressured`, and terminal/unavailable states with race-safe registration and recheck, and identify service versus document scope.
Memory storage may remain ready under its existing limits.
File storage should derive recommendations from its bounded worker and write-behind ownership, not a new queue.
Ordinary worker activity is not necessarily mutation pressure: reads and cleanup share backend resources.
Specify which saturation signal gates which mutation class, and preserve capacity for accepted operations and cleanup to finish.
The signal grants no mutation authority and does not promise that a later call completes immediately.

An outer decorator may gate submissions, blob/directory publication, and snapshot publication before entering the underlying session call.
Explicitly classify membership announcement and its control capacity.
Once that call starts, sequencer and storage contracts own ordering, cancellation, and settlement; a later pressure change cannot turn it into a definitive pre-admission rejection.
Reader pressure may pause new application admission but never accepted sequencing work, internal control publication, authority revocation, close, or cleanup.
No policy lock or synchronization permit needed for progress or cleanup may be held across backend I/O.
Owned session or in-flight resource reservations may survive I/O and cancellation until the corresponding work settles or ownership ends.

If output pressure gates new writes, define a finite default deadline or another explicit bounded route to termination or resumption.
Deadline and termination progress must be independent of a stalled stream's polling and must not be defeated by a shorter hidden transport timeout.
A blocked reader must not leave writers indefinitely paused under the default managed policy.
Bound waiting opens and mutations before retaining their requests or payloads; default open overload to immediate rejection until bounded deferral is separately proven.

## Useful Experimental Work

The unmerged `rust-service-live-event-buffer` branch is evidence, not an integration base.
Implementation starts from the `rust-service` branch and selectively ports reviewed pieces.
Do not merge the branch wholesale.

Candidates to retain or adapt:

- checkpoint-0 encoding and maximum-event measurements;
- the policy-interface tests from `b198547e3a0`, after moving decisions out of the sequencer;
- exact-once delivery receipts, independent subscription termination, decorator forwarding tests, and opening-failure observation from `44e24d3453c`;
- transport full-write versus abandonment tests from the uncommitted checkpoint-2d work;
- blocked-send isolation fixtures and storage-backend test matrices; and
- documentation of cancellation, lock ordering, and ambiguous settlement hazards.

Expected exclusions or replacements:

- the coupled published-event window, replaced only by the minimal cache whose benefit is measured;
- the sequencer publication ledger and fan-out reservations;
- `BroadcastHost` ownership inside sequencer recovery;
- policy deadline indexes and oversized accounting records, retaining only cache cursors needed for delivery;
- reader delivery credit in close/lifecycle dispatch; and
- the proposed coupling between the reader floor and writer admission.

Before porting any file, identify the contract this plan still needs and copy only the smallest implementation and regression evidence that provides it.
Record port, rewrite, or discard dispositions as work proceeds, not as a late cleanup phase.
Do not copy code into main merely to delete it in a subsequent checkpoint.

## Implementation Checkpoints

Checkpoints 0 and 1 are complete; decisions, evidence limitations, performance exceptions, validation, and review are recorded in the cumulative implementation report.
Checkpoints 2 through 5 remain not started.
Commit each coherent stage only after its exit checks, applicable canonical validation, and independent review pass; record authorization before making commits.
Keep incomplete paths opt-in except for the scoped checkpoint-1a rollout, and preserve an explicit storage-backed baseline path for comparison.
Do not add the next layer to rescue an unexplained regression in the current layer.

### 0. Freeze The Cache Experiment

- Record the approved starting revision, isolated implementation location, scope, and semantic decision.
- Resolve cache ownership, publication/handoff behavior, and the experimental unbounded-retention limitation.
- Select the shared-cache revocation contract, storage-backed unmanaged reads, or separate cache owners; identify the retention owner and revocation authority for every reader path before checkpoint 1 begins.
- Freeze workload, comparison revisions, numerical performance tolerances, and measurement stop conditions before running comparisons.
- Establish a repeatable baseline and identify the smallest correctness tests for the publication boundary.

Exit condition: the cache hypothesis, reader ownership and future revocation boundary, safety limits, comparison method, and proceed/optimize/stop criteria are explicit without requiring a policy factory first.

### 1. Implement And Measure The Minimal Cache

- Add shared canonical delivery, race-safe catch-up handoff, reclamation, reader-drop cleanup, and backend-invalidation wakeups.
- Preserve checkpoint 0's managed/unmanaged ownership boundary and test retention-claim removal or isolation without introducing lag thresholds yet.
- Preserve all existing acknowledgment, accepted-prefix, cancellation, reference-floor, and snapshot behavior.
- Prove that live delivery no longer polls the archive for each event using scoped instrumentation or a controlled backend fixture.
- Compare uncached and cached direct sessions before adding wrappers or resource policy.
- Profile and repair localized regressions, then repeat matched runs rather than assuming later policy work improves performance.

Exit condition: correctness gates pass and repeated measurements meet the frozen cache-benefit criteria with no unacceptable no-reader regression.
Commit the proven optimization as explicitly experimental if it still permits unbounded lag retention.
If the benefit is not demonstrated, record the result and revisit the cache design before checkpoint 2.

### 1a. Enable The Built-In Server Cache By Default

- Default the native server and `BuiltInSeaHost::new` to cached delivery for all built-in backends.
- Preserve strict `SEA_EXPERIMENTAL_LIVE_CACHE=false` and the explicit host-constructor override for rollback.
- Leave generic storage hosts and direct Rust/WASM construction unchanged.
- Record acceptance of unbounded stalled-reader retention separately from checkpoint 1's CPU/RSS tradeoff.
- Validate unset/on/off configuration, default-path browser/Fluid behavior, and rollback behavior; run applicable canonical gates and independent Standard review.
- Preserve explicit cache selection in comparisons; do not allow the changed default to select both benchmark sides implicitly.
- Keep checkpoints 2 through 4 unchanged, with checkpoint 4 still responsible for automatic per-cache lag enforcement.

Exit condition: default-on and explicit-off behavior are validated and reviewed, the accepted limitation and rollback are documented, and no new production resource guarantee is claimed.
No new performance acceptance campaign is required for this default-only change.

### 2. Implement And Measure Pass-Through Interception

- Inventory all session-producing paths and perform the native/WASM factory-shape probe without erasing availability handles.
- Add service/document open interception and complete session forwarding with no policy behavior.
- Integrate the native host and a local path for measurements; compile remaining adapters and explicitly mark any path not yet integrated.
- Compare cached direct sessions with cached pass-through sessions for open/close cost, steady-state delivery, and allocations.
- Optimize material overhead and rerun the same checks before accepting or rejecting the approach.

Exit condition: forwarding and cancellation behavior are equivalent, factory types work on native/WASM, and measured overhead fits the agreed tolerance.
Commit this boundary before adding rejection or shedding policy.

### 3. Prove Rejection And Lifecycle Controls

- Reject before sequencer allocation with deterministic policies, including concurrent and cancelled opens.
- Prove shared clone ownership and cleanup after cancellation before a constructed session is returned.
- Prove explicit early session closure, accepted-prefix settlement, ambiguity preservation, and at-most-once departure.
- Prove independent subscription termination, full-write versus abandonment ownership, and blocked-send interruption through real WebTransport and WebSocket listeners.
- Preserve ownership through compression, encryption, read/load, finite history, snapshot catch-up, and optimized transport paths.
- Complete advertised local/generated construction paths and verify Fluid replacement, pending-operation recovery, and continued editing without duplicate departure.
- Measure lifecycle and delivery-ownership overhead against the committed checkpoint-2 pass-through implementation, with rejection and termination policies inactive during steady-state comparisons.

Exit condition: rejection and both termination scopes work without policy bypass or unbounded abandoned cleanup, focused plus cross-stack gates pass, and lifecycle overhead fits the frozen tolerance.
Commit this functionality before implementing lag shedding; aggregate quotas and storage pressure remain out of scope.

### 4. Add Simple Lag Shedding And Bound The Cache

- Select and validate fixed count/byte thresholds and maximum-event/batch headroom from actual representations.
- Terminate exceptionally lagging live subscriptions through the proven termination capability: decorator termination for managed readers, or neutral claim revocation for direct shared-cache readers, including readers that never poll again.
- Reclaim cache entries after removing lagging claims while keeping writer-reference validation unchanged.
- Keep historical catch-up outside live retention until coherent handoff and bound downstream in-flight ownership separately.
- Prove that every retention-owning reader in the bounded cache is subject to lag enforcement, including direct/unmanaged construction or its isolation from that cache.
- Measure no-reader, healthy-reader, blocked-reader, variable-payload, and session-churn workloads with shedding enabled versus disabled on the same lifecycle-capable implementation; keep disabled runs under the experimental memory and duration guards.

Exit condition: the stated per-cache bound, including bounded detection/publication overshoot, holds under stopped readers; accepted work and unrelated readers/documents progress; reconnect remains correct; measured overhead is acceptable.
Commit and document this useful endpoint without claiming aggregate process or production resource bounds.

### 5. Optional Production Limits

- Obtain separate authorization and specify the deployment requirement and budget before adding each policy.
- Introduce storage-pressure observation only if needed, with race-safe registration and mutation-class semantics.
- Add selected aggregate limits, pre-fetch output reservations, bounded waiting, or finite admission-pressure response using the existing factories and decorators.
- Validate limits across transports, document counts, maximum events, transformations, and cancellation without coupling readers to accepted sequencing work.
- Measure each addition against simple lag shedding and pass-through, including pressure and churn scenarios.

Exit condition: only the selected production guarantees are claimed, with tested resource ownership, progress, and measured overhead.
This optional stage does not delay completion of checkpoints 0 through 4.

## Measurement And Validation Gates

Separate five comparisons: uncached versus cached direct sessions, cached direct versus pass-through, checkpoint-2 pass-through versus checkpoint-3 lifecycle and delivery ownership, shedding disabled versus enabled on the same lifecycle-capable implementation, and simple lag shedding versus optional production policies.
Keep lifecycle and delivery tracking active on both sides of the shedding comparison so their overhead is not attributed to lag policy.
The old live-buffer experiment is diagnostic evidence, not the acceptance baseline for wrapper overhead.
Keep server and generator binaries, source revisions including uncommitted changes, toolchains, storage modes, transport, affinity, payloads, fan-out, and durations attributable to every sample.
Use isolated Cargo target directories for different source snapshots and verify activation markers or equivalent evidence for the measured path.

Start with the 32-document writer/observer workload and small payloads that motivated live-read optimization, then cover no-reader and variable-payload cases.
Use repeated alternating baseline/candidate samples with aligned measurement windows, exact drain checks, and retained failed attempts.
Record delivered throughput, service CPU, latency, retained cache bytes/entries, allocation behavior, process resident memory, and open/close cost where relevant.
Do not silently change transport or reduce fan-out after an admission failure; record the limitation and treat a changed workload as a separate matched comparison.
Keep fixed-rate efficiency distinct from sustainable maximum throughput and from formal resource-bound evidence.
Freeze numerical acceptance tolerances before each comparison, not after observing its result.
If overhead fails a gate, profile and optimize the responsible layer before deciding to stop or revising scope with approval.

Run the narrowest executable regression immediately after each substantive code edit.
Before declaring an implementation checkpoint complete, run applicable native memory, buffered-file, durable-file, WASM, browser, and Fluid coverage, plus the canonical gates in [Development](DEVELOPMENT.md).
These include strict format/lint/docs/build checks, workspace tests, the documentation checker, repository policy check, required repository build, and the complete test suite.
Keep contract documentation and changesets with the checkpoint that changes behavior.
Use the [checkpoint review skill](../.github/skills/checkpoint-review/SKILL.md) before each authorized checkpoint commit.
Select its `standard` depth: one fresh read-only reviewer reads the complete fixed-base diff and relevant controlling code, without nested delegation or a repeated interactive mode prompt.
The coordinator and reviewer must load the shared review criteria referenced by that skill; a custom prompt alone is not a substitute.
Provide the fixed checkpoint base, complete changed scope including untracked files, a stable reviewed snapshot, and attributable validation evidence.
Focus adversarial checks on the stage's claims: publication/handoff and cache allocation ownership, pass-through capability and overhead, open cancellation and early closure, or lag-bound enforcement without reader polling.
Missing diff access or required coverage makes review incomplete, not successful final-source inspection.
Allow at most two repair-and-review cycles after the initial review, always against the full checkpoint change; unresolved blocking findings across any review area and missing required evidence block the checkpoint and require guidance.
Record results and commit identifiers cumulatively, without claiming that focused benchmark success establishes full correctness or production readiness.

## Required Regression Evidence

- Publication preserves backend guarantees and ordered event kinds without live archive polling.
- Catch-up handoff racing publication, reclamation, and membership changes has no gaps or duplicates.
- Reader drop, last-reader removal, cancellation-retained work, and backend invalidation release or retain exactly the required cache ownership.
- Pass-through preserves every session facet, handle capability, error, and cancellation boundary.
- Rejected opens allocate no sequencer membership; cancellation after construction retains cleanup responsibility until closure.
- Shared clones and abandoned close waiters cannot duplicate departure or release future capacity prematurely.
- A blocked live reader crosses the configured count or byte limit and is terminated without writer-delivery waits or sibling termination.
- Threshold equality, maximum events, batch overshoot, and oversized backing allocations obey the documented cache bound.
- A stopped reader opened through a direct/unmanaged path cannot pin a cache claimed to be bounded: it is either subject to lag enforcement or isolated from that cache's retention ownership.
- Eviction and cache reclamation do not depend on the offending reader polling.
- A blocked reader on one document does not stop accepted work on another document.
- Full transport write returns output credit; partial write, cancellation, and connection loss abandon it exactly once.
- Compression and encryption preserve completion and abandonment ownership.
- `read`, `load`, tracked transport reads, snapshot catch-up, and reconnect all use the managed path.
- Subscription shedding does not revoke author authority or publish a departure.
- Whole-session shedding publishes at most one ordered departure after the accepted prefix.
- Ambiguous storage outcomes remain ambiguous through the decorator.
- The pass-through policy preserves current session and stream behavior.
- Native and WASM implementations satisfy the same public contract within their ownership models.

For the optional production stage, additionally prove atomic host/document admission, bounded deferred requests, pre-fetch allocation reservations, and exact-once rollback.
Pressure transitions racing registration must not leave waiters asleep.
Storage or output pressure may temporarily pause new mutations, but not accepted work, controls, close, or cleanup.
The default managed gate must terminate or resume rather than stop writers indefinitely.

## Documentation And Compatibility

This design changes shared semantics and crate responsibilities, so implementation requires an accepted decision record.
Update the architecture guide, core session and storage contracts, affected crate guides, server configuration, generated bindings, and TypeScript APIs at the checkpoint that changes them.

Add changesets for customer-facing Rust or TypeScript API and behavior changes.
Regenerate API reports and bindings through their normal build tasks; never edit generated reports manually.
Document experimental cache retention separately from simple lag bounds and optional aggregate resource guarantees.
Document that lag shedding or later output expiry can disconnect a functioning client delayed by shared congestion.
Do not describe either as proof of client fault, and do not equate cache reclamation with writer-reference eligibility.

## Completion Criteria

The initial delivery, interception, and simple lag-protection work is complete when checkpoints 0 through 4 are validated, reviewed, and committed:

- the semantic decision is accepted and documented;
- cache-only measurements demonstrate the intended benefit;
- pass-through measurements establish acceptable overhead independently of that benefit;
- lifecycle and delivery-ownership overhead is acceptable independently of the incremental shedding cost;
- factory rejection precedes sequencer allocation and session/decorator ownership supports clean early closure;
- every advertised managed output path preserves completion and abandonment ownership;
- simple count/byte lag shedding bounds the stated live-cache retention without reader polling or accepted-write delivery waits;
- service policy and writer-reference eligibility remain separate from cache reclamation;
- close, recovery, snapshots, and accepted-prefix contracts remain intact;
- useful experimental work has explicit port, rewrite, or discard dispositions;
- all required focused, native, WASM, browser, Fluid, repository, and canonical checks pass; and
- measurements and documentation distinguish direct, pass-through, and simple lag-managed behavior and their remaining resource limitations.

Optional production limits have their own authorization, acceptance checks, and completion record.
Do not mark the useful initial work incomplete solely because quotas, storage-pressure gating, adaptive policies, or aggregate memory limits were not selected.
