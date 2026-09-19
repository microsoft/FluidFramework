# Iteration 0009 Phase 2 Integration

Status: complete
Integration branch: `rust-service/iteration-0009`
Iteration base commit: `0f3d24a8d363e03463b4e6ab9046e10c75cdfe7f`
Integration commit: the Phase 2 boundary commit containing this report follows accepted HEAD `adab49169ff23385265e6623c7398fd965facb7a`; its self-referential hash is intentionally not embedded

## Accepted Work

Accepted `full-driver-single-writer-capacity` as the sole workstream, in order:

1. Implementation and harness commits `0c4421a9ee9d19b36361c12ec3431bb17cd1b75d` through `4ce44213978284d566500269aa696a7f257db9bf`.
2. Retained raw evidence and comparison `5f2818ec3968407fec43eb9a20b1774e89935d39`.
3. Completed workstream report `adab49169ff23385265e6623c7398fd965facb7a`.

## Rejected or Deferred Work

None rejected or incomplete. Production membership, multi-writer, multi-document, multi-node, power-loss, retention, batching optimization, Routerlicious/ODSP, authentication, and publication remain charter deferrals.

## Conflict Resolution and Adaptation

No conflicts or implementation adaptations. The integration branch fast-forwarded from the kickoff commit to the completed workstream HEAD. Integration-only changes are this report and the manifest status transition.

## Validation Evidence

- Exact implementation checkout `/workspaces/FluidFramework-rust-service-iteration-0009-full-driver-single-writer-capacity`, branch `rust-service-iteration-0009-full-driver-single-writer-capacity`, evidence source `4ce44213978284d566500269aa696a7f257db9bf`, accepted HEAD `adab49169ff23385265e6623c7398fd965facb7a`.
- `cargo fmt --all -- --check` and `cargo test --locked -p fluid-native-service` passed under Rust `1.98.1`; all 13 service tests passed, including `storage_modes_create_submit_and_project` and durable-default coverage.
- Strict Clippy passed for touched native packages with `--no-deps`; WASM `cargo check` and strict browser-wrapper Clippy passed for `wasm32-unknown-unknown` with `web_sys_unstable_apis`.
- The dependency-inclusive touched-package Clippy command exposed three Rust 1.98.1 `clippy::drop_non_drop` findings in unchanged content-addressed and durable-log code. This is recorded as a validation limitation, not silently treated as passing or repaired outside scope.
- Minimal-driver Biome format/lint, both TypeScript typechecks, three Node tests, and all three benchmark bundles passed under Node `22.23.2`. Esbuild emitted only existing export-condition ordering warnings.
- Six 100-edit correctness smokes passed before measurement. The six retained JSON files contain 60 passing 10,000-edit samples from a clean common source commit, exact writer/observer final state, finite distributions, and expected service-process metadata.
- Focused retained-evidence validation and `git diff --check` passed. Root `pnpm-lock.yaml` and `rust-service/Cargo.lock` changes are intentional dependency resolution for the new benchmark/browser wrapper; the Routerlicious lockfile is unchanged.

## Cross-Workstream Findings

- Full-driver application-level throughput was tightly clustered across all six local arms: means span 3.6%, and the three Rust WebTransport storage modes span 1.1%. This does not establish equal production capacity because distributions overlap and the study used one localhost host and one writer.
- Memory, buffered-file, and durable-file operation stores preserve the tested service semantics, but persistence guarantees remain intentionally unequal. Memory cannot reopen; buffered append does not durable-sync acknowledgements; only durable mode uses deployment authority and remains the default.
- The browser-local Rust arm reused the native service rather than duplicating sequencing, but required target-specific Tokio features and a WASM-safe scope source.
- The TypeScript local arm required published `@fluidframework/server-local-server@7.0.1` and a standard `process` shim because the server release group is outside the root workspace.
- Application edit count and protocol message count are distinct. Append-only SharedTree state is the authoritative correctness invariant for this capacity result.

## Artifact Check

The sole active workstream report is complete and accepted. Six raw JSON files and their comparison README are committed. Generated Fluid declarations, WASM bindings, benchmark bundles, certificates, dependency links, and temporary service data remain ignored validation artifacts. The integration worktree is clean except for this integration record and manifest transition before the boundary commit; no unexplained tracked or untracked artifact remains.
