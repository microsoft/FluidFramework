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
| SEA-002 | `SharedCounter / Non-Compat / before each: Ensure synchronized / can create the counter in 3 containers correctly`; run the bounded sample above. | Same pending join/leave timeout as SEA-001. | Retained; verify after membership fix. |
| SEA-003 | `SharedCounter - runtime benchmarks / Non-Compat / increment value in 3 containers`; run the bounded sample above. | Mocha 2000ms timeout, with transport-disconnected telemetry during cleanup. | Retained; rerun with the standard 10000ms deadline after membership fix before assigning a separate cause. |
| SEA-004 | `Op reentry and rebasing during pending batches / Non-Compat / Pending batches with reentry - SharedCounter`; run the bounded sample above. | `Timeout on waiting a container to be saved` in `ensureSynchronized`. | Retained; investigate pending-operation acknowledgment after membership fix. |

The first smoke attempt exposed a configuration defect: logical URLs omitted the tenant segment expected by the Fluid loader.
The resolver now uses `fluid://sea-test/tests/<document>`; the subsequent attempt reached SEA-001.
The initial failure inventory applies to configuration checkpoint `4d9c1906dab`.
No new SEA-specific test exclusions have been added.

For each observed failure, record the exact test name and command, source revision, failure signature, setup versus behavioral classification, reproduction steps, and relevant known limitation.
Keep unsupported contracts visible, including signals, presence, synthetic membership, automatic reconnect, authentication, and garbage collection; do not weaken shared assertions to hide them.

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

## Review Boundary and Later Work

The user authorized committing the configuration once default tests pass and the checkout is in a committable state, with opt-in failures explicitly recorded.
Commit that boundary before fixing driver-contract failures.
Then fix and validate focused issues, commit the fixes, and repeat the integration tests until the current-version SEA suite passes.
Do not replace shared assertions or classify missing supported behavior as a test flaw.
Skip a SEA test only when its asserted implementation detail does not apply to SEA; retain its exact name, reason, and any alternative contract coverage in an exclusion inventory.
SEA remains off by default even after the opt-in suite passes; enabling defaults, pushing, and merging require separate authorization.

When this assignment is complete, keep run instructions with the owning test package and archive this plan and its evidence under [Historical records](historical/README.md).
Do not start a numbered iteration unless that workflow is separately selected through the [coordination skill](../.github/skills/rust-service-coordination/SKILL.md).
