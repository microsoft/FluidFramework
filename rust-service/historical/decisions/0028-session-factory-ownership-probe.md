# Decision 0028: Session Factory Ownership Probe

Status: not pursued; superseded proposal
Date: 2026-09-24
Iteration: sequential session-resource-policy checkpoint 2
Owners: user, coordinator
Supersedes: none
Superseded by: [Decision 0029](0029-document-soft-budget-policy.md)

This record preserves the 2026-09-24 proposal and its probe results, not current implementation requirements.
The supervisor and lifecycle-intent mechanisms below are historical proposals, not approved prerequisites.

## Context

The user authorized checkpoint 2 from `b89ec852722d3373bd38f9780f5676973a33c117`.
The [plan](../../SESSION_RESOURCE_POLICY_PLAN.md) requires a native/WebAssembly (WASM) factory probe and a future ownership design before accepting pass-through interception.
This record distinguishes the implementation under test from later, unauthorized lifecycle and lag-policy work.

## Decision Drivers

The user explicitly declined enforcement of policy-issued retention grants under the cache lock.
All threshold evaluation must remain outside cache and sequencer locks.
No threshold enforcement is added in checkpoint 2.

## Options and Evidence

### Factory Shape Under Test

`sea_core::factory::SessionFactory` opens one source-allocated membership and returns `OpenedSession<Session>`.
Its associated session type preserves the concrete error and availability-handle types.
It is object-safe when its associated types are specified; neither availability handle is converted into an identity-only value.
`ServiceSessionFactory<Source>` constructs document factories without opening a session.
The native document registry retains one document factory alongside the recovered sequencer.
It remains separate from network connection admission and incarnation binding.

`PassThroughService`, `PassThroughFactory`, and `PassThroughSession` add no policy.
The local source delegates allocation to `LocalSequencer::open_session`.
The decorator returns the original session futures and streams directly.
Its explicit, desugared `async_trait` signatures avoid another box, another poll boundary, and another cancellation boundary on steady-state operations.
Construction futures remain boxed and their cost must pass the separate churn measurement.
Factory and session clones clone their source, not a new membership.
No public inner-session accessor creates a bypass through this boundary.

Native factories satisfy `Send + Sync`; native operation futures are `Send`.
WASM factories and futures can retain `Rc` and local-only ownership.
The compile probe instantiates non-`Send` WASM source/session ownership, dynamic factories, dynamic session facets, and capability-bearing handles.
This is not an implementation of lifecycle cleanup.

### Ownership Design For Checkpoint 3a

The future lifecycle service owns a registry of constructed memberships.
There is at most one retained cleanup record per constructed membership, not a separately growing queue of abandoned operations.
The document factory shares that service owner and opens through the same source boundary used by pass-through.
Policy rejection occurs before calling the source.

The open future owns provisional state until source construction completes.
For the local source, membership insertion and the return of `LocalSession` have no intervening suspension.
After construction, the lifecycle factory must install the session in the shared owner before any suspension or caller-visible return.
A result-delivery guard requests closure if a constructed result is abandoned.
Clones and outstanding operations retain the same lifecycle record.
Their release is not evidence of successful closure.
There is no capacity reservation in checkpoints 2 or 3; optional reservations must later transfer with this same record.

A native service-owned supervisor polls requested close operations, even after all caller waiters are dropped.
It uses the existing sequencer close and reconciliation operation, not another persistence state machine.
Requests coalesce on the membership record; a notification does not enqueue another future.
Caller waiters observe the shared result but do not own its polling lifetime.
Registry synchronization must be released before polling any session operation.
The supervisor is joined by explicit service shutdown, not detached as fire-and-forget cleanup.
There is no task or channel on the ordinary request path.

On WASM, a service-owned local supervisor uses the same registration and coalescing contract with local futures.
Explicit disposal requests closure and awaits the drain while the executor remains active.
Abrupt runtime destruction cannot retain an in-memory owner or promise a final callback.
Memory-only documents disappear with their owner; remote sessions still use server-side connection-loss and recovery semantics.

