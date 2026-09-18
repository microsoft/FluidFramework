# Iteration 0009: full-driver-single-writer-capacity Report

Status: complete
Branch: `rust-service-iteration-0009-full-driver-single-writer-capacity`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0009-full-driver-single-writer-capacity`
Base commit: `0f3d24a8d363e03463b4e6ab9046e10c75cdfe7f`
Final commit: `5f2818ec396` (retained evidence; this completed report follows as a documentation-only commit)
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model version unknown
Instruction source: [`instructions/full-driver-single-writer-capacity.md`](instructions/full-driver-single-writer-capacity.md) at `0f3d24a8d363e03463b4e6ab9046e10c75cdfe7f`
Session or transcript reference: none
Started and finished: 2026-09-13

## Outcome

Implemented and measured a six-arm, full-Fluid-driver SharedTree capacity matrix with one writer and one observer. All 60 retained large-run samples converged to the exact requested append count and final value. Mean end-to-end throughput ranged from 3,210.9 to 3,327.6 logical edits/s, a 3.6% span. Confidence is high in workload equivalence and local correctness, moderate in the reported controlled-host distributions, and low for extrapolation to production capacity.

## Hypothesis Results

- **Fair full-driver workload: supported.** All six 100-edit smoke arms passed before measurement. The retained runs use two full Fluid containers, real append-only SharedTree edits, fixed writer `0`, observer `1`, identical 1,000-edit warmup and 10,000-edit measured bursts, and exact final convergence. See [`../../../benchmarks/shared-tree/4ce44213978/README.md`](../../../benchmarks/shared-tree/4ce44213978/README.md).
- **Rust storage substitution: supported for the tested contracts.** Memory, buffered-file, and durable-file modes share the same native service/sequencer dispatch. Service tests passed, all three WebTransport modes passed the same workload, and durable remains the default. Power-loss equivalence is intentionally not claimed.
- **Capacity rather than round-trip latency: supported.** Submission is a burst without per-edit waits; throughput includes submission plus one final observer convergence. Append-only state proved that all 11,000 requested warmup-plus-measured edits survived. The result remains application-level logical edit throughput rather than sequenced-message or production capacity.

## Deliverables and Commits

1. `0c4421a9ee9d19b36361c12ec3431bb17cd1b75d` - selectable native storage, browser-local Rust service, shared benchmark workload, TypeScript local-service arm, Tinylicious arm, and harness diagnostics.
2. `84f4793ec470d065770582434e426cc3125fada8` - clean-source provenance that excludes only retained benchmark output.
3. `4ce44213978284d566500269aa696a7f257db9bf` - optional external service CPU/RSS capture through `/proc`.
4. `5f2818ec396` - six raw JSON artifacts and the retained methodology/comparison report.

## Validation Evidence

- `cargo test --locked -p fluid-native-service`: passed, 13 tests.
- `cargo fmt --all -- --check`: passed.
- `cargo clippy --locked -p fluid-native-service -p fluid-webtransport-native --all-targets --no-deps -- -D warnings`: passed.
- `RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo check --locked -p fluid-native-service -p fluid-native-service-browser --target wasm32-unknown-unknown`: passed.
- `RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo clippy --locked -p fluid-native-service-browser --target wasm32-unknown-unknown --no-deps -- -D warnings`: passed.
- `pnpm run check:format && pnpm run lint && pnpm run typecheck && pnpm run typecheck:shared-tree && pnpm test && pnpm run build:benchmarks`: passed in `rust-service/tests/minimal-fluid-driver` with Node `22.23.2`.
- Six 100-edit, 10-warmup smoke runs through `benchmark:rust-local`, `benchmark:rust` for all three storage modes, `benchmark:local`, and `benchmark:tinylicious`: passed exact writer/observer convergence.
- Ten repetitions of 10,000 measured edits and 1,000 warmup edits for all six arms: passed. The authoritative machine-readable outputs and aggregate validation are retained under [`../../../benchmarks/shared-tree/4ce44213978/`](../../../benchmarks/shared-tree/4ce44213978/README.md).
- A focused validator checked six files, common source commit/configuration, clean provenance, 60 passing samples, exact final count/value, finite distributions, and expected service-process metadata; `git diff --check -- rust-service/benchmarks/shared-tree/4ce44213978` also passed.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified hypothesis | A root install with `--lockfile=false` was expected to link newly declared workspace dependencies. | The benchmark package lacked `@fluidframework/local-driver` and `@fluidframework/server-local-server`; TypeScript reported uniform `TS2307` failures. | Delayed validation of the TypeScript local-service arm. | Allowed pnpm to update the root importer, used workspace `local-driver`, and pinned published `server-local-server@7.0.1` because the server tree is outside the root workspace. | Verify actual package links and generated outputs after delegated installs; a zero exit code does not prove the intended importer changed. |
| Costly environment issue | Fluid-build incremental state survived the copied worktree while ignored generated `lib/` outputs did not. | Fluid-build reported success in 0.27 seconds, but direct TypeScript resolution still lacked declarations from every linked Fluid package. | Required regeneration of the dependency closure before benchmark validation. | Ran the pnpm dependency-closure build and retained direct package checks as authoritative. | In copied worktrees, invalidate or bypass task caches when generated outputs are absent. |
| Supported hypothesis | The existing native service could back a browser-local memory arm without a second sequencer implementation. | After making Tokio features target-specific in the service and memory crates, `cargo check -p fluid-native-service --lib --target wasm32-unknown-unknown` passed. | Preserved the same native service semantics and full Fluid driver while removing WebTransport from one arm. | Added a raw-frame browser-WASM transport over one memory-configured `NativeService`; separate `InjectedClient` instances share that service. | Probe target compatibility before duplicating a service; dependency feature unions can look like architectural incompatibility. |
| Falsified measurement design | Repeated scalar replacement was expected to prove all logical edits survived. | A final scalar value proves only the last update, and Fluid may batch application edits into fewer messages. | The original metric could not distinguish successful capacity from dropped/coalesced logical work. | Changed the workload to append one number per edit and validate exact array length and final value on both containers. | Capacity benchmarks need an append-only or independently counted state invariant, not only a final-value assertion. |
| Costly runtime issue | Native scope generation through `SystemTime::now()` was expected to work in browser WASM. | The browser-local Rust arm panicked because the WASM target did not provide that system-time path. | Blocked the no-network Rust arm after compilation had succeeded. | Added target-local atomic scope generation while preserving native scope behavior. | A successful WASM compile does not establish runtime portability; smoke the first stateful operation immediately. |
| Undocumented dependency | The published TypeScript local server bundle was expected to run directly in a browser bundle. | Browser execution failed because the package expected the Node `process` global. | Blocked the TypeScript local-service comparison arm. | Injected the standard npm `process` shim into only that benchmark bundle. | Published packages used in browser comparisons may require explicit environment shims even when their APIs are browser-compatible. |
| Falsified provenance check | Writing benchmark JSON under the repository was expected to remain compatible with a clean-source assertion. | Redirecting the first output made the repository dirty before the runner sampled provenance. | Valid measurements were incorrectly labeled dirty. | Excluded only `rust-service/benchmarks/shared-tree/**` from the source-status query and validated the harness from a committed source tree. | Output directories must be excluded narrowly and explicitly from benchmark provenance checks. |
| Validation limitation | Strict Clippy over the touched packages and all workspace path dependencies was expected to pass under Rust 1.98.1. | `snapshotted-stream-content-addressed` and `snapshotted-stream-durable-log-spike` produced three `clippy::drop_non_drop` errors in unchanged code. | The dependency-inclusive command did not pass, although formatting, tests, WASM checks, and strict lints for the touched packages passed. | Re-ran strict Clippy with `--no-deps`; left unrelated dependency cleanup to its owning scope. | Record both the scoped success and broader failure instead of silently weakening or expanding the workstream. |

## Contract and Integration Friction

The browser-local arm required `fluid-native-service` and its memory dependency to compile with target-specific Tokio features. The service storage abstraction had to preserve opaque position types across three backing logs; it therefore uses an internal tagged position and rejects cross-mode positions. Memory mode has no reopen behavior, and only durable mode uses the deployment authority. The TypeScript local-service arm depends on published `@fluidframework/server-local-server@7.0.1` because the server release group is outside the root pnpm workspace. Generated Fluid dependency outputs had to be rebuilt after copying the worktree because incremental state referred to absent ignored outputs.

## Human Interventions

The user rejected earlier latency/offered-load figures as an unfair comparison and required all arms to use full Fluid drivers, real SharedTree operations, one writer, and a large common operation count. That correction established the workload implemented here and prevented partial-driver or per-edit round-trip results from being presented as single-writer capacity.

## Measurements

The retained comparison is [`../../../benchmarks/shared-tree/4ce44213978/README.md`](../../../benchmarks/shared-tree/4ce44213978/README.md). Mean throughput was: Tinylicious 3,327.6; TypeScript local service 3,293.4; Rust local memory 3,254.0; Rust WebTransport buffered file 3,247.4; Rust WebTransport memory 3,232.8; and Rust WebTransport durable file 3,210.9 logical edits/s. The six means span 3.6%; distributions overlap, so no statistical backend ranking is claimed.

Environment: Linux `6.8.0-1064-azure`, AMD EPYC 7763 with 32 logical CPUs visible, Node `22.23.2`, and headless Chrome 152. External service metrics over all ten repetitions were 0.51-0.61 CPU seconds and 15,760-16,080 KiB final/peak RSS for Rust WebTransport, versus 3.46 CPU seconds, 165,332 KiB final RSS, and 168,640 KiB peak RSS for Tinylicious. Browser CPU/RSS, dependency size, and elapsed implementation effort were not measured.

## Proposed Decisions

No shared decision is proposed. Storage selection is benchmark/configuration plumbing, durable file remains the default, and the weaker modes are explicitly guarantee-labeled rather than promoted as production defaults.

## Candidate Skills and Process Changes

- Add a benchmark-harness checklist item: output paths must not make source provenance dirty, while all source and lockfile changes remain visible.
- Add a copied-worktree diagnostic: when generated outputs are ignored, verify declarations/package links directly and invalidate stale incremental build state before trusting a fast successful build.
- Keep the append-only count invariant as the standard trigger for logical-operation capacity studies where protocol batching can differ from application edit count.
- These are candidates for Phase 3 review; no coordination skill was changed during the workstream.

## Remaining Work and Risks

Implementation and measurement are complete. Phase 2 still needs to integrate commits `0c4421a9ee9` through `5f2818ec396`, run the iteration artifact validator and workspace-level checks, and record the immutable integration commit. The artifacts intentionally remain `provisional` because they are controlled-local evidence from one host and run order, not a production qualification. Multi-writer, multi-document, multi-node, restart/power-loss, retention, production membership, Routerlicious/ODSP, and statistically randomized capacity studies remain deferred.
