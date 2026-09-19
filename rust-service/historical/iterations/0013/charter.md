# Iteration 0013 Charter

Status: active
Source commit: `52ad0aa3b4b28498e609d3fe41d9eabcf5f23bd2`
Coordinator: GitHub Copilot

## Questions and Hypotheses

- **Documentation:** Each crate may contain stale, unclear, duplicated, or missing documentation. The hypothesis is that a crate-local audit can improve API navigation and package orientation without changing its public API. The cheapest check is to compare the crate root documentation with its README and inspect the first nontrivial undocumented item.
- **Code quality:** Small confusing or error-prone implementations may admit local simplifications. The hypothesis is that worthwhile cleanup can remain behavior-preserving and crate-local. The cheapest check is strict Clippy plus inspection of the first complex function; speculative refactors are deferred.
- **Tests:** Meaningful branches, invariants, edge cases, or error paths may lack direct coverage. The hypothesis is that focused crate-local tests can close important gaps without redesign. The cheapest check is to inventory functions and methods against existing tests and exercise the first uncovered nontrivial behavior.
- **Breadth:** Some mature crates may need no changes. A no-change result is valid when the report records the audit, validation, and deferred opportunities.

## Active Workstreams

All 14 workstreams are Wave 1 and run concurrently from the same kickoff commit. Each is owned by a GitHub Copilot subagent, has no implementation dependency on another stream, and may write only its package root and generated report.

| Workstream | Writable package | Expected evidence | Stopping condition |
| --- | --- | --- | --- |
| `sea-benchmarks` | `crates/sea-benchmarks/` | Audit, focused improvements, package checks | Stop at workload semantics, dependencies, or cross-crate APIs |
| `sea-compression` | `crates/sea-compression/` | Audit, focused improvements, package checks | Stop at encoded formats, dependencies, or cross-crate APIs |
| `sea-conformance` | `crates/sea-conformance/` | Audit, focused improvements, package checks | Stop at shared contracts, dependencies, or cross-crate APIs |
| `sea-content-addressed` | `crates/sea-content-addressed/` | Audit, focused improvements, package checks | Stop at persistence formats, dependencies, or cross-crate APIs |
| `sea-core` | `crates/sea-core/` | Audit, focused improvements, package checks | Stop at public contracts, dependencies, or cross-crate APIs |
| `sea-encryption` | `crates/sea-encryption/` | Audit, focused improvements, package checks | Stop at encoded formats, cryptographic semantics, dependencies, or cross-crate APIs |
| `sea-file` | `crates/sea-file/` | Audit, focused improvements, package checks | Stop at persistence formats, dependencies, or cross-crate APIs |
| `sea-file-durable` | `crates/sea-file-durable/` | Audit, focused improvements, package checks | Stop at persistence or durability semantics, dependencies, or cross-crate APIs |
| `sea-memory` | `crates/sea-memory/` | Audit, focused improvements, package checks | Stop at shared contracts, dependencies, or cross-crate APIs |
| `sea-sequencer` | `crates/sea-sequencer/` | Audit, focused improvements, package checks | Stop at sequencing semantics, dependencies, or cross-crate APIs |
| `sea-stateful-compression` | `crates/sea-stateful-compression/` | Audit, focused improvements, package checks | Stop at state or encoded formats, dependencies, or cross-crate APIs |
| `sea-webtransport` | `crates/sea-webtransport/` | Audit, focused improvements, native and WASM-aware package checks | Stop at wire formats, generated bindings, dependencies, or cross-crate APIs |
| `sea-webtransport-server` | `crates/sea-webtransport-server/` | Audit, focused improvements, package checks | Stop at wire or service semantics, dependencies, or cross-crate APIs |
| `sea-counter` | `examples/sea-counter/` | Audit, focused improvements, example checks | Stop at production APIs, dependencies, or cross-crate changes |

## Deferred Scope

Cross-crate API changes, dependency changes, wire and persistence-format changes, workspace manifests and lockfiles, generated artifacts, architectural redesign, performance projects, and broad refactors are deferred. Opportunities beyond a small, well-understood crate-local change are recorded in reports rather than implemented.

## Shared Validation

- Every stream runs crate-scoped formatting, strict Clippy, warning-denied rustdoc, tests, `git diff --check`, and scope/lockfile checks. README commands affected by edits are executed.
- Integration runs every canonical command in `rust-service/DEVELOPMENT.md`: workspace format, strict Clippy, warning-denied rustdoc, build, tests, `cargo run -p sea-counter`, documentation checks, generated WASM and TypeScript consumer checks.
- Integration runs `pnpm policy-check --path rust-service` and, because accepted Rust source changes can feed registered generated-WASM tasks, repository-root `pnpm build:fast` when any Rust source or manifest changes.
- No machine-readable evidence is required. Any retained bug reproducer must be an explicitly runnable ignored test whose report records commit, command, expected behavior, actual behavior, and follow-up.

## Risks and Escalation

- Scattershot cleanup can create churn. Agents retain only changes with a concrete readability, maintainability, correctness, documentation, or coverage benefit.
- Documentation can accidentally promise unsupported behavior. Nontrivial claims must agree with implementation and tests.
- New tests can expose larger defects. Small, local, well-understood fixes are allowed; uncertain defects are retained as ignored reproducers when practical and escalated.
- Any required architectural judgment, shared semantic choice, cross-crate edit, public API change, dependency change, format change, workspace manifest change, or lockfile change stops that workstream and becomes deferred evidence.
