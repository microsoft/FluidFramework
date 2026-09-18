# Iteration 0005: browser-wasm-client-package Instructions

Derived from iteration: 0004
Status: planned
Owner: assigned iteration `0005` implementation agent

## Approved Scope

Implement [Decision 0008](../../../decisions/0008-portable-wasm-client-boundary.md): package an environment-neutral WASM client core with an injected asynchronous request transport and a browser WebTransport adapter. Node tests cover client/package behavior; Chromium remains authoritative for actual WebTransport.

## Prior Evidence

The iteration `0004` [WebTransport report](../phase-2/webtransport.md) proves shared FSP4 bytes and Chromium reconnect but the current `BrowserClient` directly owns `web_sys::WebTransport`. The [native lifecycle report](../phase-2/native-client-lifecycle.md) supplies transport-neutral policy. Projected reads/recovery and blob/summary operations are prerequisites for the final package API.

## Hypothesis and Discriminating Check

Hypothesis: the actual WASM package can expose one lifecycle/protocol API that passes deterministic Node tests through an injected transport and unchanged Chromium WebTransport tests without environment-specific protocol semantics. Disprove first by running the same malformed-frame, request-id, disconnect, and reconnect cases in Node and Chromium and finding divergent public outcomes.

## Ownership and Dependencies

Wave 1 owns browser-package restructuring, bindings, Node harness, and existing browser transport paths using current FSP4. Wave 2 consumes integrated projected-read/recovery and blob/summary protocol prerequisites before finalizing its public API. It must not own shared protocol semantics, require a Node WebTransport polyfill, add hidden reconnect/retry, or replace real-browser evidence with mocks. Coordinate generated package artifacts and root dependency changes with integration.

## Deliverables and Validation

Deliver documented TypeScript bindings, injectable transport contract, deterministic Node tests loading the built WASM, and browser adapter composition. Test malformed/oversized frames, mismatched request IDs, lifecycle transitions, projected resume, ambiguity resolution, blobs/summaries, cancellation, shutdown, and bounded queues. Run WASM format/Clippy/build, binding generation, package checks, Node tests, and a fresh hash-pinned Chromium trace against the native service. Stop if mocks bypass real framing, Node and browser need divergent semantics, or the public API embeds browser-only globals in its core.
