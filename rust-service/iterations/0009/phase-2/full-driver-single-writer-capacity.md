# Iteration 0009: full-driver-single-writer-capacity Report

Status: in progress
Branch: `rust-service-iteration-0009-full-driver-single-writer-capacity`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0009-full-driver-single-writer-capacity`
Base commit: `0f3d24a8d363e03463b4e6ab9046e10c75cdfe7f`
Final commit: <!-- TODO(required): record the final commit or explain why none exists -->
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model version unknown
Instruction source: [`instructions/full-driver-single-writer-capacity.md`](instructions/full-driver-single-writer-capacity.md) at `0f3d24a8d363e03463b4e6ab9046e10c75cdfe7f`
Session or transcript reference: none
Started and finished: started 2026-09-13; finish in progress

## Outcome

<!-- TODO(required): summarize completed scope, result, and confidence -->

## Hypothesis Results

<!-- TODO(required): state which charter hypotheses were supported, falsified, or remain inconclusive and link evidence -->

## Deliverables and Commits

<!-- TODO(required): list deliverables and ordered commits -->

## Validation Evidence

<!-- TODO(required): list exact commands, outcomes, relevant test names, and retained machine-readable output -->

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified hypothesis | A root install with `--lockfile=false` was expected to link newly declared workspace dependencies. | The benchmark package lacked `@fluidframework/local-driver` and `@fluidframework/server-local-server`; TypeScript reported uniform `TS2307` failures. | Delayed validation of the TypeScript local-service arm. | Allowed pnpm to update the root importer, used workspace `local-driver`, and pinned published `server-local-server@7.0.1` because the server tree is outside the root workspace. | Verify actual package links and generated outputs after delegated installs; a zero exit code does not prove the intended importer changed. |
| Costly environment issue | Fluid-build incremental state survived the copied worktree while ignored generated `lib/` outputs did not. | Fluid-build reported success in 0.27 seconds, but direct TypeScript resolution still lacked declarations from every linked Fluid package. | Required regeneration of the dependency closure before benchmark validation. | Ran the pnpm dependency-closure build and retained direct package checks as authoritative. | In copied worktrees, invalidate or bypass task caches when generated outputs are absent. |
| Supported hypothesis | The existing native service could back a browser-local memory arm without a second sequencer implementation. | After making Tokio features target-specific in the service and memory crates, `cargo check -p fluid-native-service --lib --target wasm32-unknown-unknown` passed. | Preserved the same native service semantics and full Fluid driver while removing WebTransport from one arm. | Added a raw-frame browser-WASM transport over one memory-configured `NativeService`; separate `InjectedClient` instances share that service. | Probe target compatibility before duplicating a service; dependency feature unions can look like architectural incompatibility. |

## Contract and Integration Friction

<!-- TODO(required): record shared API limitations, cross-workstream dependencies, and undocumented exceptions; write none when there were none -->

## Human Interventions

<!-- TODO(required): record decisions or corrections supplied by a person and why they were needed; write none when there were none -->

## Measurements

<!-- TODO(required): report applicable performance, size, dependency, and effort measurements with environment metadata; mark non-applicable fields -->

## Proposed Decisions

<!-- TODO(required): link decision records or state that no shared decision is proposed -->

## Candidate Skills and Process Changes

<!-- TODO(required): describe reusable triggers and procedures, supported by the event above; write none when there were none -->

## Remaining Work and Risks

<!-- TODO(required): enumerate unfinished work, intentional artifacts, confidence, and recommended next instructions -->
