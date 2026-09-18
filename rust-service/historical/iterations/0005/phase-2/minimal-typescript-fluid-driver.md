# Iteration 0005: minimal-typescript-fluid-driver Report

Status: complete
Branch: `rust-service-iteration-0005-minimal-typescript-fluid-driver`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0005-minimal-typescript-fluid-driver`
Base commit: `c9106df9d9b615859fc855b28859621ac02a433f` (iteration kickoff; parent/source `2de3d94f89ecff3e340eb1d580d628d5d951681b`)
Final commit: implementation `2206e347bbdaadc5e0cac9dbd102fcb58f0674ef`; this report commit follows it
Agent or owner: GitHub Copilot implementation agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/minimal-typescript-fluid-driver.md`](instructions/minimal-typescript-fluid-driver.md) at kickoff commit `c9106df9d9b615859fc855b28859621ac02a433f`
Session or transcript reference: none
Started and finished: started and finished 2026-09-12; exact elapsed time unknown

Prerequisite provenance: clean worktree at local starting tip `8e83fdf03a5799d76d8a10dd1f21ec9d87004be9`. The coordinator cherry-picked the accepted chain after kickoff, in order: projected reads/recovery `e0f7aa75d2f7429edb84bfc43f71ad865598a56e` and report `534ce15ecf6de1d037b8075e95458629ac2725c1`; content-addressed core `9d5772c6b0dcfd077c0a72c4090fb63c76c88b56`, Wave 1 report `a31a10c0e39d8d157df3372b8240c29661c69bf6`, service operations `939f975fcfd5a6a63d06fa735792bf54bd0e778c`, report `3077409601d6c44f3ac7e163a95fdf8d6b3deef1`, and native service registration `ed262d8e778838d1edf880f42bfcac2c8f647590`; injectable WASM core `ef5870f46060d2b3bdd53a5e4bff7eac1857420f`, Wave 1 report `cb5be0168aca7a5b434b363c054c264fd0c37513`, tooling record `3dfd60f277a550b1d4b5daede0d8057f2527dfb0`, projected recovery API `1ceb4980ce8404ac0937a1092adc23604fdcb2ba`, API report `43c54f74308882e4be87e05c0fed692b058a57b7`, content API `0270786dca67e6acf6b25c071ec8314f1a4ac245`, completed report `8ac7f6afd39017a3ff8cf57ea174825b0b6eaae5`, and decision-link correction `8e83fdf03a5799d76d8a10dd1f21ec9d87004be9`.

## Outcome

Implemented an isolated TypeScript package that structurally implements the actual `IDocumentServiceFactory`, `IDocumentService`, `IDocumentStorageService`, `IDocumentDeltaStorageService`, and `IDocumentDeltaConnection` contracts. It consumes generated WASM for projected reads, recovery, blobs, and summaries and sends only documented FSP4 create/open/submit/snapshot envelopes through the generated client's validated `request` method. It never reads FSQ2 or changes Rust semantics. Node contracts passed through actual generated WASM with distinct clients and deterministic pre-commit and post-commit ambiguity. A real Chromium 152 trace passed create/load, summary/blob reload, two logical clients, submissions, bounded history, disconnect/reconnect, explicit not-committed recovery, caller-driven resubmission, and no duplicate projected reads against the native service.

Confidence is high in the implemented adapter contract and Node evidence, and medium in browser integration. True simultaneous two-session Chromium evidence is blocked by the accepted native server's serial connection loop: `WebTransportServer::serve` awaits `serve_connection` before accepting another session. The passing browser trace therefore uses two logical Fluid delta clients over one generated `BrowserClient`, with explicit request serialization required by the WASM client's capacity-one queue. This limitation is reported rather than represented as Routerlicious, ODSP, or full multi-client completeness.

## Hypothesis Results

Partially supported. The isolated package adapted the generated WASM API without FSQ2 decoding, protocol changes, or hidden retry. Actual-WASM Node contracts proved create/load, full summary and blob reload, bounded projected reads, submissions from distinct logical clients, disconnect before commit with `notCommitted`, explicit caller resubmission, and disconnect after commit with `committed` and no duplicate. Chromium proved the same storage and explicit lifecycle path for two logical clients over one session. The strongest interpretation requiring two simultaneous browser transport sessions remains inconclusive because the native prerequisite serializes sessions; attempting client 2 while client 1 remained connected failed at `connecting-client-2` with `WebTransportError: Opening handshake failed.`

## Deliverables and Commits

- `2206e347bbdaadc5e0cac9dbd102fcb58f0674ef` (`feat(rust-service): add minimal TypeScript Fluid driver`): isolated package, Fluid interface adapters, FSP4 envelope helpers, actual-WASM Node contracts, browser application, Chromium runner, package tooling, and interface/validation documentation.
- Package: `rust-service/tests/minimal-fluid-driver/`.
- Fluid adapter: `src/fluidDriver.ts`; generated-WASM boundary: `src/wasmClient.ts`; documented FSP4 envelope adapter: `src/fsp4.ts` and `src/protocolClient.ts`.
- Node evidence: `src/protocolClient.test.ts` and `src/driverContract.test.ts`. Browser evidence: `index.html`, `browser/trace.mjs`, and `browser/run-headless.mjs`.
- Implemented interfaces: create/load service factory; storage versions/snapshot tree/blob/full-summary methods; bounded projected delta storage; delta submission plus explicit synchronization, disconnect/reconnect, pending resolution, and caller-driven resubmission.
- Explicitly unsupported: signals, nacks, presence, automatic live-tail polling, automatic reconnect, hidden retry, offline merge, incremental summary handles, attachments, loading groups, `getSnapshot`, auth, retention/GC guarantees, production certificates, Routerlicious, and ODSP completeness.

