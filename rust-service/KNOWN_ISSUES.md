# Known Issues

This file tracks current limitations of the experimental Sea implementation and its development tooling.
Historical findings and resolved investigations are retained in [Historical records](historical/README.md).

## Intermittent native connection timeout

- **Status:** Partially addressed; storage-induced initialization stalls reproduced and fixed, original intermittent failure not captured under tracing
- **Severity:** Medium
- **Area:** Native WebTransport connection setup and test reliability
- **Evidence:** `host::tests::native_client_round_trip_in_every_storage_mode` failed during initial `NativeSeaClient::connect` with `Transport(Timeout)` in workspace validation on 2026-09-20.
  The original log was machine-local; the test now reports storage mode, elapsed connection time, and server measurements for future failures.
  Passing isolated and workspace retries do not resolve the failure.
- **Investigation:** Temporary diagnostics distinguished handshake, event-stream opening, and author-stream opening timeouts.
  The failure did not recur in 92 server-suite runs, six complete workspace runs, or 80 additional server-suite processes in ten waves of eight concurrent processes.
  No failed stage was captured, and scheduling pressure did not establish a cause.
  Temporary production logging was removed; the round-trip test now reports storage mode, elapsed connection time, and server measurements on failure.
- **Impact:** Native test runs can fail without an established product or test-harness cause.
  The transport timeout must not be classified as harmless host variability or resolved by a passing retry.
- **Storage findings (2026-09-22):** A durable-file connection failed after 74.44 seconds despite a five-second client operation timeout.
  In a separate successful run, syscall tracing measured `fsync("/")` at 0.964 seconds while document-related synchronizations each took less than one millisecond.
  The namespace was on the separate `/tmp` ext4 mount, but initialization also synchronized the unrelated container overlay root on the runtime thread.
  A controlled seven-second `fsync` delay made the original round-trip test take 16.75 seconds without enforcing its operation deadline promptly.
  With initialization offloaded, the same delay injection produced the expected connection timeout at 5.01 seconds while the blocking worker finished independently.
  The original 74-second incident was not syscall-traced, so these results establish a causal stall mechanism, not attribution of every recorded timeout.
- **Repair and regression evidence:** Unix namespace synchronization stops at a different filesystem, preserving bottom-up synchronization and error propagation within the namespace filesystem.
  The built-in host offloads factory initialization, creation, and recovery while retaining cache ownership through caller cancellation.
  Deterministically blocked factory/create/recovery tests verify executor deadlines and cancellation ownership; file tests verify filesystem boundaries and synchronization error propagation.
