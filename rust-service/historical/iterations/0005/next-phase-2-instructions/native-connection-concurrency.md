# Iteration 0006: native-connection-concurrency Instructions

Derived from iteration: 0005
Status: planned
Owner: GitHub Copilot implementation agent

## Approved Scope

Implement concurrent native WebTransport connection acceptance without weakening accepted sequencing, fencing, shutdown, or per-session lifecycle semantics. The user approved this as iteration `0006` Wave 1 in the [iteration 0005 Phase 3 report](../phase-3-report.md#next-iteration-scope). Do not broaden the work into distributed fencing, multi-host deployment, transport fallback, or general performance optimization.

## Prior Evidence

The minimal driver workstream's true two-session Chromium check failed at the second handshake because `WebTransportServer::serve` awaits one complete connection before accepting another. See the [driver hypothesis result](../phase-2/minimal-typescript-fluid-driver.md#hypothesis-results) and [Phase 2 integration finding](../phase-2/integration.md#cross-workstream-findings). [Decision 0006](../../../decisions/0006-scoped-deployment-boundaries.md) limits deployment claims, while [Decision 0007](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md) requires authoritative recovery and no hidden retry.

## Hypothesis and Discriminating Check

Hypothesis: the native server can accept and serve two certificate-pinned WebTransport sessions concurrently while one fencing authority still serializes authoritative replay, validation, and append correctly. Disprove first with two `BrowserClient` sessions held open simultaneously; both must handshake and submit independently, observe each other's projected operations, reconnect explicitly, and resolve an injected post-commit ambiguity without duplication. A second-handshake failure, stale-fence acceptance, duplicate append, hidden retry, or shutdown leak falsifies the design.

## Ownership and Dependencies

Own `rust-service/crates/wrappers/webtransport-native/`, its focused browser/native harnesses under `rust-service/tests/webtransport-browser/`, and this workstream report. Narrow service assembly changes are allowed only when required to place a concurrency-safe ownership boundary around existing authoritative operations. Preserve FSP4 bytes and kernel traits. Do not make the non-`Send` fence guard `Send`, weaken lock scope, change WASM/driver APIs, edit shared lockfiles, or claim deployment beyond Decision 0006. Use checkout-specific Cargo targets.

This workstream is the accepted prerequisite for `direct-shared-tree-integration`. Publish a coherent handoff commit and exact two-session evidence before that workstream begins implementation.

## Deliverables and Validation

- Add deterministic native tests for simultaneous accepted sessions, independent lifecycle, orderly shutdown, and failure cleanup.
- Run shared format, strict Clippy, build, workspace/focused tests, and existing single-session native and Chromium traces.
- Generate fresh browser bindings from the exact tested checkout and run a two-session Chromium trace without insecure flags. Report session count, logical client count, bounded FSP4 bytes, reconnect behavior, projected sequence results, and ambiguity outcome.
- Record task ownership, cancellation/backpressure bounds, fence serialization, and process/resource cleanup. No unbounded detached task set is acceptable.
- Stop and escalate if concurrency requires weakening the fence held through validation and append, changing kernel semantics, adding hidden retry, or expanding deployment claims.
