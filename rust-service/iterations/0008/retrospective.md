# Iteration 0008 Retrospective

## What We Expected

We expected one atomic workstream to replace live projected-read polling across protocol, service, native transport, browser WASM, and the Fluid driver. The design was expected to use opaque cursor authority, bounded backpressure, explicit cancellation, and iteration `0007` shutdown ownership, then rerun the same SharedTree comparison without requiring a predetermined speedup.

## What We Observed

FSP4 v2 streaming passed the atomic boundary, lag, duplicate, gap, resume, backpressure, cancellation, shutdown, generated-WASM, and Chromium checks. Median convergence improved from 58.1 ms to 28.8 ms and p95 from 113.9 ms to 29.7 ms, while Tinylicious remained substantially faster. The process-local wakeup design is sufficient for one service process but provides no replicated notification claim. Production membership and benchmark default-lifecycle equivalence remain unresolved.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Cancellable WASM initially used exclusive async borrowing, blocking `cancel()` while `next()` waited. The [workstream report](phase-2/live-projected-operation-streaming.md#notable-events) records the compiler evidence and interior-mutability correction.
- Browser queue metrics initially read 3 because the delivered frame was counted as pending. The same report records the ownership-boundary definition and passing depth-2 rerun.
- The first clean resume benchmark had no cursor to resume. Establishing an unmeasured cursor and requiring one post-resume push corrected the evidence rather than weakening the assertion.
- FSP4 v2 correctly broke hand-built v1 fixtures. Searching and updating cross-language fixtures was required before Node and Chromium evidence could pass.
- Integration setup initially linked only the minimal driver, then stopped on missing Fluid declarations. Package-scoped Node 22 installs and explicit builds for driver definitions, container loader, Fluid Static, Tree, and Tinylicious client produced the required ignored artifacts without lockfile changes. No source defect was involved.

## Agentic Development Findings

One workstream was the correct decomposition because framing, cursor semantics, cancellation, and benchmark behavior crossed every owned layer. The generated instruction supplied a strong discriminating race and explicit non-goals, enabling autonomous implementation and clean two-commit handoff. The agent retained complete benchmark evidence and a decision record. Integration remained conflict-free. The main coordination friction was environment reconstruction in a fresh worktree; nvm Node 22 and package-scoped dependency graphs avoided the broad Routerlicious install failure observed in iteration `0007`. No human intervention was required after the approved sequence and Node 22 guidance.

## Practices to Keep, Change, or Stop

- Keep: one atomic workstream for contracts that cross protocol, service, transport, WASM, and consumer ownership. Owner: coordinator.
- Keep: fail first with the boundary race and retain exact cursor/queue/shutdown evidence. Owner: implementation agent.
- Keep: generate Node and web bindings from one release WASM artifact and audit every hand-built frame after a protocol bump. Owner: implementation agent.
- Change: in fresh worktrees, select nvm Node 22 before dependency setup and install/build only the target package dependency closure. Owner: coordinator.
- Stop: treating notification delivery as the source of exact operation truth or counting an item currently delivered as queued backpressure. Owner: stream implementers.

## Durable Lessons

- Cursor-authoritative catch-up with bounded advisory wakeups generalizes to durable streams where notifications can coalesce or lag.
- Cancellable async WASM resources must avoid exclusive borrows across suspension; this generalizes to any exported `next()`/`cancel()` pair.
- Protocol version changes require cross-language fixture audits, not only encoder tests. This remains recorded in the workstream report but is not separately promoted because it is already standard compatibility practice.

## Open Questions

- Should the next iteration prioritize authoritative production membership and default-lifecycle benchmark equivalence, or offered-load CPU/memory/capacity evidence for the current single-process service?
- What durable or distributed notification primitive replaces process-local wakeups in a replicated service?
- How should packet-level QUIC/TLS bytes and browser-observed close disposition be measured portably?
- Does batching preserve cursor, cancellation, and ambiguity semantics while reducing the remaining Tinylicious latency gap?
