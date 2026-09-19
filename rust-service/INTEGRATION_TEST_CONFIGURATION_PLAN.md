# SEA Opt-In Integration-Test Configuration Plan

Status: Opt-in configuration and ordered-membership fix committed; completed ServiceClient work integrated and validated before further failure fixes.
Created: 2026-09-18.
Updated: 2026-09-19.

This is an independently assignable follow-up to the [SEA WASM and ServiceClient integration plan](SERVICE_CLIENT_PLAN.md).
Its first deliverable is an explicitly runnable SEA configuration in the repository's existing multi-service/driver integration tests, with observed failures preserved.
On 2026-09-19 the user extended this assignment to commit the validated configuration, then fix and commit failures iteratively until the current-version SEA integration suite passes, with an explicit inventory of justified exclusions.
Keep the configuration out of default test runs and continuous integration (CI).

## Dependencies and Ownership

The committed foundation now includes [sea-typescript](packages/sea-typescript/README.md), the [sea-driver adapter](packages/sea-driver/README.md), and the optional Node.js WebSocket transport from the completed [Codespaces investigation](historical/CODESPACES_WEBTRANSPORT_PLAN.md).
The existing test harness consumes `ITestDriver` and `IDocumentServiceFactory`, not the higher-level `ServiceClient` API.
This work can therefore proceed alongside ServiceClient implementation using `SeaDriver`, `SeaSessionDriverClient`, and the neutral `openRemote` factory.
The capability-specific socket entrypoint does not depend on the combined/split loader presets.
Use the committed package APIs; coordinate any required API change with the main integration owner.

Do not add a competing bindings implementation or import generated crate output paths as a shortcut.
Preserve the main plan's layering: general SEA access belongs in `sea-typescript`, Fluid adaptation belongs above it, and `sea-driver` must not acquire a SharedTree dependency.
Test packages may consume SharedTree without making it a dependency of the driver.
Keep this work in the test-driver definitions, test-driver implementation, test selection/lifecycle infrastructure, owning test-package documentation, and this plan.
Leave ServiceClient and example integration with their current owners.
The user assigned ownership of driver-contract fixes to this workstream after the configuration checkpoint.
After the membership investigation, the user explicitly authorized extending the neutral session API and service/transport bindings while preserving Fluid-independent layering.
The user approved adding SEA package dependencies to `test-drivers` and updating only its root lockfile importer; reconcile that overlap with ServiceClient during integration.
Coordinate other shared workspace/build changes and overlapping production edits; isolated worktrees prevent working-tree interference but do not prevent integration conflicts.

## Assignment and Baseline

- Worktree: `/workspaces/FluidFramework-integration-test-configuration`.
- Branch: `rust-service-integration-test-configuration`.
- Source revision: `d144885a3e5fa68d66fe4570152fb6c69a223e97` (`feat(sea-typescript): add lazy split and combined loader presets`).
- Initial working-tree status: clean, before this plan update.
- The source checkout's uncommitted ServiceClient implementation and lockfile changes were not copied.
- Plan checkpoint: `48085c15e81`.
- Configuration checkpoint: `4d9c1906dab`; default local and Tinylicious suites and required repository gates passed before this commit.
- Membership checkpoint: `c279d079d6f`; canonical Rust/Node/browser validation, root build, scoped policy, and the unchanged SEA lifecycle smoke passed.
- Workflow: one isolated assignment, without a numbered iteration; configuration and subsequent validated fix commits are authorized, but push, merge, and CI-default changes are not.

### Existing Extension Points

| Responsibility | Starting point |
| --- | --- |
| Test-driver contract and selector type | [ITestDriver and TestDriverTypes](../packages/test/test-driver-definitions/src/interfaces.ts) |
| Driver construction | [createFluidTestDriver](../packages/test/test-drivers/src/factory.ts) |
| Command-line/environment selection and defaults | [Compatibility options](../packages/test/test-version-utils/src/compatOptions.ts) |
| Versioned provider construction | [Compatibility utilities](../packages/test/test-version-utils/src/compatUtils.ts) |
| Document identity and per-test reset | [TestObjectProvider](../packages/test/test-utils/src/testObjectProvider.ts) |
| Suite-owned driver disposal | [describeCompat](../packages/test/test-version-utils/src/describeCompat.ts) and [describeWithVersions](../packages/test/test-version-utils/src/describeWithVersions.ts) |
| Initial integration-suite target | [End-to-end tests](../packages/test/test-end-to-end-tests/README.md) |

`TestObjectProvider` normally adopts the attached container's resolved document ID.
Preserve that behavior for SEA-allocated identities; do not assume that a test-generated name is a SEA document ID.
Per-test reset and suite disposal are distinct lifecycle boundaries; verify that containers, sessions, and the service process are released even when setup or a test fails.

## Initial Configuration

Use an explicit opt-in selector, provisionally `sea-websocket`, for Node.js clients connecting to a test-owned native Rust service with `SEA_STORAGE_MODE=memory`.
Inject `openRemote` from `@fluidframework/sea-typescript/internal/websocket` into `SeaSessionDriverClient`, with `environment: "node"` and `mode: "WebSocket"`.
Do not use a preference policy, silently substitute in-process memory, or claim WebTransport coverage from this selection.
Start with current-version tests and make that selection visible in the run command; do not claim historical SEA-driver compatibility or silently discard requested compatibility combinations.

The service owns storage for its process lifetime, so separate Node.js clients can share a returned document identity while the process is alive.
Restart persistence is not promised by this initial memory-storage configuration.
In-process memory remains an optional lightweight smoke-test backend, not a second required deliverable.
File-backed storage, browser WebTransport, and compression matrices are later extensions rather than prerequisites.