| Outcome | Required ownership and observation |
| --- | --- |
| Successful close | Retire the record only after the underlying ordered close establishes settlement. |
| Backend invalidation | Preserve the underlying classified failure; retain the record until the existing recovery owner explicitly accepts unresolved durable responsibility. |
| Unresolved settlement | Keep an explicit recovery-required record and surface ambiguity to waiters and the service observer. Do not blindly retry mutations or treat a cached error as successful reconciliation. |
| Native orderly shutdown | Stop opens, request remaining closes, join the supervisor, and return any incomplete settlement. The registry continues to identify unresolved ownership. |
| Native executor destruction | No polling guarantee survives executor destruction. Record incomplete cleanup where observation remains possible; later exclusive document recovery handles persisted announcements and accepted work. |
| WASM explicit disposal | Drain local cleanup and return its actual result while the executor runs. |
| WASM abrupt teardown | No final departure or callback is promised; use storage recovery or remote reconnect as applicable. |

The server adapter alone owns opening tokens.
Cleanup captures the admitted dispatcher identity and removes a connection entry only if that dispatcher is still current, preserving [Decision 0026](0026-bind-stream-session-incarnations.md).
Rejected bindings do not enter cleanup.
Signal/publisher revocation and author reconnect grace remain distinct.
Subscription termination in checkpoint 3b removes only its claim and interrupts its send; it does not request whole-session closure.

### Outside-Lock Lag-Enforcement Investigation

The current publication path cannot establish a finite scheduling-based overshoot:

- `Runtime::apply` calls cache publication while holding the runtime mutex.
- The application pipeline can apply up to 256 entries after a backend batch completes.
- Membership settlement can apply multiple departures while retaining the runtime lock; its count is not bounded by the application batch limit.
- A coalesced notification bounds notification storage but does not bound publications before a policy task runs.
- Application admission charges at most 4 MiB per batch, but membership metadata bypasses that limit and the codec permits a `u32`-length field.

Therefore, moving threshold checks into a background task without changing publication is not a valid solution.
Treating the application batch limit as the bound for membership publication is also invalid.

#### Candidate Restructuring, Not Implemented Or Accepted

A possible neutral publication protocol retains at most one opening-local publication obligation at a time:

1. Under runtime/cache synchronization, apply and expose one settled event and record an immutable progress snapshot for that obligation.
2. Release all runtime, pipeline-gate, and cache locks before invoking the service's synchronous lag selector.
3. Apply the selector's identity-scoped revocations under the cache lock, with conditional cursor/version checks so progress cannot be mistaken for unchanged lag.
4. Clear the obligation only after reclamation completes.
5. Before any further publication, every publisher helps finish an existing obligation outside all locks. No task or suspended initiating caller has exclusive responsibility for finishing it.

While an obligation exists, historical handoff must not install a stale lagging claim after the selector's snapshot.
It can retry without acquiring a claim, using the existing explicit handoff-retry contract.
New claims at the current head have no lag.
Drop, progress, invalidation, and explicit termination remain independently runnable.
A selector must be synchronous, non-reentrant, and independent of reader cooperation or backend I/O.
Its decisions are idempotent; helper races cannot transfer a revocation to another subscription.
The obligation is not a queue, a durable ledger, or a writer-reference floor.

If every application, membership, idle, retained-batch, and recovery publication observes this protocol, the maximum outstanding publication prefix is one event, including concurrent publishers.
For thresholds `N` entries and `B` canonical payload bytes, strict-greater-than shedding would permit at most `N + 1` entries and `B + M` payload bytes before removal, where `M` is the maximum legal canonical event payload.
At completed maintenance boundaries the retained entries satisfy both thresholds.
The present generic membership contract makes `M` as large as `u32::MAX`, not 4 MiB.
This is a feasibility ceiling, not a useful selected production memory bound.
Checkpoint 4 must resolve maximum-item feasibility explicitly without silently rejecting accepted writes or excluding direct readers.

