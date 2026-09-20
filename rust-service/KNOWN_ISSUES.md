# Known Issues

This file tracks current limitations of the experimental Sea implementation and its development tooling.
Historical architecture findings remain in `decisions/` and `iterations/`.

## Intermittent native connection timeout

- **Status:** Open; cause not established
- **Severity:** Medium
- **Area:** Native WebTransport connection setup and test reliability
- **Evidence:** `host::tests::native_client_round_trip_in_every_storage_mode` failed during initial `NativeSeaClient::connect` with `Transport(Timeout)` in workspace validation on 2026-09-20.
  The original merge-validation failure remains in `/tmp/sea-storage-merge-final-test.log` for this environment.
  Passing isolated and workspace retries do not resolve the failure.
- **Investigation:** Temporary diagnostics distinguished handshake, event-stream opening, and author-stream opening timeouts.
  The failure did not recur in 92 server-suite runs, six complete workspace runs, or 80 additional server-suite processes in ten waves of eight concurrent processes.
  No failed stage was captured, and scheduling pressure did not establish a cause.
  Temporary production logging was removed; the round-trip test now reports storage mode, elapsed connection time, and server measurements on failure.
  The workspace investigation separately reproduced `cancelled_batch_retains_opening_until_worker_settles` failing with `Busy`.
  That test incorrectly treated a zero `Arc` strong count as completed destruction and file-lock release.
  It now waits for successful reopening within the existing deadline, still verifies exclusion before releasing the blocked worker, and passed twelve file-suite repetitions and the six workspace runs above.
- **Impact:** Native test runs can fail without an established product or test-harness cause.
  The transport timeout must not be classified as harmless host variability or resolved by a passing retry.
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

- **Status:** Open; coordinator task-batched iteration verified; autonomous delegate scheduling/cancellation unavailable
- **Severity:** High
- **Area:** Agent execution and validation evidence
- **Evidence:** The [execution isolation investigation](historical/EXECUTION_ISOLATION_INVESTIGATION.md) inspected VS Code revision `7debcd0e2acdea1c52de81bf9ee1620444407dda` and tested extracted methods with mocked terminals.
  Subagents retain the parent chat's terminal cache key; foreground reuse has no exclusive execution ownership.
  Command startup can send Ctrl+C, preparation can remove an absolute `cd`, and overlapping completion listeners can accept another command's result.
  Original incident tool logs were unavailable, so this does not prove the cause of every historical failure.
  [Iteration 0017's skill review](historical/iterations/0017/skill-review.md#verification-matrix) records overlapping coordinator-run checks and accepted native/full integration validation across six reviewed boundaries and two test-only repairs.
  No interference, unexpected exit 130, or foreign checkout result was observed; a genuine recovery formatting failure was corrected and its rerun passed.
- **Impact:** Concurrent calls through the shared foreground terminal can interrupt validation or return results from the wrong worktree.
  Separate worktrees, execution-subagent IDs, and Cargo targets do not isolate terminal state or output.
  Independent process tasks provide a tested alternative for parallel command batches; whole-workstream serialization is not the default mitigation.
- **Workaround:** Follow [terminal coordination](../.github/skills/rust-service-coordination/SKILL.md#terminal-coordination) for lightweight work and iterations.
  Use distinct process tasks with explicit cwd/environment and dedicated task terminals; a compound task with parallel dependencies passed an overlapping-process probe with correctly attributed exit codes.
  Keep workstreams parallel and serialize only access to the shared foreground terminal across the parent chat and descendants.
  Separate `run_task` calls did not overlap in the probe, and completed `get_task_output` calls returned blank output; use compound launches and preserve fresh per-run evidence rather than relying on terminal history.
  Actual delegate discovery lacked `tool_search`; the coordinator used parallel file-edit batches followed immediately by task checks.
  Autonomous delegate scheduling was unavailable; no task cancellation tool existed, so cancellation was not tested.
  Full `run_task` output returned before its result existed; acceptance required the matching durable completion record and consumer outcomes.
  Reject contaminated results and follow [execution isolation recovery](../.github/skills/rust-service-coordination/SKILL.md#execution-isolation-recovery) before rerunning checks.
  Shared-terminal serialization is an instruction-level workaround, not an enforced tool lock.
- **Follow-up:** When delegate task discovery/invocation or safe cancellation becomes available, verify it with approved disposable owned tasks before claiming autonomy or cancellation isolation.
  Preserve attributable identities, output, and exits for each run; no throughput baseline or upstream fix was established by iteration 0017.
- **Trigger:** Revisit when those capabilities become available or attributable interference recurs; no new iteration is scheduled.
  Close the underlying issue only after the VS Code/Copilot terminal tools provide exclusive ownership and command-specific completion handling, validated with concurrent same-chat commands and cancellation isolation.
  A successful workaround run does not establish that the underlying tool defect is fixed.

## Admission cleanup callback lacks focused evidence

- **Status:** Resolved by focused regression evidence
- **Severity:** Medium
- **Area:** Server admission cleanup regression coverage
- **Evidence:** The [real-QUIC admission tests](crates/sea-webtransport-server/src/server.rs) now record actual `connection_closed` calls and assert `false` for timed-out, aborted, and rejected admissions, plus immediate and bounded-drain cancellation during admission.
  These assertions complement capacity/listener/counter checks and close [iteration 0017's evidence gap](historical/iterations/0017/phase-3-report.md#contract-and-test-quality).
- **Impact:** Missing callbacks or incorrect reconnect-grace arguments fail the owning server tests; no runtime change was required.
- **Trigger:** Preserve these direct callback assertions when admission or cleanup changes.

## Browser disconnect resource release lacks focused evidence

- **Status:** Resolved by real Chromium physical-release regressions
- **Severity:** Medium
- **Area:** Browser WebTransport lifecycle regression coverage
- **Evidence:** The [browser lifecycle fixture](tests/webtransport-browser/README.md#physical-connection-release) independently checks disconnect with the Rust owner retained and final-owner drop without disconnect.
  Each must release a one-slot server's capacity within three seconds, with native JavaScript objects retained and inactivity expiry set to 120 seconds.
  Removing either production close call independently failed its corresponding browser case; restoring it passed.
- **Impact:** Physical release no longer relies on logical reopen, garbage collection, or server shutdown as evidence; no runtime change was required.
- **Trigger:** Preserve both cases and their ownership controls when browser transport lifetime changes.

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
  See [setup and validation](tests/webtransport-browser/README.md#optional-websocketstream-validation).
