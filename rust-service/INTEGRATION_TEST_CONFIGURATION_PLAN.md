# SEA Opt-In Integration-Test Configuration Plan

Status: Preparation started in an isolated worktree; configuration implementation has not started.
Created: 2026-09-18.
Updated: 2026-09-19.

This is an independently assignable follow-up to the [SEA WASM and ServiceClient integration plan](SERVICE_CLIENT_PLAN.md).
Its deliverable is an explicitly runnable SEA configuration in the repository's existing multi-service/driver integration tests, not a requirement to make every test pass.
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
Leave ServiceClient, example integration, neutral bindings/presets, production transport, and existing minimal-harness changes with their current owners.
Coordinate shared lockfile, workspace/build configuration, or production-driver fixes before editing; isolated worktrees prevent working-tree interference but do not prevent integration conflicts.

## Assignment and Baseline

- Worktree: `/workspaces/FluidFramework-integration-test-configuration`.
- Branch: `rust-service-integration-test-configuration`.
- Source revision: `d144885a3e5fa68d66fe4570152fb6c69a223e97` (`feat(sea-typescript): add lazy split and combined loader presets`).
- Initial working-tree status: clean, before this plan update.
- The source checkout's uncommitted ServiceClient implementation and lockfile changes were not copied.
- Workflow: one isolated assignment, without a numbered iteration; no commit, push, merge, or CI-default change is authorized by this plan.

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
- [x] Choose and document the initial SEA backend, transport, lifecycle requirements, and prerequisites; runnable orchestration remains unimplemented.
- [ ] Add SEA through those established extension points with an explicit opt-in selector; a named selection must run SEA, not silently substitute another driver.
- [ ] Keep SEA excluded when no opt-in is supplied, including existing default and CI invocations.
- [ ] Add focused checks that verify selection, initialization, and cleanup without suppressing genuine driver failures.
- [ ] Prove detached create, attach, second-client load, edits in both directions, and cleanup through the actual test provider before running the broader suite.
- [ ] Run the new configuration and distinguish setup failures from behavioral failures and unsupported contracts.
- [ ] Retain exact commands and a failure inventory with test names, failure signatures, reproduction steps, and relevant known limitations.
- [ ] Document how to run the configuration and interpret expected limitations.
- [ ] Stop at the review boundary below before undertaking broad failure remediation.

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

Preparation on 2026-09-19 created the isolated worktree and updated this plan only.
Worktree-local package installation, generated artifacts, server startup, the provider smoke test, and the selected integration suite have not been run for this assignment.
Preparation validation ran from the assigned worktree root:

- A Node.js file-existence check passed for all 23 local Markdown link targets in this plan.
- `node rust-service/scripts/check-documentation.mjs` passed: 29 roots, 36 READMEs, and 82 local links.
- `pnpm policy-check --path rust-service` exited with code 1 because TypeScript could not be resolved in the four Rust-service TypeScript packages without worktree-local dependencies.
	This is blocked environment validation, not a behavioral failure; rerun after the frozen-lockfile install.
- Full builds and behavioral tests were not run for this documentation-only preparation step.

No behavioral failure inventory exists yet.
For each observed failure, record the exact test name and command, source revision, failure signature, setup versus behavioral classification, reproduction steps, and relevant known limitation.
Keep unsupported contracts visible, including signals, presence, synthetic membership, automatic reconnect, authentication, and garbage collection; do not weaken shared assertions to hide them.

## Review Boundary and Later Work

Present the initial opt-in integration for review and obtain authorization to commit it.
Stop before the separate failure-remediation project; review and commit of the configuration are prerequisites for that follow-up.

After that boundary, a separately assigned effort can fix failures in focused, independently validated changes, potentially across multiple commits.
Enable SEA by default only after the required suites pass and that change is approved.
After an authorized push, inspect CI results and address newly observed failures.
This plan does not authorize those later changes, commits, pushes, or CI-default changes.

When this assignment is complete, keep run instructions with the owning test package and archive this plan and its evidence under [Historical records](historical/README.md).
Do not start a numbered iteration unless that workflow is separately selected through the [coordination skill](../.github/skills/rust-service-coordination/SKILL.md).