## Validation Evidence

- Identity before implementation: `/workspaces/FluidFramework-rust-service-iteration-0005-minimal-typescript-fluid-driver`, branch `rust-service-iteration-0005-minimal-typescript-fluid-driver`, kickoff `c9106df9d9b615859fc855b28859621ac02a433f`, prerequisite tip `8e83fdf03a5799d76d8a10dd1f21ec9d87004be9`.
- `pnpm install --frozen-lockfile` at repository root: passed in 43.7 seconds with no tracked manifest or lockfile change.
- `node node_modules/@fluidframework/build-tools/dist/fluidBuild/fluidBuild.js --root "$PWD" --vscode packages/common/driver-definitions`: passed, 26 tasks across `@fluidframework/core-interfaces` and `@fluidframework/driver-definitions`.
- `CARGO_TARGET_DIR=/tmp/fluid-minimal-driver-wasm-target RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo build --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown --release`: passed in 15.49 seconds.
- `wasm-bindgen ... --target nodejs --out-name fluid_webtransport_browser --out-dir tests/wasm-client/pkg`: passed with `wasm-bindgen 0.2.128`; the contract loaded that generated package, not a TypeScript protocol mock.
- Final package gate from `rust-service/tests/minimal-fluid-driver`: `pnpm run check:format && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`: passed. Biome formatted 11 files and linted 9 with no diagnostics; TypeScript 6.0.3 strict typecheck/build passed; Node 24.21.0 ran 3 tests, 3 passed, 0 failed in 82.884168 ms. Tests: `actual WASM package backs the minimal Fluid driver contract`, `create, open, submit, and latest snapshot use documented FSP4 envelopes`, and `frame parser rejects non-FSP4 data without interpreting canonical storage`.
- `wasm-bindgen ... --target web --out-name fluid_webtransport_browser --out-dir tests/minimal-fluid-driver/pkg`: passed from the same release WASM.
- `sh tests/webtransport-browser/generate-cert.sh tests/webtransport-browser/.certs`: passed; generated certificate/key remained ignored.
- `CARGO_TARGET_DIR=/tmp/fluid-minimal-driver-native-target cargo build --locked -p fluid-webtransport-native --bin fluid-webtransport-native`: passed.
- Fresh native service: `/tmp/fluid-minimal-driver-native-target/debug/fluid-webtransport-native 127.0.0.1:0 ... /tmp/fluid-minimal-driver-service-data-5`, URL `https://127.0.0.1:56046/fluid`, certificate SHA-256 `28b4d45437cd0d1cb3de5b93f3f944e92dc10ebfbef232489d8f5a070103e892`.
- `node tests/minimal-fluid-driver/browser/run-headless.mjs tests/minimal-fluid-driver https://127.0.0.1:56046/fluid 28b4...e892`: passed without insecure browser flags. Exact evidence: `{"status":"passed","browser":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36","startupMilliseconds":431.69999999925494,"logicalClientCount":2,"transportSessionCount":1,"wireBytes":"4438","peakResponseBytes":655,"firstPage":2,"secondPage":2,"afterReconnect":1,"historicalSequenceNumbers":[2,3]}`.
- Failed discriminating Chromium check: retaining client 1 while connecting client 2 returned `{"status":"failed","stage":"connecting-client-2","error":"WebTransportError: Opening handshake failed."}`. Direct inspection showed `WebTransportServer::serve` awaits `serve_connection` inside its accept loop, so no second session can be accepted concurrently.
- `git diff --check`: passed before implementation commit. Root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `rust-service/Cargo.toml`, and `rust-service/Cargo.lock` had no diff.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Tooling integration | The new package was intentionally outside pnpm workspace registration; frozen root install did not create local package links. | `pnpm install --lockfile=false --offline` reported up to date but local Fluid links remained missing. | Normal package export resolution initially failed. | Built the two existing Fluid type packages and mapped type-only imports to their generated declarations. Integration must own package registration and lockfile updates. | For isolated TypeScript workstreams, distinguish dependency installation from workspace package linking and record the exact integration action. |
| Hypothesis limitation | A second real `BrowserClient` could not connect while the first remained active. | Repeated fresh-service Chromium run failed at `connecting-client-2`; Rust `serve()` awaits each whole connection before returning to `accept()`. | Required true simultaneous two-session browser evidence is unavailable without an out-of-scope Rust edit. | Preserved the failure, used two logical Fluid clients over one generated browser session for remaining browser evidence, and retained distinct-client actual-WASM Node coverage. | Multi-client browser work must verify the native accept loop before consumer implementation begins. |
| Implementation defect | Explicitly recovering a pre-commit pending submission left the local promise chain rejected, so a later submission reused the earlier `client is disconnected` failure. | First actual-WASM contract run: 2 passed, 1 failed; expected post-commit response loss but received the stale disconnect error. | Post-recovery submissions could not progress. | Reset the local chain only after explicit recovery or resubmission clears all pending work; rerun passed 3/3. | Pending state and queue state are separate lifecycle concerns; explicit recovery must restore both without retrying work. |

