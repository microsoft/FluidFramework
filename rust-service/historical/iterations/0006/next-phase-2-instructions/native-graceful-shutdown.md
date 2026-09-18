# Iteration 0007: native-graceful-shutdown Instructions

Derived from iteration: 0006
Status: planned
Owner: GitHub Copilot implementation agent

## Approved Scope

Add an explicit bounded shutdown/drain contract to the native WebTransport server without weakening connection limits or the fenced mutation critical section. Scope is approved by the [iteration 0006 Phase 3 next-scope review](../phase-3-report.md#next-iteration-scope).

## Prior Evidence

Iteration `0006` accepted bounded concurrent connection ownership but retained process termination or dropping/aborting the `serve` future as the only shutdown mechanism. See the [native concurrency report](../phase-2/native-connection-concurrency.md#remaining-work-and-risks), [integration findings](../phase-2/integration.md#cross-workstream-findings), and [Decision 0006](../../../decisions/0006-scoped-deployment-boundaries.md).

## Hypothesis and Discriminating Check

Hypothesis: the server can stop accepting new sessions and either drain owned connection futures to a bounded deadline or cancel them explicitly, while preserving `max_connections`, propagating terminal errors, and never moving the non-`Send` fence guard across tasks.

Disprove first with a native test that holds two sessions active, requests shutdown, attempts a third connection, and observes bounded completion plus deterministic disposition of both owned sessions. Stop if the design requires detached tasks, leaking guards, changing kernel semantics, or claiming graceful QUIC close that the transport library cannot expose.

## Ownership and Dependencies

Writable: `rust-service/crates/wrappers/webtransport-native/**`, focused native/browser transport harness files needed for shutdown evidence, and the generated iteration `0007` workstream report. Read-only: kernel, sequencer, protocol, content store, browser WASM client, minimal Fluid driver, root workspace manifests/lockfiles, accepted decisions, and prior iteration records. This workstream depends only on iteration `0006` completion and is independent of `fluid-read-reconnect-lifecycle`.

## Deliverables and Validation

- A small public or internal shutdown control with documented immediate-cancel versus bounded-drain semantics and no detached connection futures.
- Native tests for stop-accepting, active-session disposition, timeout/cancellation, error propagation, and zero active connections at completion.
- A real Chromium check showing existing sessions and a post-shutdown connection attempt behave according to the declared policy without insecure flags.
- Checkout-specific strict Clippy, build, focused tests, fresh browser WASM generation where required, existing two-session regression, `git diff --check`, and immediate proof that shared lockfiles remain unchanged.
- Complete the generated report with timing, active/peak connection counts, and all transport limitations. Stop if the library cannot distinguish graceful drain from abrupt cancellation; report that limitation instead of relabeling it.
