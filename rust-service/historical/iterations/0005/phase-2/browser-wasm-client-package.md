# Iteration 0005: browser-wasm-client-package Report

Status: complete
Branch: `rust-service-iteration-0005-browser-wasm-client-package`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0005-browser-wasm-client-package`
Base commit: `c9106df9d9b615859fc855b28859621ac02a433f`
Final commit: content-operation implementation `1629b7420a3`; the report commit follows it
Agent or owner: GitHub Copilot
Model and tool version: unknown
Instruction source: [browser-wasm-client-package instructions](instructions/browser-wasm-client-package.md) at `c9106df9d9b615859fc855b28859621ac02a433f`
Session or transcript reference: none
Started and finished: started `2026-09-12T19:44:42+00:00`; Wave 1 checkpoint `2026-09-12T20:11:12+00:00`; projected-read/recovery checkpoint `2026-09-12T20:24:23+00:00`; completed `2026-09-12`

## Outcome

The workstream is complete with high confidence. After the accepted projected-read/recovery commits `1c6d8977f8a..8e9d36126db` and blob/summary prerequisite chain `808a2b9d4f5..a37daed484a`, the environment-neutral `InjectedClient` and certificate-pinned `BrowserClient` expose the same typed projected, recovery, blob, and summary operations through the shared bounded FSP4 core. Actual generated WASM passed deterministic Node validation of exact request/response kinds, digest validation, frame bounds, lifecycle transitions, and no hidden retry. The same final release WASM passed a fresh real Chromium flow against the native service with certificate pinning and no insecure browser flags.

## Hypothesis Results

Supported. Node and Chromium use one WASM protocol/lifecycle core and one public operation set. The package encodes accepted request kinds `8` through `13`, decodes response kinds `68` through `73`, preserves opaque positions and identities, and validates fetched blob and summary response digests before exposing content. Node rejected malformed, oversized, mismatched-request-id, and mismatched-content-digest responses while preserving a one-request queue and explicit reconnect. Chromium completed create/open/submit/read/snapshot, blob upload/fetch, summary publish/fetch, disconnect, explicit reconnect, and resume against the native service without divergent semantics.

## Deliverables and Commits

- `e7a2121bd2b` (`feat(rust-service): add injectable WASM client core`): adds the shared bounded FSP4 core, public `AsyncRequestTransport` and `InjectedClient` bindings, browser adapter reuse, actual-WASM Node tests, and package-generation documentation.
- Accepted prerequisite `1c6d8977f8a` (`feat(rust-service): add projected reads and recovery`) plus report commit `8e9d36126db` supplied the exact additive FSP4 contract consumed here.
- `80a3ad754983f9d09409273c680192e854b48a13` (`feat(rust-service): expose projected WASM recovery APIs`): adds typed `ProjectedOperation`, `ProjectedReadPage`, and `SubmissionResolution` bindings; `readProjected` and `resolveSubmission` on both clients; and actual-WASM Node coverage of exact requests, responses, opaque resume data, and no hidden retry.
- Accepted blob/summary prerequisites: `808a2b9d4f5` (`feat(rust-service): add content-addressed blob core`), `aa542c97cc6` (Wave 1 report), `0823c1c0e7e` (`feat(rust-service): add blob and summary service operations`), `8944f263490` (completed prerequisite report), and `a37daed484a` (workspace registration and lockfile).
- `1629b7420a3` (`feat(rust-service): expose WASM content operations`): adds typed blob/summary bindings to both clients, actual-WASM Node tests, real Chromium/native-service coverage, and package documentation.
- Public injection API: `new InjectedClient(transport, maxFrameBytes)`, `request(frame)`, `cancel()`, `disconnect()`, `reconnect(transport)`, `shutdown()`, and read-only `state`, `wireBytes`, and `peakResponseBytes`. `AsyncRequestTransport` requires `request(Uint8Array): Promise<Uint8Array>` and permits synchronous `cancel`, `disconnect`, and `shutdown` hooks.
- Projected API: `readProjected(document, after?)` returns accepted operations, an optional opaque cursor, and `hasMore`; `resolveSubmission(document, writer, session, submission)` returns `committed`, `notCommitted`, or `stillUncertain`. Committed results include position, sequence number, and minimum reference. Initial references are represented by absence; non-initial references remain opaque bytes.
- Content API: `uploadBlob(payload): Promise<BlobUpload>`, `fetchBlob(digest): Promise<Uint8Array>`, `publishSummary(entries: ReadonlyArray<SummaryEntry>): Promise<SummaryPublication>`, and `fetchSummary(digest): Promise<ReadonlyArray<SummaryEntry>>`. `BlobUpload` exposes `digest`, `sizeBytes`, and `deduplicated`; `SummaryPublication` exposes `digest`, `entryCount`, `persistedBytes`, and `deduplicated`; `SummaryEntry` exposes byte-array `path` and `blob` fields.
- Fetch operations require the response's exact 32-byte digest to match the requested digest. Blob bodies may be empty and all bodies, paths, entry counts, and complete frames retain accepted protocol bounds.
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
- Wave 2 `node --check rust-service/tests/wasm-client/node-test.mjs`: passed.
- Wave 2 release WASM build and Node `wasm-bindgen 0.2.128` generation with isolated target `/tmp/fluid-browser-wasm-wave2-node`: passed. Generated declarations expose `readProjected(document, after?)` and `resolveSubmission(document, writer, session, submission)` on both clients.
- Wave 2 `node --test rust-service/tests/wasm-client/node-test.mjs`: 9 passed, 0 failed in 79.364019 ms. The three additive tests were `projected reads use the accepted request and preserve opaque page metadata`, `submission resolution exposes every accepted outcome without submitting`, and `failed ambiguity resolution disconnects after one attempt with no hidden retry`; all six Wave 1 tests also passed.
- Final release WASM build used isolated target `/tmp/fluid-browser-wasm-wave3-node-final`; `wasm-bindgen 0.2.128 --target nodejs` passed. `node --check` passed and `node --test rust-service/tests/wasm-client/node-test.mjs` passed 12 tests, 0 failed in 85.867556 ms. The additive tests verify exact kinds `10` through `13` and `70` through `73`, typed receipts, empty blobs, summary entry round trips, configured frame rejection, and blob/summary digest mismatch rejection.
- `CARGO_TARGET_DIR=/tmp/fluid-browser-wasm-wave2-host-clippy cargo clippy --locked --manifest-path rust-service/Cargo.toml -p fluid-webtransport-browser --all-targets -- -D warnings`: passed.
- `CARGO_TARGET_DIR=/tmp/fluid-browser-wasm-wave2-wasm-clippy RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo clippy --locked --manifest-path rust-service/Cargo.toml -p fluid-webtransport-browser --target wasm32-unknown-unknown -- -D warnings`: passed.
- `cargo fmt --manifest-path rust-service/Cargo.toml --all -- --check`: passed after Wave 2.
- Final `cargo fmt --manifest-path rust-service/Cargo.toml --all -- --check`: passed.
- Final host strict Clippy with isolated target `/tmp/fluid-browser-wasm-wave3-host-final`: passed with `-D warnings`.
- Final `wasm32-unknown-unknown` strict Clippy with isolated target `/tmp/fluid-browser-wasm-wave3-wasm-final` and `RUSTFLAGS='--cfg=web_sys_unstable_apis'`: passed with `-D warnings`.
- Fresh Wave 2 browser and native builds used isolated targets `/tmp/fluid-browser-wasm-wave2-browser` and `/tmp/fluid-browser-wasm-wave2-native`. The unchanged Chromium harness passed without insecure flags against a never-used service data path: `{"status":"passed","browser":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36","wireBytes":"1577","peakResponseBytes":363,"reconnectMilliseconds":5,"resumedRecords":1}`.
- Final native build from this exact checkout passed in a never-used target `/tmp/fluid-browser-wasm-wave3-native-exact`. Fresh web bindings were generated from the final Node-tested release WASM. Chromium 152 passed against a fresh service root without insecure flags: `{"status":"passed","browser":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36","wireBytes":"2129","peakResponseBytes":363,"reconnectMilliseconds":5,"resumedRecords":1,"blobBytes":33,"summaryEntries":1,"contentWireBytes":"552"}`.
- `CARGO_TARGET_DIR=/tmp/fluid-browser-wasm-wave1-native cargo build --locked --manifest-path rust-service/Cargo.toml -p fluid-webtransport-native --bin fluid-webtransport-native`: passed in 11.00 seconds.
- Fresh browser bindings were generated from the same release WASM with `wasm-bindgen ... --target web`. `node tests/webtransport-browser/run-headless.mjs ... https://127.0.0.1:57412/fluid df189fa336857a868cae9f33b89e968650c63b10211010fd1fc24e01c6dcfa85` passed without insecure flags. Evidence: `{"status":"passed","browser":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36","wireBytes":"1577","peakResponseBytes":363,"reconnectMilliseconds":5,"resumedRecords":1}`.
- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0005 start`: blocked by pre-existing missing Decision 0007 and Decision 0008 links in the two generated instruction files; neither file is owned or changed by this workstream.
- Root files remained unchanged from the accepted registration prerequisite throughout final implementation and validation: `Cargo.toml` SHA-256 `887535d53314f687760999c55f4a3ddad572d18de3c81e8fe4438edf00840947`; `Cargo.lock` SHA-256 `66d8d42262ef8bcc269993f7a08709c0b85e185aa1a27376409dae49b9bb9015`.
- The JavaScript tooling gap was resolved without installation or lock churn by using the main checkout's already-installed repository binaries. Biome `2.4.5` formatted and then passed both changed harness files. TypeScript `6.0.3` strict `--noEmit` typechecked an external consumer of every new generated method and result type. ESLint remains inapplicable because no `eslint.config.*` governs these standalone Rust-service harness paths.
- `git diff --check`: passed.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Tooling failure | Command helpers repeatedly surfaced output or summaries from the concurrent projected-reads worktree, including one false successful build summary and one accidental temporary branch. | Missing generated artifact disproved the false summary; Git-aware status showed the real edits; absolute manifest paths named the correct source crate in Cargo output. | Validation took repeated attempts and unqualified helper summaries were discarded. | Restored the requested branch, deleted the temporary branch, used absolute paths and isolated targets, and accepted evidence only when the output named this worktree or the resulting artifact was directly executed. | Multi-worktree command runners should bind cwd per invocation and validation reports should reject evidence that omits or contradicts checkout identity. |
| Missing local tool | The initial repository-standard Biome invocation failed because dependencies are absent in this worktree. | The worktree-local command could not certify JavaScript formatting. | Later used the main checkout's verified Biome 2.4.5 binary without installing dependencies or changing lockfiles; both harnesses were formatted and passed. | A workstream bootstrap check should distinguish worktree-local dependencies from reusable lockfile-matched tools already installed in the canonical checkout. |
| Validation isolation | One direct Chromium invocation surfaced unrelated blob/summary validation output from a concurrent terminal, and the first visible browser run then found an already-created document. | The output named another worktree and the browser create assertion failed against reused state. | Both results were discarded. Rebuilt from this checkout, started the service with a never-used data path, and reran the unchanged harness to a passing `BROWSER_EVIDENCE` result. | Browser evidence needs unique service data in addition to exact source identity when concurrent validation may reach the same fixture. |
| Stale generated package | A Chromium run timed out before `window.__webtransportResult` because the browser `pkg/` directory still contained pre-content bindings despite a delegated summary claiming generation succeeded. | `SummaryEntry` was absent from the loaded module; direct regeneration exposed all four methods and the next run passed. | The failed run was discarded and web bindings were regenerated directly from the Node-tested release WASM. | Verify generated declarations or exported symbols before accepting package-generation evidence. |
| Cargo target collision | A direct native build reused a target first populated from the main checkout and mixed stale path-package fingerprints, producing impossible missing-variant errors. | Compiler paths named the correct service source but resolved stale protocol/sequencer artifacts from the reused target. | Rebuilt in never-used `/tmp/fluid-browser-wasm-wave3-native-exact`; the exact-checkout build passed in 11.17 seconds. | Never share `CARGO_TARGET_DIR` across sibling worktrees, even when package names and relative paths match. |
| Tooling resolution | The worktree has no `node_modules`, but the main checkout already contains the lockfile-matched Biome and TypeScript binaries. | Biome 2.4.5 and TypeScript 6.0.3 ran successfully against worktree files without installing packages or changing lockfiles. | Formatting/lint and declaration typechecking are complete; only ESLint is inapplicable due to no governing config. | Installed tools from the canonical checkout can validate sibling source paths when versions are verified and no resolution depends on worktree-local modules. |

## Contract and Integration Friction

Both prerequisite handoffs composed without changing FSP4 version `1`, duplicating wire models, or adding transport policy. Both adapters call the same shared request builders, response decoders, digest checks, and lifecycle path. The generated Node and browser loaders differ as required by `wasm-bindgen`, but their exported operation set and release WASM core are the same. No shared protocol, service, content-store, root manifest, or lockfile contract was edited by this implementation.

## Human Interventions

The coordinator supplied the accepted projected-read/recovery prerequisite by cherry-picking `1c6d8977f8a..8e9d36126db` after Wave 1, then supplied blob core, service operations, completed prerequisite reporting, and workspace registration through `a37daed484a`. No semantic intervention was required.

## Measurements

- Environment: Debian GNU/Linux 13, Rust/Cargo 1.98.1, `wasm-bindgen-cli 0.2.128`, Node 24.21.0, Chromium 152.0.7977.82.
- Wave 1 Node generated artifacts: declaration 3,003 bytes, JavaScript loader 24,864 bytes, WASM 147,646 bytes, WASM declaration 3,106 bytes; total 178,619 bytes.
- Wave 1 browser generated artifacts: declaration 7,052 bytes, JavaScript loader 28,147 bytes, WASM 147,646 bytes, WASM declaration 3,106 bytes; total 185,951 bytes.
- Wave 2 Node generated artifacts: declaration 5,006 bytes, JavaScript loader 33,356 bytes, WASM 217,092 bytes, WASM declaration 4,760 bytes; total 260,214 bytes.
- Wave 2 browser generated artifacts: declaration 10,709 bytes, JavaScript loader 36,511 bytes, WASM 217,092 bytes, WASM declaration 4,760 bytes; total 269,072 bytes.
- Final Node generated artifacts: declaration 8,274 bytes, JavaScript loader 42,230 bytes, WASM 293,007 bytes, WASM declaration 6,125 bytes; total 349,636 bytes.
- Final browser generated artifacts: declaration 15,342 bytes, JavaScript loader 45,287 bytes, WASM 293,007 bytes, WASM declaration 6,125 bytes; total 359,761 bytes.
- Final Chromium FSP4 traffic was 2,129 bytes total; the four blob/summary operations accounted for 552 bytes for a 33-byte blob and one summary entry. Peak complete response remained 363 bytes. Browser APIs do not expose QUIC/TLS overhead.
- The injection path makes four explicit JS/WASM copies per successful request: incoming JS request to Rust `Vec`, Rust request to transport `Uint8Array`, transport response to Rust `Vec`, and Rust response to caller `Uint8Array`. Browser stream chunking may perform more than one incoming chunk copy. `wireBytes` measures FSP4 bytes, not QUIC/TLS overhead.
- Request concurrency is bounded to one active operation; no unbounded queue or retry buffer was introduced.

## Proposed Decisions

No new shared decision is proposed. Wave 1 implements [Decision 0008](../../../decisions/0008-portable-wasm-client-boundary.md).

## Candidate Skills and Process Changes

Candidate coordination hardening: require delegated command output to echo and verify absolute worktree, branch, and HEAD before accepting results, and reject summaries when generated artifacts or source paths disagree. This is especially important when several iteration worktrees execute concurrently through shared terminal infrastructure.

## Remaining Work and Risks

- Generated `pkg/` directories, certificates, service data, and browser profiles remain ignored and uncommitted. Release packaging automation and publication metadata remain integration concerns; source-of-truth artifacts are Rust plus the committed generation instructions and tests.
- The FSP4 content API is bounded whole-object transfer with a default 512 KiB blob limit, not streaming. Larger objects require a future additive protocol rather than hidden chunking or relaxed frame bounds.
- Summary path canonicality and referenced-blob existence are enforced by the native service; the WASM boundary intentionally preserves typed bytes and accepted service semantics rather than duplicating that policy.
- The real browser trace covers one blob and one summary entry. Deterministic Node tests cover malformed frames, oversized frames, mismatched request IDs, both digest mismatch paths, empty blobs, queue bounds, cancellation, disconnect/reconnect, transport rejection, and shutdown; it does not emulate QUIC loss or browser process crashes.
- ESLint has no applicable configuration for these standalone harnesses. Biome formatting/lint and strict generated-declaration typechecking passed using already-installed repository tools, with no dependency installation or lockfile churn.
