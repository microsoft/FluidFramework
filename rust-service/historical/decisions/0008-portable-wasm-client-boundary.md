# Decision 0008: Portable WASM Client Boundary

Status: accepted
Date: 2026-09-12
Iteration: 0004
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

The iteration `0004` browser crate directly owns `web_sys::WebTransport`. That proves Chromium interoperability but prevents the package's protocol and lifecycle behavior from running in Node.js, where WebTransport is not built in. A third-party Node QUIC implementation would introduce another transport stack and still would not prove browser behavior.

## Decision Drivers

Package tests need a fast deterministic Node environment, while certificate pinning, browser streams, HTTP/3, and reconnect require real-browser evidence. The TypeScript Fluid driver also needs one consumable API independent of whether requests use a mock or browser transport. Transport injection must not create divergent FSP4 or retry semantics.

## Options and Evidence

Browser-only tests passed in Chromium but make most package behavior expensive to exercise. Requiring a Node WebTransport polyfill conflates a separate implementation with browser compatibility. The existing transport-neutral native lifecycle and shared FSP4 bytes show that request execution can be separated from protocol policy.

## Decision

Split the browser-WASM package into an environment-neutral client core and a browser WebTransport adapter. The core owns FSP4 framing, lifecycle, projected reads, ambiguity recovery, and blob/summary operations through an injected asynchronous request transport. Node tests load the actual WASM package and use a deterministic injected transport. Chromium remains authoritative for browser `WebTransport`, certificate hashes, bidirectional streams, disconnect, and reconnect against the native service.

A Node WebTransport implementation is optional future scope, not a required dependency or substitute for Chromium validation.

## Consequences

The package gains a testable boundary and can support the TypeScript driver without making Node emulate browser networking. Tests must prevent mocks from bypassing frame validation or lifecycle transitions. Some browser-only metrics remain unavailable by API design, and Chromium remains part of the integration gate.

## Validation and Follow-Up

Iteration `0005` must run Node package/API tests with malformed, oversized, mismatched-request, disconnect, projection, recovery, and blob cases, plus a real Chromium end-to-end trace against the native server. The same public client operations and FSP4 frames must be observed in both environments. Reconsider if injection requires environment-specific protocol semantics or if the package cannot expose a stable TypeScript surface without copying lifecycle policy.