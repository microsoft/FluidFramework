# Iteration 0005 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0005`
Iteration base commit: `c9106df9d9b615859fc855b28859621ac02a433f`
Integration commit: final Phase 2 record commit containing this file

## Accepted Work

Accepted in dependency order:

- Projected reads and ambiguity recovery: workstream commits became integration commits `3cb33b2364e..5ce2bb24dd2`.
- Content-addressed blobs and summaries: workstream commits became `e4c7fff911e..2567386f670`, followed by integration-owned workspace and lockfile registration `f54b57eec97`.
- Browser-WASM client package: workstream commits became `071e0be2e09..4410d16c83d` after both protocol prerequisites. Integration corrected iteration decision links in `67ca09dcea4`.
- Minimal TypeScript Fluid driver: workstream commits became `8dc757180b7..82b792a6605` after all three prerequisites, followed by integration-owned pnpm workspace and lockfile registration `41ab5ce38f0`.

All four planned workstreams are integrated.

## Rejected or Deferred Work

None rejected. Retention and garbage collection, direct SharedTree integration, service concurrency, browser storage, distributed fencing, hardware power-loss testing, cloud blob storage, authentication and authorization, a Node WebTransport adapter, and broad optimization remain deferred as declared in the manifest.

## Conflict Resolution and Adaptation

The workstreams integrated without source conflicts when applied in dependency waves. Integration registered `crates/content-addressed`, regenerated the shared Cargo lockfile, registered `rust-service/tests/minimal-fluid-driver` in the pnpm workspace, and regenerated the pnpm lockfile importer. The driver package required a forced build of `packages/common/driver-definitions` so existing Fluid dependency declarations were materialized before its registered-package typecheck.

The kickoff instruction links to Decisions 0007 and 0008 used the wrong relative depth; `67ca09dcea4` corrected those shared records. Generated Node and browser WASM bindings were regenerated from the final integrated release WASM before validation.

No service-concurrency change was made. The native WebTransport server still awaits each whole connection before accepting another, so the browser driver evidence uses two logical Fluid clients over one transport session. Independent simultaneous browser sessions remain inconclusive rather than being represented as passing.

## Validation Evidence

Final validation ran from `/workspaces/FluidFramework-rust-service-iteration-0005` at `41ab5ce38f0e549c213bf586358b0740c15837f0` with checkout-specific Cargo targets.

- `cargo fmt --all -- --check`, strict workspace Clippy with all targets and features, and `cargo build --workspace --all-targets` passed.
- `cargo test --workspace --all-targets --all-features` passed 146 top-level tests with zero failures and four intentional child/worker entrypoints ignored. Spawned process-worker checks also passed.
- `cargo run -p snapshotted-stream-counter` printed `recovered counter: 4`.
- Fresh release WASM generation with `wasm-bindgen 0.2.128` passed. The actual-WASM Node suite passed 12 tests with zero failures.
- The registered minimal driver passed Biome format and lint, TypeScript typecheck and build, and 3 actual-WASM Node tests with zero failures.
- Fresh Chromium 152 browser-WASM content validation passed without insecure flags: 2,129 FSP4 bytes, 552 content-operation bytes, 363-byte peak response, 4 ms reconnect, one resumed record, a 33-byte blob, and one summary entry.
- Fresh Chromium 152 minimal-driver validation passed without insecure flags: 433.6 ms startup, two logical clients, one transport session, 4,438 FSP4 bytes, 655-byte peak response, projected page counts 2 and 2, one operation after reconnect, and bounded history sequence numbers `[2, 3]`.
- Root `pnpm install --frozen-lockfile`, iteration start validation, and `git diff --check` passed. The Phase 2 artifact validator passed before this integration commit.

## Cross-Workstream Findings

- Sequencer-owned projected reads and explicit resolution composed with content operations without changing FSP4 version `1` or exposing FSQ2 to consumers.
- Node validates the portable WASM protocol and lifecycle core through injected transports; only Chromium validates browser WebTransport, certificate pinning, streams, and reconnect.
- The minimal driver preserves caller-owned ambiguity recovery: it resolves first and resubmits only after authoritative `NotCommitted`; no hidden retry was introduced.
- Content identities and summaries are durable and verified, but whole-object FSP4 transfer remains bounded to 512 KiB by default and retention or garbage collection is absent.
- True independent two-session browser evidence is blocked by the native server's serial accept loop. This is a shared implementation limitation for Phase 3, not a driver or protocol defect.
- Registered TypeScript consumers depend on generated declarations from existing Fluid packages; stale build metadata can require forcing those prerequisite builds.

## Artifact Check

All four active workstream reports are complete, and every accepted commit and integration-owned registration is accounted for above. Generated `lib/`, `pkg/`, certificates, browser profiles, native service data, Cargo targets, and TypeScript build metadata are ignored and uncommitted. No tracked source artifact remains intentionally uncommitted beyond this report, manifest update, and the registration correction in the driver README.