## Contract and Integration Friction

The generated WASM package has typed methods for projected reads, resolution, blobs, and summaries, but not create, open session, submit, latest snapshot, or publish snapshot. The adapter therefore constructs only those documented public FSP4 envelopes and sends them through `request()`, which validates FSP4 framing and lifecycle. No FSQ2 bytes are observed or decoded.

Workspace registration is intentionally absent. Integration must add `rust-service/tests/minimal-fluid-driver` to the appropriate pnpm workspace/package graph and regenerate the shared lockfile if this package should participate in root commands. Until then, validation requires built declarations for `@fluidframework/core-interfaces` and `@fluidframework/driver-definitions`; the package's `tsconfig.json` maps those type-only dependencies directly.

The native server's serial connection accept loop prevents simultaneous WebTransport clients. True independent two-client Chromium validation requires the native service owner to spawn accepted connections concurrently while preserving service fencing and shutdown behavior. The TypeScript workstream did not modify Rust.

## Human Interventions

The coordinator supplied all accepted prerequisites through original integration tip `67ca09dcea4`, represented by the cherry-picked local chain ending at `8e83fdf03a5799d76d8a10dd1f21ec9d87004be9`. No semantic correction or additional human intervention occurred during implementation.

## Measurements

- Environment: Debian GNU/Linux 13; Node 24.21.0; pnpm 11.15.1; TypeScript 6.0.3; Biome 2.4.5; Chromium 152.0.7977.82; `wasm-bindgen 0.2.128`; Rust 1.98.1; Cargo 1.98.1.
- Tracked isolated package source/config size before report: 103,116 bytes; TypeScript/browser JavaScript source: 1,623 lines. Generated and build artifacts are excluded and ignored.
- Generated browser package: declaration 15,342 bytes, JavaScript 45,287 bytes, WASM 293,007 bytes, WASM declaration 6,125 bytes; total 359,761 bytes.
- Generated Node package: declaration 8,274 bytes, JavaScript 42,230 bytes, WASM 293,007 bytes, WASM declaration 6,125 bytes; total 349,636 bytes.
- Debug native binary: 79,723,272 bytes. Browser trace startup was 431.7 ms, FSP4 traffic 4,438 bytes, and peak complete response 655 bytes. Browser APIs do not expose QUIC/TLS wire totals, so `wireBytes` is not represented as total network traffic.
- Browser projected pages contained 2 operations for each logical client, 1 operation after explicit reconnect, then 0 duplicates; bounded historical range returned sequence numbers 2 and 3.

## Proposed Decisions

No shared semantic decision is proposed. Integration must decide whether to accept the package with single-session browser evidence or first schedule a native concurrent-accept workstream; that is an implementation prerequisite decision, not a TypeScript protocol change.

## Candidate Skills and Process Changes

Candidate prerequisite check: before dispatching a multi-client browser consumer, launch two certificate-pinned `BrowserClient` sessions concurrently against the exact native binary. If client 2 cannot handshake, inspect whether the accept loop awaits per-connection service and stop the consumer workstream before building around a shared transport.

Candidate isolated-package procedure: run frozen root install, build only required workspace dependency declarations, map type-only imports to generated declaration entrypoints, and verify central manifests/lockfiles remain unchanged. Registration remains an integration-owned follow-up.

## Remaining Work and Risks

- True two-session Chromium evidence is blocked by the native serial accept loop. The passing browser evidence covers two logical Fluid clients over one generated `BrowserClient`; it must not be cited as independent transport-session concurrency.
- The browser trace serializes logical submissions because the shared generated client intentionally permits one active request. Distinct generated `InjectedClient` instances cover concurrent logical submission in Node, not QUIC session concurrency.
- This is a minimum driver, not a complete Fluid service driver. Unsupported signals, automatic live updates, incremental summaries, attachments, loading groups, GC/retention, auth, and production service behavior remain explicit.
- `IDocumentDeltaConnection.submit` is necessarily void; failures remain observable through `waitForIdle()` and pending state. Callers must invoke `recoverPending()` and, only after `notCommitted`, explicitly invoke `resubmitPending()`. No retry is automatic.
- Generated `pkg/`, `lib/`, certificates, native data, and target directories remain ignored. Integration/package publication must regenerate them from the accepted Rust source.
- Root workspace registration and lockfile updates are intentionally absent and owned by integration.
- Recommended next instruction: make native connection acceptance concurrent under existing fencing semantics, then rerun this unchanged browser application with two distinct `BrowserClient` sessions and simultaneous submissions before claiming the full charter hypothesis.