Follow the [server listener guide](crates/sea-webtransport-server/README.md#optional-websocket-listener) for startup:

- Build with `websocket-stream`; bind the separate WebSocket listener to loopback on an available port and discover its printed `WEBSOCKET_URL`.
- Use Node.js with a built-in WebSocket implementation; the retained evidence used Node 22.23.2.
- Enable `SEA_WEBSOCKET_ORIGINLESS_LOOPBACK=1` only for this direct, unforwarded local listener, because Node's built-in client sends no Origin header.
- Do not expose or forward this listener publicly; the loopback exception is not authentication.
- The existing executable still requires its QUIC bind and certificate/key arguments, even when these test clients use WebSocket.
	Generate disposable certificates and keep their paths and any service data in a test-owned temporary directory.
- Give readiness, tests, and shutdown bounded deadlines; retain service logs on failure and ensure process exit, socket closure, and temporary-resource cleanup on both success and failure.

Ordinary WebSocket does not provide application-demand receive backpressure.
Its adapter queues fail at 4 MiB or 256 messages per socket instead of dropping data; these limits are not total runtime or network memory bounds.
Record overflow as an observed failure, and do not interpret this configuration as a WebTransport pressure/performance test.
The socket artifact does not support compression.

## Fresh-Context Entry

- Read this plan's acceptance criteria and review boundary; the [main integration plan](SERVICE_CLIENT_PLAN.md) supplies dependency context, not additional assigned stages.
- Read [Sea architecture](SEA_ARCHITECTURE.md), [Known Issues](KNOWN_ISSUES.md), and [Development](DEVELOPMENT.md) before implementation.
- Check the assigned worktree path, branch, HEAD, and working-tree status; preserve existing changes and confirm ownership before editing shared test infrastructure.
- Use the [existing Fluid harness](tests/minimal-fluid-driver/README.md), [Node socket regression](packages/sea-typescript/test/websocket.test.mjs), and [sea-driver manifest](packages/sea-driver/package.json) for initialization, package entrypoints, and behavioral limits.
- Confirm the extension points above before editing; the minimal Fluid harness is a reference, not the registration target.
- Check installed tools, worktree-local dependencies and generated artifacts, and service startup prerequisites; record missing prerequisites as blocked validation, not behavioral test results.
- Install dependencies in this worktree with the frozen lockfile before implementation validation; do not share an outer `node_modules` symlink or assume ignored outputs were copied with Git.
- Coordinate any missing package API with its owner instead of implementing the main plan or reopening the completed Codespaces investigation.

## Implementation Checklist

- [x] Locate the existing multi-service/driver test configuration and its selection and lifecycle extension points.
- [x] Choose and document the initial SEA backend, transport, lifecycle requirements, and prerequisites.
- [x] Add SEA through those established extension points with an explicit opt-in selector; a named selection must run SEA, not silently substitute another driver.
- [x] Keep SEA excluded when no opt-in is supplied, including existing default and CI invocations.
- [x] Add focused checks that verify selection, initialization, and cleanup without suppressing genuine driver failures.
- [x] Prove detached create, attach, second-client load, edits in both directions, and cleanup through the actual test provider; the ordered-membership implementation passes the unchanged lifecycle smoke.
- [ ] Run the new configuration and distinguish setup failures from behavioral failures and unsupported contracts.
- [ ] Retain exact commands and a failure inventory with test names, failure signatures, reproduction steps, and relevant known limitations.
- [x] Document how to run the configuration and interpret expected limitations.
- [x] Complete default-service and repository gates, then commit the configuration with its known failures before undertaking driver fixes.
- [ ] Fix failures in focused validated commits and repeat the SEA suite; inventory any tests excluded because they assert a non-SEA implementation detail.

Fix defects in the new configuration needed to make it runnable.
Do not weaken shared assertions, silently skip failing behavior, or change production semantics merely to obtain a green test run.
Escalate a shared-contract conflict rather than redefining the test contract.

## Validation and Acceptance

Acceptance requires a reproducibly runnable opt-in configuration, preserved default selection behavior, reliable test-owned resource cleanup, and an actionable inventory of observed failures.
Passing every SEA test is not an acceptance condition for this initial configuration step.
Existing non-SEA tests affected by the configuration changes must retain their behavior.

Run focused configuration and selection tests first, then the provider smoke test, the selected current-version SEA suite, and relevant existing-service regressions.
Verify that non-SEA selections do not start a SEA service or initialize its WASM artifacts.
Check cleanup after successful execution, failed initialization, and behavioral failure, including the distinction between per-test reset and suite disposal.
Follow [Development](DEVELOPMENT.md) for applicable implementation gates, including canonical Rust-service validation when relevant, scoped policy checks, and repository-root `pnpm build:fast` for registered package or build-input changes.
Run the owning test packages' required checks as well.
Record blocked validation explicitly; setup failure alone is not evidence that the behavioral suite was exercised.

Maintain the command results, configuration decisions, source revision, failure inventory, and remaining blockers in this plan while it is active.
Update its checklist as work proceeds so another agent can continue without chat history.

## Evidence and Remaining Work

The completed transport work records a real Node.js two-session test covering live events, submission resolution, shared blobs, and session cleanup against the Rust listener.
That regression uses `PreferAvailable`; it is transport foundation evidence, not a completed test of this plan's fixed `WebSocket` selector or Fluid provider.
The existing Fluid harness supplies separate adapter evidence, not proof that the repository's multi-service suite already works with SEA.

Preparation on 2026-09-19 created the isolated worktree and committed the updated plan.
Preparation validation ran from the assigned worktree root:

- A Node.js file-existence check passed for all 23 local Markdown link targets in this plan.
- `node rust-service/scripts/check-documentation.mjs` passed: 29 roots, 36 READMEs, and 82 local links.
- `pnpm policy-check --path rust-service` exited with code 1 because TypeScript could not be resolved in the four Rust-service TypeScript packages without worktree-local dependencies.
	This is blocked environment validation, not a behavioral failure; rerun after the frozen-lockfile install.
- Full builds and behavioral tests were not run for this documentation-only preparation step.

Implementation now has worktree-local dependencies installed with `pnpm install --frozen-lockfile`, independently generated WASM artifacts, and a real Rust listener exercised by the new runner.
The approved dependency update used `pnpm install --lockfile-only --no-frozen-lockfile --ignore-scripts` followed by a frozen install; the root lockfile diff is six lines in the `test-drivers` importer only.

Commands below run from this worktree root:

| Command | Result |
| --- | --- |
| `node --test packages/test/test-end-to-end-tests/scripts/seaRunner.test.mjs` | Five checks pass: success, startup failure, test failure, readiness timeout, and interruption all release the child and temporary directory. |
| `pnpm exec fluid-build packages/test/test-drivers --task build:esm` | Pass; includes clean local WASM generation. |
| `node --test packages/test/test-drivers/test/seaWebSocketTestDriver.test.mjs` | Five checks pass: unchanged local default without WASM initialization, historical-version rejection, explicit endpoint, identity/disposal, and endpoint rejection. |
| `pnpm exec fluid-build packages/test/test-end-to-end-tests --task build:test:esm` | Pass after correcting the new smoke test's entrypoint typing. |
| `pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea --grep 'Driver lifecycle smoke'` | Behavioral failure SEA-001 below, after successful startup, attachment, and second-client load. |
| `pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:run -- --driver=local --compatKind=None --compatVersion=0 --grep 'Driver lifecycle smoke' --timeout=10000` | Same smoke test passes with the existing local driver. |
| `pnpm policy-check --path 'packages/test/(test-drivers\|test-driver-definitions\|test-version-utils\|test-end-to-end-tests)'` | Pass after explicitly authorized headers and script ordering. |
| `pnpm policy-check --path rust-service` | Pass after worktree-local installation. |
| `pnpm build:fast` | Pass on rerun. The first run found two local lint issues and a duplicated factory return union in `test-service-load`; all were repaired and focused checks passed. Generated `PACKAGES.md` reflects the two new SEA dependency edges. |
| `pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea --grep 'Driver lifecycle smoke\|Container Creation\|SharedCounter' --timeout=2000` | One passing, four failing; bounded failure sample, not a complete suite run. |
| `pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea --grep 'SharedCounter orderSequentially'` | One passing; real native-service graceful shutdown and temporary-resource cleanup completed successfully. |
| `pnpm --dir packages/test/test-version-utils test` | 126 passing. |
| Canonical commands from `rust-service/`: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps`, `cargo build --workspace --all-targets`, `cargo test --workspace --all-targets --all-features`, `./test.sh` | All passed, including generated Node and Chromium harnesses. |
| `pnpm --dir packages/test/test-end-to-end-tests test` | Local: 5340 passing, 630 existing pending; Tinylicious: 4049 passing, 1921 existing pending. No failures reported in either default suite. |
| `pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea --timeout=2000` at `4d9c1906dab` | Partial inventory: ten-minute runner cap reached after 214 reported failures, before `SharedInterval` completed. No final suite totals; short-deadline failures remain provisional. |
| SEA lifecycle smoke after ordered-membership edits | One passing, unchanged assertions; detached creation, attachment, peer loading, bidirectional edits, and cleanup complete. |
| `cargo test -p sea-sequencer` after membership edits | 17 passing, including persisted encoding and close/replacement/recovery ordering. |
| `cargo test -p sea-integration-tests --test session_composition` after membership edits | 12 configurations pass, each also checking membership through its complete decorator/transport stack. |
| Existing driver Node tests and neutral session tests after membership edits | 32 passing; the extended read-first regression also proves identical replay and actual writer identities. |
| Membership checkpoint gates | Root `pnpm build:fast`, Rust formatting/Clippy/rustdoc/build, and scoped policy passed. Workspace tests hit the previously observed server idle-stream timeout once under concurrent build load, then passed isolated and as a full rerun. |
| Browser membership regression | The trace initially asserted synthetic projection positions; it now distinguishes membership from application records, checks actual member IDs, and retains exact delivery/recovery assertions. The complete browser matrix passes. |

### Failure Inventory

| ID | Test and reproduction | Signature and classification | Disposition |
| --- | --- | --- | --- |
| SEA-001 | `Driver lifecycle smoke / Non-Compat / creates detached, attaches, loads a peer, exchanges edits, and closes`; run the SEA smoke command above. | `Timeout on waiting for pending join or leave op` in `LoaderContainerTracker.ensureSynchronized`, first synchronization after load; behavioral membership-contract mismatch with the driver's synthetic membership. | Passes after the ordered-membership fix; assertion unchanged. |
| SEA-002 | `SharedCounter / Non-Compat / before each: Ensure synchronized / can create the counter in 3 containers correctly`; run the bounded sample above. | Same pending join/leave timeout as SEA-001. | Passes at `4ea052fa0ff` with unchanged assertions. |
| SEA-003 | `SharedCounter - runtime benchmarks / Non-Compat / increment value in 3 containers`; run the bounded sample above. | Mocha 2000ms timeout, with transport-disconnected telemetry during cleanup. | Passes at `4ea052fa0ff` with the standard 10000ms deadline. |
| SEA-004 | `Op reentry and rebasing during pending batches / Non-Compat / Pending batches with reentry - SharedCounter`; run the bounded sample above. | `Timeout on waiting a container to be saved` in `ensureSynchronized`. | Passes at `4ea052fa0ff` with unchanged assertions. |
| SEA-005 | `Container dirty flag / Non-Compat / Attached container / handles container with pending ops to be sent out`; `test:realsvc:sea --grep 'handles container with pending ops to be sent out'` at `4ea052fa0ff`. | 10000ms timeout waiting for connection after loading pending state; the old client remains in quorum because delta disposal never closes its SEA session. | Fixed by closing delta-owned authority with a session-identity guard; all four dirty-flag tests and the full selected container batch pass. |
| SEA-006 | `Attributor / Non-Compat / repopulates attribution association data using the summary tree`; `test:realsvc:sea --grep 'repopulates attribution association data using the summary tree'` at `c12ab11e734`. | `receivedSummaryAckOrNack` timeout; full `--bail` selection stops with 39 passing, 31 pending, one failing because the adapter never emits a summary acknowledgment. | Unchanged test and all nine attribution tests pass after adding snapshot validation and a durable adapter-owned acknowledgment. All 14 summary-driver tests, package/API generation, root build, scoped policy, documentation checks, and canonical `./test.sh` pass. |
| SEA-007 | `Audience correctness / Non-Compat / should add clients in audience as expected`; `test:realsvc:sea --grep '^Audience correctness'` at `378ef83823c`. | `client1's audience doesn't have client2` timeout; full `--bail` selection stops with 44 passing, 31 pending, one failing. Read-only joins occupied no-op positions but never produced audience signals. | All four unchanged audience tests pass after initial-state reconstruction and live read-only join/leave signals from durable membership. The existing multi-client Node fixture checks initial readers/writers and live departure/rejoin. Package build, root build, scoped policy, documentation check, and complete canonical `./test.sh` pass. No neutral or customer-facing API changes. |
| SEA-008 | `Summarize Document / Summarize Document - 25 DataStores - 75 DDSs / before each`; `test:realsvc:sea --grep 'Summarize Document - 25 DataStores - 75 DDSs'` at `7fd79cc59ed`. | `summarySubmitted` timeout at 10000ms; full `--bail` selection stops with 104 passing, 38 pending, one failing. Serial uploads expose TCP coalescing/delayed-ack latency on accepted WebSocket sockets. | Both unchanged benchmark cases pass after enabling TCP_NODELAY before upgrade. The owning socket regression checks the actual accepted option without a timing threshold. User-requested bounded summary-upload pipelining passes deterministic overlap/refill/failure-drain tests. Final package, root build, policy, documentation, and complete canonical gates pass. |

The first smoke attempt exposed a configuration defect: logical URLs omitted the tenant segment expected by the Fluid loader.
The resolver now uses `fluid://sea-test/tests/<document>`; the subsequent attempt reached SEA-001.
The initial failure inventory applies to configuration checkpoint `4d9c1906dab`.
SEA-specific exclusions are listed in the explicit inventory below; none of the behavioral fixes above weakened shared assertions.

SEA-006 is owned entirely by the Fluid adapter; the neutral sequencer remains unaware of summary semantics.
Focused regressions prove identical live and replayed acknowledgment records, bounded system-message projection, rejection of an unpublished snapshot before proposal admission, and terminal leave after an interrupted acknowledgment without retry.
The first integration attempt exposed serialized proposal contents at the driver boundary; the regression now uses that exact representation, and all temporary probes were removed.
The generated API comparison against local checkpoint `c12ab11e734` adds only the internal `ProjectedOperation.eventType` acknowledgment variant; no customer-facing release change or changeset is required.
Native source and protocol remain unchanged from the previously validated strict-native checkpoint; the complete canonical suite reruns native, generated Node, driver, and Chromium coverage.
The attribution batch still emits transport-disconnected cleanup telemetry without failed assertions.

SEA-008 timing probes localized the timeout to summary blob upload after parent-summary retrieval; all probes were removed.
The TCP_NODELAY-only run passed both benchmark cases with test-body times of 734ms and 311ms instead of timing out in setup.
Strict native formatting, Clippy, rustdoc, build, focused socket tests, canonical `./test.sh`, root build, and scoped policy passed for that transport repair.
The user then requested independent uploads without waiting for round trips.
The neutral TypeScript wrapper already admits concurrent blob operations separately from serialized author appends; the Fluid summary traversal was serial.
The adapter now uses eight refillable workers across the whole summary, validates handles first, delays encoding until admission, drains admitted uploads after failure, and publishes only after complete success.
All 16 summary-driver tests pass, including controlled receipts proving overlap before any round trip, slot refill, a fixed concurrency bound, and no suffix admission or publication after failure.
The combined real-service benchmark passes with test-body times of 704ms and 295ms; these single runs are correctness evidence, not a statistically established speedup.
Final combined validation passed: package build, root `pnpm build:fast`, scoped policy, documentation links, and complete canonical `./test.sh`.
No generated API report or shared test assertion changed.

With TCP delays removed at `348d780b390`, the full suite exposed a read-to-write replacement race in `Audience correctness / should add clients in audience as expected in write mode` (45 passing, 31 pending, one failing).
A temporary listener probe found no unobserved operations; telemetry instead showed admitted finite archive reads cancelled by delta disposal closing their shared session.
Disconnect now prevents new reads and drains admitted finite reads before closing; all four unchanged audience tests pass in 375ms.
The existing suspended-read regression now includes explicit disconnect before replacement and proves both old-read completion and deferral of later reads.
All 16 owning tests, package/root builds, scoped policy, documentation checks, and complete canonical `./test.sh` pass; probes are removed and no API report changes are needed.
The next full `--bail` run reaches 108 passing and 38 pending, including the large summary benchmarks, then fails `blobs (createBlobPayloadPending: undefined) / attach sends an op` with `SEA session is not open` during upload.
That remaining content-operation admission gap is separate from the committed upload pipeline and the finite-read disposal fix; no exclusions were added.
Both unchanged `attach sends an op` variants now pass after blob uploads use the same session-admission gate as finite reads.
The existing lifecycle fixture independently blocks a read and an upload, proves the upload still prevents close after the read completes, and verifies that subsequent reads and uploads use the replacement.
Independent uploads remain concurrent; only membership transitions block admission.
Final package/root builds, scoped policy, documentation checks, and complete canonical `./test.sh` pass for this follow-up; no API report changes.
The unchanged `^blobs ` batch now passes seven tests, including simultaneous identical uploads on one and separate containers, with one existing pending test.
It next fails `reconnection does not block ops when having pending blobs` with `SEA event stream is not open` during subscription setup; subscription reuse remains a separate follow-up.
Both unchanged reconnect variants pass after opening a fresh reader when the cached startup stream has already been transferred, even when the requested cursor is unchanged.
The owning neutral-adapter regression opens two subscriptions at the same cursor and verifies that cancelling one leaves the other's replay intact.
Subscription follow-up package/root builds, scoped policy, documentation check, and complete canonical `./test.sh` pass; no API report changes.
The full `--bail` run advances to 160 passing and 60 pending, then fails setup in `Op Compression self-healing with old loader`, which explicitly requests historical APIs despite this configuration's current-version-only constraint.
The teardown error is secondary to the rejected provider creation; inspect this suite for an explicit inventoried exclusion rather than weakening the compatibility guard.

For each observed failure, record the exact test name and command, source revision, failure signature, setup versus behavioral classification, reproduction steps, and relevant known limitation.
Keep unsupported contracts visible, including signals, presence, synthetic membership, automatic reconnect, authentication, and garbage collection; do not weaken shared assertions to hide them.

### SEA Exclusion Inventory

| ID | Exact suite and affected cases | Reason | Evidence |
| --- | --- | --- | --- |
| SEA-EX-001 | `Op Compression self-healing with old loader`: `Can compress and process compressed op`, `Processes ops that weren't worth compressing`, and the four `Correctly processes messages` compression/chunking/grouping combinations. | Explicitly loads `2.0.0-internal.1.4.6`, outside the current-version-only SEA configuration. The compatibility guard remains intact; only this historical suite skips for `sea-websocket`. | `test:realsvc:sea --grep '^Op Compression'`: six current tests pass, six historical tests pending. Identical selection with `--driver=local --compatKind=None --compatVersion=0 --timeout=10000`: all twelve pass. |

Existing test-suite pending conditions are separate from this inventory.
No current-version behavioral failure has been excluded.
The exclusion checkpoint passes the focused SEA/local comparisons, root `pnpm build:fast`, scoped policy, documentation, and compile checks.
The next full `--bail` run reaches 340 passing and 402 pending, then times out in `Runtime IdCompressor / finalizes IDs made in a detached state immediately upon attach`, waiting for incoming sequence 3.
That current-version delivery failure remains in scope; it is not an exclusion candidate.

The ID-compressor timeout at `dd431da9966` was a shared tracker defect, not lost SEA delivery.
The test creates a fourth container for an independent document; the tracker incorrectly required its sequence number to equal that of the first document's three clients.
A temporary document-scoped synchronization probe passed and was removed.
The original integration test and its assertions remain unchanged.
`LoaderContainerTracker` now compares incoming sequence positions within each resolved document, treating unresolved containers independently.
Two focused regressions prove independent positions are allowed and a lagging same-document peer is still detected.
All 21 test-utils tests and all 32 `Runtime IdCompressor` cases pass, with the latter repeated on both SEA and the local driver.
Root build, test-utils lint, scoped policy, documentation, and canonical SEA validation pass.
No SEA production crate or generated API changed; existing native validation remains applicable.
The next full `test:realsvc:sea --bail` run reaches 368 passing and 402 pending, then fails `Layer compatibility validation / loader / driver compatibility / create flow` setup because its driver switch does not recognize `sea-websocket`.
The teardown failure is secondary to that setup rejection; no additional exclusion was added.

The layer-compatibility failure at `8dc19b36955` exposed missing SEA factory declarations as well as a missing driver branch in the test helper.
The factory now publishes its generated package version, shared Fluid generation, and loader requirements through the standard compatibility interfaces.
The shared tests consume those exact declarations without changing their assertions.
The focused layer suite passes 15 SEA cases with 24 existing non-local skips, and all 39 local-driver cases.
These cases cover both validation directions, generation and feature rejection, creation and loading, and the explicit override flag; they are the owning regression evidence for the factory declarations.
Frozen install, package and root builds, generated API reports, scoped policy, documentation, and canonical `./test.sh` pass.
The API delta against the preceding checkpoint contains only internal declaration constants and factory properties; no customer-facing changeset or API Council review is required.
The next full SEA `--bail` run reaches 384 passing and 427 pending before `LoadModes / Can load a paused container at a specific sequence number` fails with `SEA session is not open` while fetching a blob.
That lifecycle failure remains in scope and is not excluded.

The paused-load failure at `5b52b8352ac` conflated delta membership with document storage lifetime.
Loading to a specified sequence disconnects delta delivery before lazily loading data-store blobs.
Owned delta disposal now retains the document identity for a lazy, unannounced archive session; it still durably closes the old membership and cannot restore its author authority.
Concurrent finite operations share the archive opening, while a replacement delta session or full document-service disposal drains admitted operations and closes the archive owner.
The existing membership regression verifies final leaves, stale-owner isolation, continued blob access, rejection of delta author operations, and full-disposal rejection.
A deterministic delayed-opening regression verifies shared admission and disposal while the archive factory is still pending.
All 17 summary/lifecycle tests and all five unchanged `LoadModes` integration cases pass.
Package and root builds, scoped policy, documentation, and complete canonical `./test.sh` pass; no API report changes.
The next full SEA `--bail` run reaches 393 passing and 428 pending, then fails `TestSignals / Validate signal events are raised on the correct runtime` with the explicit `signals are unsupported` error.
Application signals remain an applicable missing contract, not an implementation-specific exclusion.

### Signal Integration and Overlapping Delta Initialization

The worktree fast-forwarded to `9c510d094fc`, including the user's neutral signals and connection-timeout fixes.
All seven `TestSignals` and `Targeted Signals` cases now pass; the unsupported-signal failure above is resolved.
Both `reconnection does not block ops when having pending blobs` variants instead exposed overlapping delta initialization with `signal stream is already open on this connection`.
The document service serialized only session replacement, allowing a second opening to replace the shared session while the first was still registering its signals.
A temporary trace confirmed both delta connections registering on the second session; reverting the diagnostic fix reproduced both failures.

`connectToDeltaStream` now keeps membership announcement, signal registration, and subscription setup inside the existing serialized session transition.
The existing lifecycle fixture adds a promise-gated overlap regression, and all 18 tests in that file pass.
`pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea --grep 'reconnection does not block ops when having pending blobs|^(TestSignals|Targeted Signals)'` passes all nine unchanged integration tests.
No server duplicate-registration guard, shared assertion, or exclusion changed.
The subsequent full SEA run with this fix is recorded below.

Package/API generation, root `pnpm build:fast`, scoped policy, documentation checks, Rust formatting, strict Clippy, rustdoc, and native build passed.
The initial workspace test run timed out in `host::tests::native_client_round_trip_in_every_storage_mode`; that test passed on an isolated retry without native edits.
The complete canonical `./test.sh` also passed, including workspace native tests, generated Node/WASM coverage, and Chromium checks.
There are no generated API-report changes.

### Full Current-Version Run at `476613b3eac`

On 2026-09-19, after rebuilding with `pnpm exec fluid-build packages/test/test-end-to-end-tests --task build:test:esm`, the complete selection ran without fail-fast:

```bash
pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea --no-bail --reporter json --reporter-option output=/tmp/sea-full-476613b3eac-results.json
```

Mocha completed in 70.621 seconds with 1,184 tests: 655 passed, 526 pending, and three failed.
The run retained the standard 10-second per-test timeout and finished before the runner's 10-minute limit.
The runner exited with code 1 after Mocha reported three failures; this was not a build or startup failure.
The machine-readable report is `/tmp/sea-full-476613b3eac-results.json`; build and runner output are `/tmp/sea-full-476613b3eac-build.log` and `/tmp/sea-full-476613b3eac-run.log`.

| Failing test | Observed failure |
| --- | --- |
| `Pong / Pong / Non-Compat / Delta manager receives pong event` | `Forcing timeout before test does (9985ms)` while waiting for the pong event. |
| `SingleCommit Summaries Tests / Non-Compat / Non single commit summary/Last summary should be discarded due to missing SummaryOp` | `Summary Parent should match ack handle of summary1`. |
| `Summarizer fetches expected number of times / Non-Compat / Summarizer loading from an older summary should fetch latest summary` | `SEA session is not open` from `SeaSessionDriverClient.withArchiveSession` during `fetchBlob`. |

These are observed failures, not root-cause diagnoses or approved exclusion candidates.
The 526 pending cases include the six explicit historical-loader exclusions and inherited suite conditions; they are not passes.
Largest pending groups are `handle validation` (184), `Validate Attach lifecycle` (31), `Frozen Delta stream loading mode testing` (27), `Container` (25), and layer compatibility (24).
An exhaustive applicability audit of the inherited skips remains open.
No assertions, production code, or skip conditions changed for this run.

### One-Off Handle Validation on SEA

At the user's request on 2026-09-19, `handle validation` ran on SEA without permanently changing its local-only selection.
Starting from `1a96d221965`, a temporary `case "sea-websocket":` in the suite's driver guard enabled the run after rebuilding the tests.
`pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea --grep '^handle validation' --no-bail --reporter json --reporter-option output=/tmp/sea-handles-manual-results.json` completed with all 184 cases passing, zero pending, and zero failures in 15.263 seconds.
Assertions and the standard 10-second per-test timeout were unchanged.
These cases check handle round-tripping and transitive attachment across DDS types, including resolution from another container after the originating container closes.
The temporary source change was removed and the tests rebuilt; source comparison and generated-code inspection confirmed the original local-only selection was restored.
This is additional manual coverage, not a change to the preceding full-run counts or a permanent SEA opt-in.

### Membership Investigation

SEA-001 is not a test-specific mismatch: `SeaDeltaConnection` fabricates two initial join operations independently for each connection, and `projectOperation` collapses all other authors into one synthetic remote client.
Consequently, two peers do not observe the same identities or membership history.
The existing lifecycle smoke is the focused regression: both peers must exchange edits and satisfy the unchanged quorum synchronization check.

The neutral `SeaAuthorSession` contract exposes submission and membership close, but no ordered membership-observation API.
Client-authored join/leave application events could represent graceful connections, but cannot authoritatively remove an abruptly disconnected peer by themselves.
Relabeling the synthetic member, suppressing its interactive capability, or bypassing the test's quorum check would hide the missing contract rather than implement it.

The recommended next design is a Fluid-independent, service-authoritative membership facility at the session layer, with Fluid join/leave projection owned by `sea-driver`.
This requires coordinating the neutral session API, transport/bindings, ordering relative to application events, replay/snapshot boundaries, and disconnect policy with the ServiceClient owner.
The user approved this extension rather than pausing at the configuration checkpoint.
The implemented design and compatibility boundary are recorded in [decision 0014](historical/decisions/0014-ordered-session-membership.md).
The neutral API remains opt-in, and no new SEA test exclusions have been added.

### ServiceClient Integration

The user authorized comparisons against useful local revisions and requested integration of the completed `rust-service` branch before further fixes.
The API comparison against assignment base `d144885a3e5` found only internal changes in `sea-driver` and `sea-typescript`; no customer-facing release-tag changes require API Council review or a changeset.
Source tip `a8a8a5abb85` adds the shared ServiceClient implementation (`e197e8d5b1a`) and inventory example integration.
The merge applied without textual conflicts, and a frozen install, root build, strict native gates, policy, documentation checks, and all 16 existing Node driver/ServiceClient tests passed.

The first combined canonical run passed Rust and Node tests but failed the new browser ServiceClient reopen trace with `Invalid MinimumSequenceNumber from service`.
The membership projection incorrectly treated SEA's active-member minimum as Fluid's retention boundary.
New admission may decrease SEA's minimum; Fluid requires a nondecreasing minimum.
The adapter now conservatively reports zero while retaining all history, consistent with its lack of garbage collection or compaction.
It does not clamp SEA's minimum to an unsafe high-water mark or change neutral semantics.
The focused Node regression proves the raw minimum decreases across close/reopen while full and bounded Fluid replay preserve a stable minimum.
The complete browser matrix then passed, including both ServiceClient presets with and without compression.
Final validation passed after the repair: root `pnpm build:fast`, scoped policy, documentation and formatting checks, the complete canonical `./test.sh`, and the unchanged SEA lifecycle smoke (one passing).
The source branch and its running demo were not modified; SEA remains opt-in and no exclusions were added.

### Ordered Append Contract Correction

The user rejected a permanent minimum-sequence-zero workaround and clarified two independent requirements: a durable monotonic document reference floor, and fail-stop append authority whose accepted events form a prefix ending at a durable leave.
The required behavior was documented first in `f254dfeeb87`, including explicit TODOs and known issues RS-023, RS-024, and RS-025.
[Decision 0015](historical/decisions/0015-terminal-append-authority.md) records the fail-stop contract implemented next.
The reference floor and application-owned transformed resubmission remain separate follow-up work; passing existing tests does not resolve those requirements.

RS-023 implementation evidence by boundary:

- `sea-sequencer`: admitted cancellation and returned rejection revoke shared membership authority; retained appends settle before leave, and failed settlement requires recovery.
	`failed_append_and_cancelled_ack_end_announced_prefix_before_later_work` covers definitive rejection, settled absence, and cancellation before/after commit; existing recovery tests now require a fresh membership after failure.
- `sea-webtransport-server`: malformed author requests close the session before queued work, and every author-stream exit drives close.
	`malformed_append_closes_authority_before_queued_submission` checks the owning dispatch decision; existing malformed-stream, acknowledgment-loss, connection cleanup, and shutdown tests cover transport lifetime.
- `sea-webtransport`: `author_error_or_cancelled_receipt_prevents_later_requests` proves the client never sends a suffix after an error or cancelled receipt.
- `sea-encryption`: shared serialized admission covers asynchronous retry preparation before the inner append.
	`cancelled_preparation_terminates_clones_before_inner_append` proves cancelled admission is terminal across clones and drives the final leave; stable-ciphertext tests continue to enforce exact lookup without post-error resubmission.
- `sea-compression`: synchronous encode failure closes the inner session; there is no suspension before inner admission on successful encoding.
	Existing codec tests cover compression/decompression, and composition tests own fail-stop forwarding through this decorator; the in-memory encoder has no practical injectable I/O failure.
- `sea-wasm` and `sea-typescript`: malformed operation/tree input closes authority, and the neutral wrapper serializes author calls before conversion.
	Generated Node regression `invalid append input terminates the accepted prefix before queued work` covers empty operation identity and malformed tree identity, with an observer proving join/application/leave and no queued event.
- `sea-integration-tests`: all 12 composition configurations retain intentional failures at terminal points and prove recovery through fresh sessions rather than continuing failed memberships.

Native formatting, strict Clippy, rustdoc, build, and all-feature tests passed.
The final complete canonical `./test.sh` passed with the binding-validation regression included, along with the package rebuild, root `pnpm build:fast`, and scoped policy check.
Documentation-link validation passed for 29 roots, 36 READMEs, and 84 local links.
An eight-test current-version SEA sample at `15f49ba5981` passed with the normal ten-second deadline, including the lifecycle smoke and the previously recorded SharedCounter/reentry failures; no new exclusions were added.

### Durable Reference Floor

[Decision 0016](historical/decisions/0016-durable-reference-floor.md) records the RS-024 implementation.
The runtime now restores and enforces a document-wide committed floor, including absent-reference rejection, independently of membership admission and advancement policy.
Advances commit atomically in ordered event metadata; cooperative progress and a coalesced bounded-lag window choose proposals but cannot lower the floor.
Snapshot boundaries retain the floor in their immutable event envelopes, and the Fluid adapter maps that floor into dense sequence numbers for full and bounded replay.
Earlier experimental encodings are rejected explicitly (`SEAQ3`/`SEAM2`, wire version 7), not reinterpreted.

Owning sequencer tests cover monotonic reopen/recovery, absent and stale references, exact prior-operation lookup, successful current-context submission, idle-reader window advancement, definitive/ambiguous storage outcomes, and snapshot-boundary floor retention.
The changed core comments and persisted codec document the same contract.
The protocol version uses existing negotiation tests; TypeScript and transport preserve the unchanged metadata shape, with generated tests and real Chromium traces validating that boundary.
The Fluid projection regression now expects advancing minima `[0, 1, 2, 2]` across join/application/leave/rejoin, with identical bounded history.

All 22 sequencer tests, 12 composition configurations, strict workspace Clippy, formatting, rustdoc, build, root `pnpm build:fast`, documentation links, and scoped policy pass.
The final canonical run initially hit the previously observed `idle_stream_outlives_operation_deadline_in_every_storage_mode` timeout; that unchanged test passed isolated and the complete `./test.sh` rerun passed.
RS-024 and its TODOs are removed; RS-025 remains open and broader integration work is still deferred until its repair.

### Application-Owned Suffix Recovery

RS-025 is implemented in `SeaDeltaConnection` without interpreting application payloads.
The driver retains original session identities and an ordered identity ledger, replays terminal history through leave, and verifies that accepted applications are exactly a submitted prefix.
Missing terminal history, non-prefix history, and reuse of the old session reject recovery.
The explicit helper now requires a callback transforming the whole proven suffix into fresh-session messages numbered from one, with caller-selected payloads and references and newly allocated submission identities.
Accepted payloads are not retained by the prefix ledger.

The owning Node regression injects a lost receipt after the second accepted event, queues a third, rejects recovery before leave and with a missing-prefix event, and proves only the unaccepted third event is transformed.
Its final archive contains application deltas `[1, 2, 7]`, with new session/submission identities for the transformed event, not a duplicate of the accepted prefix or stale delta 3.
All ten tests in the owning driver test file pass.
The simple browser counter trace provides an explicit transformation for its context-independent deltas.
The full SharedTree browser trace now exercises `IContainer.disconnect()`/`connect()` and Fluid runtime pending-state recovery instead of calling the driver retry helper with an opaque DDS payload.
Two Chromium runs passed with three independent containers, recovered value 3, and reload; the final evidence reports runtime-owned recovery rather than the removed explicit retry.
The temporary server was stopped, and the unrelated public demo was untouched.

RS-025 source TODOs and its known issue are removed.
Final root `pnpm build:fast`, package build and generated API reports, scoped policy, documentation links, strict native formatting/Clippy/rustdoc/build, and complete canonical `./test.sh` all passed.
The generated API comparison against the preceding local checkpoint `2f5f1484ab5` contains only internal `PendingSubmission.session` and `resubmitPending(transform)` changes; no customer-facing release tag, API Council review, or changeset is required.
The contract checkpoints are ready to commit before returning to the wider SEA integration inventory.

### Post-Contract Integration Batches

At `4ea052fa0ff`, the normal-deadline batch selected by `Driver lifecycle smoke|SharedCounter|Container Creation|Container Loading|SharedMap` passed 25 tests.
The next batch selected by `^(SharedString|SharedDirectory|SubDirectory operations|Detached Container)` passed 70 tests with three existing pending cases.
The `^Container` batch with `--bail` stopped after 18 passes and 31 pending cases at SEA-005.
Temporary phase/membership probes showed pending-state capture and load completed, but Fluid waited for the previous session's leave.
Closing the disposed delta session produced that leave and unblocked runtime resubmission.
All temporary probes were removed; shared assertions and test configuration remain unchanged.

The fix passes the owning Node regression `stale delta disposal cannot close a replacement session`, all eleven tests in the driver test file, all four `Container dirty flag` tests, and the repeated `^Container --bail` batch (22 passing, 31 existing pending).
The adapter now accepts an optional session owner on `disconnect`, and disposal supplies that owner so a superseded delta cannot close the new membership.
Root/package/API generation, scoped policy, documentation checks, and complete canonical `./test.sh` passed.
The generated API delta adds only an optional session-owner argument to internal disconnect methods; existing callers remain compatible and no customer-facing changeset or API Council review is required.
Background summarizer startup can still emit transport-disconnected cleanup telemetry; these batches reported no associated failing assertion after the fix.
No new SEA-specific exclusions have been added, and the complete current-version suite is not yet proven.

## Review Boundary and Later Work

The user authorized committing the configuration once default tests pass and the checkout is in a committable state, with opt-in failures explicitly recorded.
Commit that boundary before fixing driver-contract failures.
Then fix and validate focused issues, commit the fixes, and repeat the integration tests until the current-version SEA suite passes.
Do not replace shared assertions or classify missing supported behavior as a test flaw.
Skip a SEA test only when its asserted implementation detail does not apply to SEA; retain its exact name, reason, and any alternative contract coverage in an exclusion inventory.
SEA remains off by default even after the opt-in suite passes; enabling defaults, pushing, and merging require separate authorization.

When this assignment is complete, keep run instructions with the owning test package and archive this plan and its evidence under [Historical records](historical/README.md).
Do not start a numbered iteration unless that workflow is separately selected through the [coordination skill](../.github/skills/rust-service-coordination/SKILL.md).
