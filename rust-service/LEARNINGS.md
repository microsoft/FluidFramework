# Learning Index

This file is the curated index of durable lessons from the snapshotted append stream project. Detailed evidence remains in iteration reports, retrospectives, and decision records; add a short entry here only when a finding is useful beyond one workstream.

## How to Add an Entry

Each entry must link to its supporting artifact and state whether the lesson is confirmed, provisional, or superseded. Prefer observed findings over general advice.

```md
- **Confirmed:** Brief lesson. [Evidence](iterations/README.md)
```

## Architecture

- **Confirmed:** A storage receipt and an application-protocol acceptance are different contracts; validate and acknowledge Fluid operations in an authoritative adapter while keeping the kernel payload-agnostic. [Evidence](decisions/0004-authoritative-fluid-sequencer.md)
- **Confirmed:** Opaque positions can cross process boundaries through an implementation-owned codec without exposing ordering or arithmetic. [Evidence](decisions/0005-opaque-position-codec.md)
- **Provisional:** Keep duplicated framing and position mechanics while comparing buffered and durable implementations; factor only after equivalent guarantees reveal a stable common mechanism. [Evidence](iterations/0001/phase-2/integration.md#cross-workstream-findings)
- **Confirmed:** A fencing authority must hold exclusivity across replay and semantic validation through append; fencing only the write permits validation against stale state. [Evidence](iterations/0003/phase-2/deployment-fencing.md#notable-events)
- **Confirmed:** A process transport can preserve synchronous opaque-position codec laws with a client-verifiable, generation-scoped envelope while leaving retention validation to asynchronous backend operations. [Evidence](iterations/0003/phase-2/process-isolated-transport.md#contract-and-integration-friction)
- **Confirmed:** Public Fluid history should be projected by the sequencer that owns canonical record decoding; copying a private decoder into each client couples product APIs to storage framing. [Evidence](iterations/0004/phase-2/integration.md#cross-workstream-findings)
- **Confirmed:** A client must keep an unacknowledged submission ambiguous until an authoritative replay or resolution distinguishes committed from absent; transport loss is not permission for hidden retry. [Evidence](iterations/0004/phase-2/native-client-lifecycle.md#hypothesis-results)
- **Confirmed:** Projected pagination must advance its opaque cursor across bounded canonical spans even when every scanned record is filtered, or administrative-only spans can cause loops or skipped accepted operations. [Evidence](iterations/0005/phase-2/projected-reads-ambiguity-recovery.md#hypothesis-results)
- **Confirmed:** An immutable summary can be acknowledged safely only after every content-addressed reference is present and verified and the canonical manifest is durably published; retention is a separate policy. [Evidence](iterations/0005/phase-2/content-addressed-blobs-summaries.md#hypothesis-results)
- **Confirmed:** Opaque DDS payload transport still requires the adapter to preserve the host framework's summary, identity, membership, sequence, and batch-envelope semantics; byte delivery alone does not imply application convergence. [Evidence](iterations/0006/phase-2/direct-shared-tree-integration.md#notable-events)
- **Confirmed:** When multiple upstream writers are collapsed to one projected identity, every author-scoped monotonic field must be translated into one shared order; preserving writer-local sequence numbers creates replay corruption. [Evidence](iterations/0006/phase-2/direct-shared-tree-integration.md#notable-events)
- **Confirmed:** A replacement connection must share deterministic operation envelopes between history and live delivery, while each projected member retains a contiguous client-sequence domain; otherwise catch-up can reinterpret an already processed server sequence and close the client. [Evidence](iterations/0007/phase-2/fluid-read-reconnect-lifecycle.md#notable-events)
- **Confirmed:** An atomic catch-up-and-tail stream can use a bounded advisory wakeup when opaque cursor reads remain authoritative; coalesced or lagged notifications must trigger catch-up rather than carry exact delivery state. [Evidence](decisions/0009-projected-operation-subscription.md)

## Correctness and Testing

- **Confirmed:** One implementation-independent conformance function can validate direct and transparent-wrapper implementations without copied tests. [Evidence](iterations/0001/phase-2/compression.md#hypothesis-results)
- **Confirmed:** Specialized crash or transport suites do not replace shared semantic conformance; applying a concurrently expanded model directly to durable storage exposed an error-classification defect during integration. [Evidence](iterations/0002/phase-2/integration.md#conflict-resolution-and-adaptation)
- **Confirmed:** Durable acknowledgment must classify failures after write begins as ambiguous and return success only after the implementation's documented sync policy completes. [Evidence](iterations/0001/phase-2/durable-log.md#contract-and-integration-friction)
- **Confirmed:** Valid-only service sequencing does not require payload-aware conditional append when one fencing authority remains exclusive through append; cross-process enforcement is still required before this becomes a deployment claim. [Evidence](iterations/0002/phase-2/authoritative-sequencer.md#hypothesis-results)
- **Confirmed:** Portable WASM client logic can use injected transport tests in Node, but browser WebTransport, certificate pinning, streams, and reconnect still require authoritative real-browser integration evidence. [Evidence](iterations/0004/phase-2/webtransport.md#validation-evidence)
- **Confirmed:** A cancellable async WASM resource cannot hold an exclusive object borrow across its long-lived wait; `next()` and `cancel()` need independently accessible, narrowly borrowed state with no interior borrow crossing `await`. [Evidence](iterations/0008/phase-2/live-projected-operation-streaming.md#notable-events)

## Performance and Operations

- **Confirmed:** Compare storage results only with guarantee differences visible; the minimal and durable logs used equivalent record workloads but intentionally different acknowledgment semantics. [Evidence](iterations/0001/phase-3-report.md#comparative-results)
- **Confirmed:** Deterministic injected failures provide reproducible recovery evidence but must not be presented as process-termination or power-loss evidence. [Evidence](iterations/0002/phase-2/durable-snapshots.md#remaining-work-and-risks)
- **Confirmed:** Graceful server shutdown requires ownership and continued polling of every accepted connection future; a control acknowledgement produced inside the server future cannot complete while its caller awaits without polling that future. [Evidence](iterations/0007/phase-2/native-graceful-shutdown.md#notable-events)

## Agentic Development

- **Confirmed:** Test-only environment overrides must be command-scoped or visibly reported because persistent agent terminals can leak state into later validation. [Evidence](foundation-report.md#notable-events)
- **Confirmed:** A clean agent can begin Phase 1 from the plan, development policy, active report, and coordination skill without prior conversation context when repository instructions own the read order and completion gates. [Evidence](foundation-report.md#notable-events)
- **Confirmed:** Independent workstreams should run concurrently once dependencies are satisfied; isolated worktrees and strict writable paths yielded conflict-free integration. [Evidence](iterations/0001/retrospective.md#agentic-development-findings)
- **Confirmed:** Multi-worktree command evidence needs checkout identity and immediate shared-lockfile verification because delegated commands can report or modify the wrong checkout. [Evidence](iterations/0001/retrospective.md#costly-issues-and-dead-ends)
- **Confirmed:** Implementation work must use a write-capable agent; a read-only exploration agent can produce plausible code proposals while leaving every required artifact untouched. [Evidence](iterations/0003/retrospective.md#costly-issues-and-dead-ends)
- **Confirmed:** A set of parallel deliverables is not necessarily dependency-independent; instructions must distinguish concurrent groundwork from later integration and consumer waves. [Evidence](iterations/0004/phase-3-report.md#next-iteration-scope)
- **Confirmed:** Probe a runtime prerequisite such as independent transport-session concurrency before dispatching a consumer whose primary evidence requires it. [Evidence](iterations/0005/retrospective.md#costly-issues-and-dead-ends)
- **Confirmed:** Generated artifacts and cached build metadata are not evidence of readiness; execute or inspect the exact downstream artifact, using checkout-specific build targets in multi-worktree repositories. [Evidence](iterations/0005/retrospective.md#costly-issues-and-dead-ends)
- **Confirmed:** Recover an interrupted workstream from observed worktree identity, running processes, retained logs, dirty paths, and report markers before rerunning or editing; this preserves useful partial evidence without reconstructing unsupported state. [Evidence](iterations/0007/retrospective.md#costly-issues-and-dead-ends)
