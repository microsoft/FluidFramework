# Iteration 0005: browser-wasm-client-package Report

Status: in progress
Branch: `rust-service-iteration-0005-browser-wasm-client-package`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0005-browser-wasm-client-package`
Base commit: `c9106df9d9b615859fc855b28859621ac02a433f`
Final commit: Wave 1 implementation commit `e7a2121bd2b`; final workstream commit waits for Wave 2 prerequisites
Agent or owner: GitHub Copilot
Model and tool version: unknown
Instruction source: [browser-wasm-client-package instructions](./instructions/browser-wasm-client-package.md) at `c9106df9d9b615859fc855b28859621ac02a433f`
Session or transcript reference: none
Started and finished: started `2026-09-12T19:44:42+00:00`; Wave 1 checkpoint `2026-09-12T20:11:12+00:00`; final completion pending Wave 2

## Outcome

Wave 1 is complete with high confidence and the workstream is waiting for Wave 2. The existing WASM crate now exports an environment-neutral `InjectedClient` with a typed asynchronous request transport while `BrowserClient` retains certificate-pinned WebTransport behavior against FSP4. Actual generated WASM passed deterministic Node validation, and the same release WASM passed the existing native-service Chromium flow. Projected-read/recovery, blob/summary, and TypeScript Fluid driver APIs were not redefined or copied.

## Hypothesis Results

Supported for Wave 1: the existing `BrowserClient::request` FSP4 validation moved into an environment-neutral WASM core behind an injected Promise-returning request transport without changing public browser outcomes. Actual-WASM Node tests rejected malformed, oversized, and mismatched-request-id responses inside the WASM boundary; fresh Chromium then passed the unchanged create/open/submit/read/snapshot/disconnect/reconnect flow against the native service. The full charter hypothesis remains inconclusive until Wave 2 consumes projected-read/recovery and blob/summary handoffs and the TypeScript driver composes the package.

## Deliverables and Commits

- `e7a2121bd2b` (`feat(rust-service): add injectable WASM client core`): adds the shared bounded FSP4 core, public `AsyncRequestTransport` and `InjectedClient` bindings, browser adapter reuse, actual-WASM Node tests, and package-generation documentation.
- Public injection API: `new InjectedClient(transport, maxFrameBytes)`, `request(frame)`, `cancel()`, `disconnect()`, `reconnect(transport)`, `shutdown()`, and read-only `state`, `wireBytes`, and `peakResponseBytes`. `AsyncRequestTransport` requires `request(Uint8Array): Promise<Uint8Array>` and permits synchronous `cancel`, `disconnect`, and `shutdown` hooks.
- The request queue is bounded to one active operation. Transport rejection changes the client to `disconnected`; reconnect is caller-driven and requires a replacement transport; shutdown is terminal. No hidden retry is present.
- Browser `WebTransport`, certificate pinning, bidirectional stream behavior, and explicit reconnect remain in `BrowserClient`; both clients use the same FSP4 request/response validation core.

## Validation Evidence

- Checkout identity: `/workspaces/FluidFramework-rust-service-iteration-0005-browser-wasm-client-package`, branch `rust-service-iteration-0005-browser-wasm-client-package`, kickoff `c9106df9d9b615859fc855b28859621ac02a433f`.
- `cargo fmt --manifest-path rust-service/Cargo.toml --all -- --check`: passed.
- `CARGO_TARGET_DIR=/tmp/fluid-browser-wasm-wave1-host cargo clippy --locked --manifest-path rust-service/Cargo.toml -p fluid-webtransport-browser --all-targets -- -D warnings`: passed with no warnings.
- `CARGO_TARGET_DIR=/tmp/fluid-browser-wasm-wave1-clippy RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo clippy --locked --manifest-path rust-service/Cargo.toml -p fluid-webtransport-browser --target wasm32-unknown-unknown -- -D warnings`: passed with no warnings; final cached run completed in 0.21 seconds.
- `CARGO_TARGET_DIR=/tmp/fluid-browser-wasm-wave1-node-final RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo build --locked --manifest-path rust-service/Cargo.toml -p fluid-webtransport-browser --target wasm32-unknown-unknown --release`: passed in 9.03 seconds.
- `wasm-bindgen ... --target nodejs --out-name fluid_webtransport_browser --out-dir rust-service/tests/wasm-client/pkg` with `wasm-bindgen 0.2.128`: passed and emitted the documented `AsyncRequestTransport`, `InjectedClient`, and `BrowserClient` declarations.
- `node --check rust-service/tests/wasm-client/node-test.mjs`: passed.
- `node --test rust-service/tests/wasm-client/node-test.mjs`: 6 passed, 0 failed in 75.637098 ms. Covered actual-WASM valid request/response handling, malformed and oversized frames, mismatched request IDs, a one-request queue bound, cancellation, explicit disconnect/reconnect without retry, transport rejection, and terminal shutdown.
- `CARGO_TARGET_DIR=/tmp/fluid-browser-wasm-wave1-native cargo build --locked --manifest-path rust-service/Cargo.toml -p fluid-webtransport-native --bin fluid-webtransport-native`: passed in 11.00 seconds.
- Fresh browser bindings were generated from the same release WASM with `wasm-bindgen ... --target web`. `node tests/webtransport-browser/run-headless.mjs ... https://127.0.0.1:57412/fluid df189fa336857a868cae9f33b89e968650c63b10211010fd1fc24e01c6dcfa85` passed without insecure flags. Evidence: `{"status":"passed","browser":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36","wireBytes":"1577","peakResponseBytes":363,"reconnectMilliseconds":5,"resumedRecords":1}`.
- Root files remained unchanged: `Cargo.toml` SHA-256 `dd40850dc1d232e7555a64dc2bd9aaba0e7448d845f9ce0732845a5404c07a09`; `Cargo.lock` SHA-256 `fa09fb406da6522b12b07f489947b793bdd48d4128cd86c0a0a9b2df4d67a4ea` before and after validation.
- `pnpm exec biome check --write rust-service/tests/wasm-client/node-test.mjs` could not run because the repository Biome dependency is not installed in this worktree (`Command "biome" not found`). No install or lockfile modification was attempted; Node syntax and execution checks passed instead.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Tooling failure | Command helpers repeatedly surfaced output or summaries from the concurrent projected-reads worktree, including one false successful build summary and one accidental temporary branch. | Missing generated artifact disproved the false summary; Git-aware status showed the real edits; absolute manifest paths named the correct source crate in Cargo output. | Validation took repeated attempts and unqualified helper summaries were discarded. | Restored the requested branch, deleted the temporary branch, used absolute paths and isolated targets, and accepted evidence only when the output named this worktree or the resulting artifact was directly executed. | Multi-worktree command runners should bind cwd per invocation and validation reports should reject evidence that omits or contradicts checkout identity. |
| Missing local tool | Repository-standard Biome invocation failed because dependencies are absent in this worktree. | JavaScript formatting could not be certified by Biome without an unrelated install. | Retained existing repository JavaScript style and validated with `node --check` plus the actual Node test suite; recorded as an explicit limitation. | A workstream bootstrap check should distinguish required preinstalled tools from commands that would mutate shared package state. |

