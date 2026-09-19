# Iteration 0008 Phase 3 Report

Status: complete
Phase 2 integration commit: `e0ab9e62b2e97647e22dfb762b225d64042fb292`
Phase 3 commit: the commit containing this completed report; its self-referential hash is reported after creation

## Evidence Summary

The charter hypothesis is supported within the bounded single-host scope. FSP4 v2 subscriptions atomically catch up and tail from opaque cursors; the A/B/C boundary, lag, duplicate, gap, resume, slow-consumer, cancellation, and shutdown paths passed focused tests. Generated WASM exposed explicit `next()` and cancellation, the Fluid driver converged by pushed operations without live polling, and real Chromium passed default read-to-write replacement, ambiguity recovery, cold replay, queue-depth enforcement, and shutdown.

Clean ten-run evidence compares the committed polling baseline, post-stream subscription, and Tinylicious. Rust median convergence improved from 58.1 ms to 28.8 ms and median run p95 from 113.9 ms to 29.7 ms. Tinylicious remained lower at 4.7 ms median and 4.9 ms p95. The evidence is deterministic implementation evidence, not a production capacity comparison.

## Implementation Defects

- An async wasm-bindgen subscription using `&mut self` prevented concurrent cancellation while `next()` awaited input. Interior mutability and short borrow scopes corrected the ownership defect.
- Initial browser queue measurement counted the delivered frame and reported depth 3. Measuring retained pending frames at the ownership boundary and rejecting excess chunks established the intended bound of 2.
- The first resume benchmark attempted to resume newly loaded clients before any cursor existed. An unmeasured pushed edit now establishes both cursors, then a second pushed edit proves post-resume delivery.
- Hand-built Node and browser fixtures still encoded FSP4 v1 and were correctly rejected after the v2 bump. Updating all cross-language fixtures resolved the local compatibility failure.

## Shared Abstraction Findings

- Supported: a bounded process-local wakeup registered under the document lock can close the catch-up/tail race when opaque cursor reads, not notifications, remain authoritative for exact delivery.
- Supported: live subscription cancellation composes through browser WASM, WebTransport stream ownership, and native immediate/drain shutdown without detached tasks or unbounded channels.
- Supported: request/response history and push-driven live delivery can share deterministic projected envelopes while preserving explicit ambiguity recovery and opaque DDS payloads.
- Falsified: the notification queue itself must retain every operation. A one-slot advisory wakeup plus authoritative cursor catch-up recovers lag without carrying payloads.
- Inconclusive: replicated or multi-process notification. The accepted mechanism is process-local and reconstructs on document reopen.
- Inconclusive: production Fluid membership and Routerlicious/ODSP behavior. Synthetic membership and the benchmark force-write gate remain explicit limitations.

## Decisions

[Decision 0009: Projected operation subscription](../../decisions/0009-projected-operation-subscription.md) is accepted. It records FSP4 v2 kinds 14/74, cursor authority, bounded notification and browser buffering, explicit cancellation, and native ownership. No prior decision is superseded.

## Comparative Results

Correctness improved from repeated live projected reads to one explicit catch-up/tail subscription with resume and cancellation. Historical delta storage remains bounded request/response. The implementation adds protocol frames, one bounded per-document wakeup, owned native stream futures, and bounded browser frame buffering; no dependency or lockfile changed.

Under the same two-client sequential SharedTree workload, post-stream Rust median startup was 1,225.0 ms versus 1,271.1 ms before streaming; throughput was 39.98 versus 13.31 ops/s; median convergence was 28.8 versus 58.1 ms; median p95 was 29.7 versus 113.9 ms. Tinylicious measured 199.9 ms startup, 213.81 ops/s, 4.7 ms median, and 4.9 ms p95. Rust used 497,714 application-level FSP4 bytes per run, below the pre-stream range of 519,343 to 523,035 bytes. Tinylicious lacks equivalent wire/queue counters. Force-write, synthetic membership, durability, and transport accounting differences remain labeled, so no production speedup or equivalent-capacity claim is made.

## Learning and Process Findings

The [retrospective](retrospective.md) records WASM cancellation aliasing, queue measurement semantics, the missing resume point, protocol fixture migration, and integration dependency setup under Node 22. No human intervention changed implementation semantics. Cursor-authoritative wakeups and cancellable async WASM ownership are promoted to [LEARNINGS.md](../../../LEARNINGS.md).

## Skill Changes

The [skill review](skill-review.md) accepts no coordination skill change. Existing instructions already required a falsifying check, bounded ownership, exact checkout evidence, lockfile checks, retained failures, and layered browser validation. Node-version selection and protocol-fixture search remain instruction-level practices rather than new skills.

## Next Iteration Scope

Keep FSP4 v2 streaming, opaque cursor authority, deterministic history/live projection, explicit ambiguity recovery, bounded native ownership, and layered generated-WASM/native/Chromium evidence. The user-approved sequence to complete iteration `0007`, implement streaming afterward, and rerun the benchmark is complete.

No iteration `0009` workstream is preselected. Expansion is not automatic: production membership versus offered-load/capacity measurement is the next material prioritization choice and requires an explicit user decision. Continue deferring batching, retention/GC, browser/cloud storage, distributed fencing, power-loss qualification, authentication, Node/fallback transport, package publication, Routerlicious/ODSP compatibility, and broad optimization.

## Convergence Assessment

- Scoped streaming capabilities pass protocol, service, native, browser WASM, TypeScript, workspace, Chromium lifecycle, shutdown, and clean benchmark checks.
- The polling asymmetry that justified iteration `0008` is removed for live convergence; no polling fallback is presented as streaming.
- Accepted decision 0009 has implementation and cross-layer evidence with hard frame/queue bounds and explicit cancellation.
- Reports distinguish deterministic implementation latency from capacity and production deployment claims.
- Remaining gaps are explicit: production membership, replicated notification, offered-load throughput, CPU/memory, packet-level bytes, multi-node durability, Routerlicious/ODSP equivalence, and a benchmark using default rather than forced-write lifecycle.

Iteration `0008` is converged for its charter. The wider project is not declared complete because the remaining production and measurement questions require prioritization beyond the approved sequence.