- **Benchmark scope:** The durable startup failures in the [project overview](historical/PROJECT_OVERVIEW.md#storage-and-core-exploration) may share this mechanism.
  Steady-state durable throughput variance remains unisolated: namespace initialization is not performed for every append, and virtualized storage can make necessary journal synchronization variable.
  Blob and snapshot writes remain synchronous barriers; this repair does not claim general isolation of all storage operations or bounded filesystem latency.
- **Follow-up:** Capture the enhanced failure diagnostics and instrument the implicated connection stage to obtain a reproducible cause.
  Preserve the original failure when retrying; do not increase deadlines or suppress the test without causal evidence.
- **Trigger:** Close only after a causal fix and a regression check that exercises the failing condition.

## Rust CI support

- **Status:** Open
- **Severity:** High
- **Area:** Azure DevOps continuous integration (CI) and dependency restoration
- **Evidence:** [Build 424362, log 57](https://dev.azure.com/fluidframework/internal/_apis/build/builds/424362/logs/57) fails while building `@fluidframework/sea-typescript` on 2026-09-19.
  Rust 1.98.1 installs successfully, but Cargo cannot connect to `index.crates.io:443` to download the registry configuration and resolve `bytes`.
  This is consistent with CI network isolation; the Azure DevOps pipeline configures npm feeds but has no equivalent Cargo source replacement.
- **Impact:** The client build fails before completing the generated WebAssembly (WASM) artifacts.
- **Follow-up:** Add crates.io as an upstream to the existing Fluid Azure Artifacts feed used for npm, subject to the required approval.
  Configure CI-scoped Cargo source replacement and `CargoAuthenticate@0`, and verify that the build identity has permission to save packages from the upstream.
  Preserve existing dependency declarations and lockfiles, and keep public development independent of internal feed access.
  Provision the pinned Rust toolchain, `wasm32-unknown-unknown` target, and pinned `wasm-bindgen-cli` through approved paths; Cargo feeds do not provide rustup toolchain or target downloads.
  See [Azure Artifacts Cargo upstream guidance](https://learn.microsoft.com/en-us/azure/devops/artifacts/cargo/cargo-upstream-source?view=azure-devops).
- **Trigger:** Close after a fresh network-isolated CI build restores dependencies through the approved feed and completes the WASM and client builds without direct crates.io access.

## VS Code terminal tools can interfere across subagents

- **Status:** Open tooling limitation; not a Sea runtime defect.
- **Impact:** Concurrent shared-terminal calls can interrupt validation or return results from another worktree. Separate worktrees do not isolate terminal state.
- **Workaround:** Follow the current [terminal coordination procedure](../.github/skills/rust-service-coordination/SKILL.md#terminal-coordination), including actual delegate capability checks and attributable completion evidence.
- **Evidence:** The [execution isolation investigation](historical/EXECUTION_ISOLATION_INVESTIGATION.md) and [0017 retrospective](historical/iterations/0017/retrospective.md) describe tested workarounds and unverified scheduling and cancellation behavior.
- **Trigger:** Revalidate when tool capabilities change or interference recurs. A passing workaround does not establish an upstream fix.

## Generic client disconnect error state is not defined

- **Status:** Deferred; the former JavaScript injection API is removed
- **Severity:** Low
- **Area:** Generic Rust transport lifecycle contract
- **Evidence:** `Client::disconnect` marks client state disconnected and abandons authority/correlations even if `ClientTransport::disconnect` returns an error.
  The method does not specify this error-state policy, and the focused state test bypasses the outer client's fallible transport call.
  See the [historical deferral reconciliation](historical/DEFERRAL_RECONCILIATION.md#injected-disconnect-failure-state).
- **Impact:** A consumer of a fallible custom transport cannot rely on a defined recovery state after disconnect fails.
  Removal of the JavaScript injection surface does not settle the generic Rust contract.
- **Trigger:** When a fallible transport consumer requires recovery semantics, choose whether an error still abandons logical admission and pending requests.
  Document that choice and test error propagation, request admission, correlation cleanup, and explicit recovery through the outer `Client` API.

## RS-003: Durable storage has qualified guarantees

- **Status:** Open
- **Severity:** High
- **Area:** Durability
- **Evidence:** `sea-file-durable` appends checksummed frames and synchronizes each event batch before acknowledgment.
  Deterministic tests cover interrupted tails, grouped synchronization failures, lost acknowledgments, and stable sidecar locks across processes.
  The [power-loss model](crates/sea-file-durable/README.md#power-loss-model) requires truthful synchronization and preservation of the synchronized prefix during later appends or recovery truncation, including a shared tail block.
  Document creation also requires crash-atomic rename and durable namespace synchronization.
  Actual power-cut qualification on target filesystems and devices remains outstanding; media failure, external namespace modification, old writers, and remote storage are outside the model.
- **Impact:** `durable-file` must not be interpreted as a production durability claim.
- **Trigger:** Qualify the stated model with platform-specific power-cut testing before using the backend for production data.

## RS-015: Retention and garbage collection are not implemented

- **Status:** Deferred
- **Severity:** Medium
- **Area:** Content and history lifetime
- **Evidence:** All three `SeaStorage` backends retain every event, snapshot, blob, directory, and unattached upload.
  The composed view establishes dependencies before event and snapshot publication, and recovery checks dependency closure, but no root is later released.
- **Impact:** Storage grows monotonically and stale-position or unavailable-history behavior cannot yet be exercised.
- **Trigger:** Add leases, retention boundaries, and collection when a bounded deployment supplies concrete lifetime requirements.

## RS-018: Authentication and tenant policy are host work

- **Status:** Deferred
- **Severity:** High
- **Area:** Security
- **Evidence:** Sessions are archive-bound and do not expose archive-independent content fetches, but the built-in host accepts opaque archive, author, and session bytes without authenticating them.
- **Impact:** The executable is suitable only for controlled experimental environments.
- **Trigger:** Add a host authorization context and policy before exposing Sea across a trust boundary.

## RS-019: Server configuration is intentionally minimal

- **Status:** Deferred
- **Severity:** Low
- **Area:** Deployment
- **Evidence:** The server accepts bind, TLS, data-root, and optional shutdown-marker arguments; `SEA_STORAGE_MODE` selects one of three compiled-in backends.
  `SEA_MAX_CONNECTIONS` overrides the per-listener connection limit with a validated range of 1 through 4096; its default remains 16.
  Frame and stream limits still use library defaults, and backends cannot be omitted with Cargo features.
- **Impact:** Operators cannot tune frame or stream limits or reduce binary size without source changes.
- **Trigger:** Add validated CLI/environment precedence and backend features when a deployment or binary-size measurement requires them.

## RS-020: Transformation metadata remains visible

- **Status:** Deferred
- **Severity:** Medium
- **Area:** Confidentiality and transforms
- **Evidence:** Session decorators transform event payloads and blob leaves.
  Directory names, topology, event ordering metadata, and snapshot metadata remain visible so the server can validate references.
  No separate authenticated plaintext identity is exposed.
- **Impact:** Encryption does not hide archive shape or directory names.
- **Trigger:** Design encrypted directories or plaintext identity only for a concrete consumer requirement.

## RS-022: The Fluid adapter is not a production driver

- **Status:** Deferred
- **Severity:** High
- **Area:** Fluid integration
- **Evidence:** The adapter passes generated local-client and real Chromium SharedTree traces, recursive summary reconstruction, handle reuse, explicit reconnect, and caller-driven resubmission.
  The neutral-session path now projects ordered membership and passes the multi-driver lifecycle smoke; legacy injected benchmark clients retain synthetic membership.
  Authentication, automatic reconnect, offline merge, loading groups, and GC policy remain incomplete.
  Application signals now have a neutral reliable relay and opt-in best-effort datagrams; Fluid uses reliable delivery.
  The remote host permits one signal registration per physical connection lifetime and does not authenticate identities or enforce tenant quotas.
  Existing Fluid signal suites pass; a dedicated Presence convergence suite remains follow-up work.
- **Impact:** The adapter is integration evidence, not a Routerlicious or ODSP replacement.
- **Trigger:** Complete the opt-in integration inventory and connection-policy regressions before claiming production support.

## Codespaces forwarding requires the optional WebSocket transport

- **Status:** Open
- **Severity:** Medium
- **Area:** Browser development workflow
- **Evidence:** As checked on 2026-09-18, [GitHub documents Codespaces forwarding as TCP](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace), but the native SEA listener uses HTTP/3 over QUIC/UDP.
  Public visibility and HTTPS forwarding do not bridge those protocols.
  See the [investigation findings](historical/CODESPACES_WEBTRANSPORT_PLAN.md#initial-findings-2026-09-18) for implementation evidence, alternatives, and unverified routes.
- **Impact:** Making the default QUIC port public is still insufficient.
  The off-by-default `websocket-stream` adapter and separate TCP listener passed actual SEA collaboration through public forwarding in a Windows Chromium-based integrated browser.
  Native `WebSocketStream` preserves receive backpressure; explicit `WebSocket` and `PreferAvailable` modes also permit ordinary WebSocket for Node and browsers without the streaming API.
  Ordinary reception cannot apply backpressure: the adapter fails on queue overflow rather than silently dropping data, and its per-socket limits do not bound runtime or proxy memory.
  It requires explicit endpoint selection, trusted TLS termination, and a backend-visible Origin allowlist; it is not production authentication.
  Node's built-in WebSocket sends no Origin and requires the separate default-off, direct-loopback admission option; do not enable it on public/forwarded endpoints.
- **Trigger:** Integrate the opt-in adapter into an application-level development workflow with an explicit exposure/authentication policy.
  Preserve FIN/cancellation semantics and the strict modes' independent-stream backpressure; opt into ordinary WebSocket only when its weaker receive guarantees are acceptable.
  Local Chromium and Node flows passed; the user also reported a passing Windows Firefox 156 ordinary-WebSocket collaboration flow through public Codespaces forwarding.
  A logged-out browser run remains unverified.
  See [setup and validation](tests/webtransport-browser/README.md#websocketstream-validation).