## Contract and Integration Friction

Wave 1 intentionally exposes only complete FSP4 frame execution and lifecycle controls. Projected read/resume and ambiguity recovery depend on the `projected-reads-ambiguity-recovery` handoff; blob and summary operations depend on `content-addressed-blobs-summaries`; final TypeScript consumption depends on `minimal-typescript-fluid-driver`. Those APIs must be consumed in Wave 2 without duplicating transport, retry, or protocol policy. The generated Node and browser loaders differ as required by `wasm-bindgen`, but their exported client operations and WASM core are the same.

## Human Interventions

None beyond the initial assignment and its explicit Wave 1 scope and lockfile constraints.

## Measurements

- Environment: Debian GNU/Linux 13, Rust/Cargo 1.98.1, `wasm-bindgen-cli 0.2.128`, Node 24.21.0, Chromium 152.0.7977.82.
- Final Node generated artifacts: declaration 3,003 bytes, JavaScript loader 24,864 bytes, WASM 147,646 bytes, WASM declaration 3,106 bytes; total 178,619 bytes.
- Final browser generated artifacts: declaration 7,052 bytes, JavaScript loader 28,147 bytes, WASM 147,646 bytes, WASM declaration 3,106 bytes; total 185,951 bytes.
- The injection path makes four explicit JS/WASM copies per successful request: incoming JS request to Rust `Vec`, Rust request to transport `Uint8Array`, transport response to Rust `Vec`, and Rust response to caller `Uint8Array`. Browser stream chunking may perform more than one incoming chunk copy. `wireBytes` measures FSP4 bytes, not QUIC/TLS overhead.
- Request concurrency is bounded to one active operation; no unbounded queue or retry buffer was introduced.

## Proposed Decisions

No new shared decision is proposed. Wave 1 implements [Decision 0008](../../../decisions/0008-portable-wasm-client-boundary.md).

## Candidate Skills and Process Changes

Candidate coordination hardening: require delegated command output to echo and verify absolute worktree, branch, and HEAD before accepting results, and reject summaries when generated artifacts or source paths disagree. This is especially important when several iteration worktrees execute concurrently through shared terminal infrastructure.

## Remaining Work and Risks

- Wait for the three named Wave 2 handoffs, then add their public operations to this client without redefining protocol models or copying retry/recovery policy.
- Run same-case Node and Chromium coverage for projected resume, ambiguity resolution, content-addressed blobs, and summaries after those APIs land; the current Chromium test covers existing FSP4 behavior only.
- Compose and validate the final TypeScript Fluid driver against the emitted declarations after its handoff is available.
- Generated `pkg/` directories, certificates, service data, and browser profiles remain ignored and uncommitted. Release packaging automation and publication metadata remain integration concerns; source-of-truth artifacts are Rust plus the committed generation instructions and tests.
- Biome formatting remains unverified until repository JavaScript dependencies are available. Rust format, strict Clippy, Node syntax/tests, package generation, and Chromium validation passed.
