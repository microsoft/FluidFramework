# Iteration 0006 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0006`
Iteration base commit: `a85dc67452af126c5cbc16c271a03f1f9c1bd33f`
Integration commit: the commit containing this completed report; its self-referential hash is reported after creation

## Accepted Work

1. Native connection concurrency: implementation `3f417c35639`, completed report `71094d64ea4`, and provenance correction `38a384fb377`, integrated first.
2. Direct SharedTree integration: implementation and completed report `39678b47391`, integrated after the concurrency prerequisite.
3. Integration-only adaptation: refreshed the focused package's root lockfile importer and esbuild graph, corrected its README from the superseded serial-server limitation, and documented the force-write browser boundary.

## Rejected or Deferred Work

No active workstream was rejected. Default read-to-write reconnect cursor/session transfer, production Fluid membership, signals, graceful native-server drain, retention, browser storage, distributed fencing, hardware power-loss qualification, cloud storage, auth, Node WebTransport, package publication, offline merge, fallback transports, and broad optimization remain deferred as chartered.

## Conflict Resolution and Adaptation

No cherry-pick conflict occurred. The minimal-driver package was already registered in `pnpm-workspace.yaml` by iteration `0005`; integration updated its existing `pnpm-lock.yaml` importer for the newly direct Fluid and esbuild dependencies. pnpm also generated esbuild `0.28.2` platform records and normalized affected peer snapshots.

The focused README still described the pre-Wave-1 serial server and one-session limitation. Integration updated it to the accepted bounded concurrent server, three independent SharedTree sessions, fresh browser commands, and the explicit force-write/default-reconnect boundary.

## Validation Evidence

- Focused Fluid dependency graph build passed for driver definitions, container loader, Fluid Static, and SharedTree.
- Fresh `wasm32-unknown-unknown` release build passed with `RUSTFLAGS='--cfg=web_sys_unstable_apis'`; `wasm-bindgen 0.2.128` generated Node and web bindings from the 783,809-byte Rust artifact. Generated browser WASM was 293,007 bytes.
- Minimal driver `npm test`: 3 passed, 0 failed against fresh generated Node WASM.
- Minimal driver format, lint, normal/shared-tree typechecks, normal build, and esbuild bundle all passed. esbuild reported only package-condition ordering warnings.
- Fresh Chromium 152 concurrent transport trace passed without insecure flags: two sessions, 2,665 FSP4 bytes, 488-byte peak response, 6 ms reconnect, two resumed records, committed ambiguity, 33 blob bytes, one summary entry, and 552 content FSP4 bytes.
- Fresh Chromium 152 SharedTree trace passed without insecure flags: three independent containers/sessions, final value `3`, authoritative `notCommitted`, one explicit resubmission, one summary publication, two summary fetches, 20 blob uploads, 40 blob fetches, ten projected reads, translated sequences `[3,4,5]` on both live clients, 39,349 FSP4 bytes, 4,030-byte peak response, and 1,735.4 ms fixture duration.
- With `CARGO_TARGET_DIR=/tmp/fluid-iteration-0006-integration-workspace-target`, `cargo fmt --all -- --check`, strict workspace/all-target/all-feature Clippy, workspace all-target build, workspace all-target/all-feature tests, and `cargo run --locked -p snapshotted-stream-counter` all passed.
- `git diff --check` passed before report completion. Generated WASM, bundles, certificates, service data, and Cargo targets are ignored and not included in integration.

## Cross-Workstream Findings

- The native connection scheduler can support real independent Fluid containers without weakening the non-`Send` fenced mutation critical section.
- SharedTree needs more than byte-transparent operation transport: valid summary shape, claims, quorum/audience semantics, translated sequence/MSN space, batching metadata, and author-scoped monotonic client sequences are all observable driver obligations.
- One generated WASM client must be serialized within a document service, but independent document services must retain independent clients/transports.
- The minimal adapter proves a scoped Fluid consumer, not a production driver. The browser proof deliberately forces write connections; default read-to-write resume semantics remain a separate design problem.
- Evidence remains layered: Chromium proves browser WebTransport and real SharedTree behavior; injected actual-WASM Node tests deterministically prove committed-after-response-loss handling.

## Artifact Check

Both active workstream reports are complete and their accepted commits are listed above. Root package/workspace declarations and Cargo manifests/lockfile did not change. The root pnpm lockfile and focused README are intentional integration-owned changes. No generated artifact or unexplained tracked change remains.
