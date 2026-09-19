# Iteration 0006 Phase 3 Report

Status: complete
Phase 2 integration commit: `c696dff6209`
Phase 3 commit: the commit containing this completed report; its self-referential hash is reported after creation

## Evidence Summary

Both charter questions were answered positively within their declared single-host scope. The native server held multiple certificate-pinned WebTransport sessions concurrently under bounded ownership while preserving the fenced mutation critical section. The direct consumer then ran real SharedTree containers over three independent browser sessions, converged one edit from each live client, recovered one disconnected edit through authoritative `notCommitted` resolution and exactly one caller-owned resubmission, and replayed final value `3` into a third container.

Evidence remained layered as required. Chromium proved native browser WebTransport and real SharedTree behavior. Actual generated-WASM Node tests deterministically proved both disconnected-before-commit and committed-after-response-loss outcomes. No result was promoted to process-crash, power-loss, distributed fencing, retention, or production Fluid-driver evidence.

## Implementation Defects

- The native accept loop serialized whole connections. Moving owned connection futures into a bounded `FuturesUnordered` fixed the defect without moving the non-`Send` fence guard.
- The minimal driver initially had invalid summary shape/order, incomplete claims, missing membership, invalid sequence/MSN translation, transport races, incorrect read-mode remote details, silent disposal, and duplicate remote client sequence numbers. Each was a local adapter defect exposed by progressively narrower Fluid telemetry and browser checks.
- The Chromium runner occasionally raced profile deletion after process exit. Bounded cleanup retries fixed the harness defect.
- Integration validation initially lacked linked Fluid build outputs and ignored WASM/bundle artifacts. Fresh dependency builds and fresh Node/web generation corrected the environment; no cached artifact was accepted as evidence.

## Shared Abstraction Findings

- Supported: concurrent native sessions compose with the existing service mutex and authoritative fence; connection-level concurrency does not require weakening kernel or sequencer semantics.
- Supported: a low-level Fluid driver can carry opaque SharedTree payloads over FSP4 without decoding FSQ2 when it implements Fluid envelope, summary, identity, and sequence contracts.
- Supported: one generated WASM client can safely serve storage/history/delta calls when serialized per document service, while separate services retain independent sessions.
- Falsified: successful projected byte delivery alone implies DDS convergence. SharedTree depends on framework protocol invariants outside its opaque payload.
- Falsified: collapsing independent writers to one synthetic author is harmless if payloads remain unchanged. Author-scoped client sequence numbers must also be translated monotonically.
- Inconclusive: default read-to-write reconnect. The final proof uses Fluid's force-write host gate; shared cursor/checkpoint/session transfer and faithful membership remain unproven.
- Inconclusive: graceful native shutdown. Dropping or aborting the owning server future bounds cancellation, but no public drain policy exists.

## Decisions

No decision record changed. [Decision 0006](../../decisions/0006-scoped-deployment-boundaries.md), [Decision 0007](../../decisions/0007-projected-reads-and-ambiguity-recovery.md), and [Decision 0008](../../decisions/0008-portable-wasm-client-boundary.md) remain accepted. A production Fluid membership/reconnect decision is deferred until iteration `0007` produces evidence.

## Comparative Results

The new native implementation adds bounded scheduling complexity but preserves the same per-operation fenced service path. Its focused browser trace used two sessions, 2,665 FSP4 bytes, a 488-byte peak response, and 6 ms reconnect. These figures are lifecycle evidence, not a throughput comparison.

The SharedTree trace used three sessions, 39,349 FSP4 bytes, a 4,030-byte peak response, 20 blob uploads, 40 blob fetches, one summary publication, two summary fetches, ten projected reads, and about 1.74 seconds. There is no equivalent Routerlicious/ODSP or TypeScript transport workload, so no performance claim is made. The generated release WASM input was 783,809 bytes and the wasm-bindgen browser artifact was 293,007 bytes.

Dependency growth is confined to existing workspace Fluid packages plus direct esbuild `0.28.2`; root pnpm registration already existed. The adapter remains prototype-sized but gained substantial protocol normalization, demonstrating that production Fluid-driver complexity is not reducible to FSP4 framing alone.

## Learning and Process Findings

The [retrospective](retrospective.md) records the serial accept-loop prerequisite, the staged Fluid contract failures, delegated-command checkout/evidence failures, and generated-artifact prerequisite. Durable architecture and correctness findings were promoted to [LEARNINGS.md](../../../LEARNINGS.md). Human direction established the concurrency-first dependency and requested parallel execution; no mid-implementation semantic correction was required.

## Skill Changes

The [skill review](skill-review.md) accepts no skill-file change. The existing coordination skill already requires checkout identity, direct artifact execution, and notable-event capture; failures came from not enforcing those rules on delegated summaries. A domain-specific browser-driver diagnostic procedure is retained as a candidate and should be promoted only after reuse.

## Next Iteration Scope

Keep the bounded concurrent native scheduler, service-owned serialized WASM clients, opaque SharedTree payload boundary, explicit synchronization/recovery APIs, and layered Node/Chromium evidence.

Replace the force-write browser exception and synthetic reconnect behavior with a tested default read-to-write lifecycle. Expand the native wrapper with explicit graceful shutdown/drain evidence. These two iteration `0007` workstreams are dependency-independent and may run concurrently:

- [fluid-read-reconnect-lifecycle](next-phase-2-instructions/fluid-read-reconnect-lifecycle.md)
- [native-graceful-shutdown](next-phase-2-instructions/native-graceful-shutdown.md)

Do not expand into retention, browser storage, distributed fencing, power-loss claims, cloud storage, authentication, Node WebTransport, publication, offline merge, fallback transports, production Routerlicious/ODSP compatibility, or comparative optimization yet.

## Convergence Assessment

- Scoped promised capabilities pass their conformance and integration checks.
- Current implementation differences are documented, but default read/reconnect still depends on an explicit force-write exception in the browser proof.
- No unresolved proposal changes the kernel, sequencer, or crate boundary.
- Documentation and reports now describe observed behavior and evidence boundaries.
- Correctness, browser/native artifact size, FSP4 bytes, recovery, and bounded concurrency are measured for this workload. Equivalent production TypeScript, persisted-storage, and crash-safe comparisons remain unavailable.
- Iteration records pass Phase 2 validation; complete validation is required after these Phase 3 artifacts.

The project has not reached final convergence. Iteration `0007` is justified by the read/reconnect exception and missing graceful shutdown contract; broader performance comparison remains premature.