This argument depends on restructuring all publication paths and retaining cancellation-safe helping ownership.
The current code and the factory type probe do not prove those premises.
In particular, releasing the lifecycle gate during membership settlement requires a separate ordering/cancellation analysis.
Checkpoint 2 must not claim that outside-lock bounded enforcement has been established merely because this candidate protocol can be described.
Any preparatory implementation requires explicit scope, performance tolerances, validation, and independent review.

#### Authorized Preparatory Model

After the initial investigation, the user authorized the preparatory design and probe only.
Changing sequencing behavior still requires another explicit authorization.
The retired executable model used separate lifecycle, sequencing, and cache locks, a single immutable pending observation, and helpable completion.
It is an integration-test target, not part of the sequencer library.
Its ordinals are neutral model counters, not arithmetic on backend positions.

The model exposed an important byte-limit race: advancing a cursor does not necessarily bring a claim below its byte threshold.
Simply skipping a stale revocation and clearing maintenance would be wrong when a large unread event remains.
The probe instead refreshes the observation and re-evaluates outside locks before clearing the obligation.
At a fixed head, real cursor advances are finite; no-op progress must not create an endless retry source.
New historical attachment is excluded during maintenance, while attachment at the head cannot add debt.
Claim removal and helper generation checks prevent stale work from clearing a replacement obligation or targeting a replacement identity.

Focused scenarios cover equality, a single oversized-event allowance, abandonment and help, stale handoff, progress racing selection, replacement generations, a 1,024-event sequence including more controls than the application batch limit, and a native helper that progresses while another selector is suspended.
An independent review found that checking global mutex availability inside the helper incorrectly rejected legitimate contention by another thread.
The repaired probe checks guard release in isolation and separately verifies that policy selection can proceed while a different thread owns the cache guard.
The synchronous model compiles for WASM without a thread-capable executor.
Its native threaded scenario is excluded on WASM; cross-compilation is not a browser execution result.

## Consequences

The proposed real integration would have needed all of the following:

- Move policy calls out of both runtime and lifecycle-gate guards.
  Releasing only the runtime mutex is insufficient: `barrier()` retains the pipeline write gate while draining and settling.
- Split idle completion, application batch application, pending control settlement, failed-member cleanup, recovery departures, and shutdown departures at the same publication obligation boundary.
- Preserve a logical, cancellation-retained lifecycle intent while releasing synchronization guards.
  Otherwise opens or new submissions could enter between shutdown departures, or mutate before required failed-member reconciliation.
  This intent must drive the existing retained backend operation, not retry it or add a competing settlement owner.
- Keep a service-owned maintenance polling owner for an idle opening after cancellation, with at most one obligation per opening.
  Publisher helping establishes the overshoot bound under active writers; a bounded notification alone does not guarantee idle cleanup.
  No per-reader polling, per-document fan-out task, or unbounded detached cleanup queue is justified.
- Preserve receipt completion after metadata application and the selected backend acknowledgment boundary.
  A maintenance error must not be translated into a definitive rejection of an already accepted write.
- Apply the opening-level protocol to direct/unmanaged cache readers as well as factory-created sessions.
- Define the maximum legal control payload separately from the application admission budget.

These are a preparatory sequencing transformation, not a forwarding change.
The model demonstrates that the cache-side helping protocol is expressible without holding locks during policy selection.
It does not validate the real lifecycle-intent transformation, storage settlement, accepted-prefix ordering, invalidation, or transport delivery.
No such production behavior has changed.

## Decision

On 2026-09-26 the user selected an outgoing soft budget, removing the reason for strict publication-overshoot enforcement.
The executable publication model was retired from the active test suite; its complete draft is preserved in the transition backup identified in the cumulative report.
Factory code was salvaged separately, without the generic service-factory layer.
This proposal was not pursued and was superseded by [Decision 0029](0029-document-soft-budget-policy.md).

## Validation and Follow-Up

### Acceptance

At the time of the probe, acceptance required the checkpoint's ownership, feasibility, performance, validation, and independent-review gates to pass.
The factory shape can express the intended shared owner without changing its creation boundary, but it does not by itself establish that owner's progress.
No checkpoint-3 or checkpoint-4 behavior is authorized by this record.
