# SEA Opt-In Integration-Test Configuration Plan

Status: Planned; optional follow-up, not started under this plan.
Created: 2026-09-18.

This is an independently assignable follow-up to the [SEA WASM and ServiceClient integration plan](SERVICE_CLIENT_PLAN.md).
Its deliverable is an explicitly runnable SEA configuration in the repository's existing multi-service/driver integration tests, not a requirement to make every test pass.
Keep the configuration out of default test runs and continuous integration (CI).

## Dependencies and Ownership

Start by inspecting the current [sea-driver package](packages/sea-driver/README.md) and the existing service/driver test extension points.
Do not assume that the new `sea-typescript` package or ServiceClient support already exists.
Discovery can proceed independently; implementation must use available package APIs or coordinate a required dependency with the main integration owner.
Record the source revision and prerequisites used for the configuration.

Do not duplicate unfinished package extraction, add a competing bindings implementation, or import generated crate output paths as a shortcut.
Preserve the main plan's layering: general SEA access belongs in `sea-typescript` when available, Fluid adaptation belongs above it, and `sea-driver` must not acquire a SharedTree dependency.
Test packages may consume SharedTree without making it a dependency of the driver.
Coordinate ownership before changing files another agent is editing.

## Fresh-Context Entry

- Read this plan's acceptance criteria and review boundary; the [main integration plan](SERVICE_CLIENT_PLAN.md) supplies dependency context, not additional assigned stages.
- Read [Sea architecture](SEA_ARCHITECTURE.md), [Known Issues](KNOWN_ISSUES.md), and [Development](DEVELOPMENT.md) before implementation.
- Check the assigned worktree path, branch, HEAD, and working-tree status; preserve existing changes and confirm ownership before editing shared test infrastructure.
- Use the [existing Fluid harness](tests/minimal-fluid-driver/README.md) and [sea-driver manifest](packages/sea-driver/package.json) for current initialization, package entrypoints, and behavioral limits; follow relocated code if extraction has already occurred.
- Locate the current service/driver selectors in the [repository test packages](../packages/test/) and choose the owning test configuration before editing; do not assume the minimal Fluid harness is the registration target.
- Check installed tools and the selected service's startup, network, and browser prerequisites; record missing prerequisites as blocked validation, not behavioral test results.
- Coordinate any missing package API with its owner instead of implementing the main plan or the independent Codespaces investigation in this assignment.

## Implementation Checklist

- [ ] Locate the existing multi-service/driver test configuration and its selection and lifecycle extension points.
- [ ] Choose and document the SEA backend and transport exercised, including service startup, teardown, storage lifetime, and any prerequisites.
- [ ] Add SEA through those established extension points with an explicit opt-in selector; a named selection must run SEA, not silently substitute another driver.
- [ ] Keep SEA excluded when no opt-in is supplied, including existing default and CI invocations.
- [ ] Add focused checks that verify selection, initialization, and cleanup without suppressing genuine driver failures.
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

Run focused configuration and selection tests first, then the selected SEA suite and relevant existing-service regressions.
Follow [Development](DEVELOPMENT.md) for applicable implementation gates, including canonical Rust-service validation when relevant, scoped policy checks, and repository-root `pnpm build:fast` for registered package or build-input changes.
Run the owning test packages' required checks as well.
Record blocked validation explicitly; setup failure alone is not evidence that the behavioral suite was exercised.

Maintain the command results, configuration decisions, source revision, failure inventory, and remaining blockers in this plan while it is active.
Update its checklist as work proceeds so another agent can continue without chat history.

## Review Boundary and Later Work

Present the initial opt-in integration for review and obtain authorization to commit it.
Stop before the separate failure-remediation project; review and commit of the configuration are prerequisites for that follow-up.

After that boundary, a separately assigned effort can fix failures in focused, independently validated changes, potentially across multiple commits.
Enable SEA by default only after the required suites pass and that change is approved.
After an authorized push, inspect CI results and address newly observed failures.
This plan does not authorize those later changes, commits, pushes, or CI-default changes.

When this assignment is complete, keep run instructions with the owning test package and archive this plan and its evidence under [Historical records](historical/README.md).
Do not start a numbered iteration unless that workflow is separately selected through the [coordination skill](../.github/skills/rust-service-coordination/SKILL.md).