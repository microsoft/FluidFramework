# Iteration 0012 Charter

Status: active
Source commit: `1625f1d161a8f1eca2e51c811bb6b29e15ac1fd5`
Coordinator: GitHub Copilot

## Questions and Hypotheses

- **Declaration documentation:** Hand-authored Rust and TypeScript declarations may be understandable only by reading their implementations. The hypothesis is that every named type and member can receive a concise, useful doc comment without changing behavior. The cheapest check is a declaration inventory that classifies each item as documented, narrowly exempted as self-evident, or generated and excluded.
- **Folder orientation:** Important package and grouping folders lack a local explanation of their purpose, contents, constraints, and validation. The hypothesis is that short local READMEs can make every package and architectural grouping independently discoverable. The cheapest check compares discovered package/group roots with README presence and required content.
- **Documentation accuracy:** Existing comments and READMEs may be stale after eleven iterations. The hypothesis is that tracing each operational or semantic claim to code and tests will find correctable omissions or contradictions. The cheapest disproof is an audited claim inventory with no mismatch.
- **Quality reinforcement:** Documentation work can expose missing tests or reproducible defects without expanding into redesign. A stream succeeds with complete inventories, accurate docs, focused tests for unsupported important claims, and fixes only for reproduced defects.

Documentation completeness means that every hand-authored named Rust or TypeScript type, field, variant, trait or interface member, function, method, constructor, and public module in owned production source has a useful doc comment. Named test fixtures and helpers require comments when their role or invariant is not evident. Generated files, anonymous structural types, obvious local variables, and trivial test bodies are excluded. One sentence is sufficient when it explains purpose or semantics rather than restating the identifier. Every exemption must be listed in the workstream report.

## Active Workstreams

All six workstreams are Wave 1 and run concurrently from the same kickoff commit.

| Workstream | Owner | Dependencies | Writable paths | Expected evidence | Stopping condition |
| --- | --- | --- | --- | --- | --- |
| `kernel-storage-quality-docs` | GitHub Copilot subagent | None | `crates/core`, `crates/conformance`, `crates/memory`, `crates/file-simple`, `crates/content-addressed`, its report | Declaration inventory, complete useful rustdoc, package READMEs, claim-to-test audit, focused fixes | Stop on public trait, persistence format, dependency, or shared semantic changes |
| `protocol-service-quality-docs` | GitHub Copilot subagent | Read-only core contracts | `crates/protocol`, `crates/fluid-sequencer`, `crates/service`, its report | Protocol/session/service rustdoc and READMEs, cross-layer claim audit, focused fixes | Stop on wire compatibility, sequencing semantics, public API, or dependency changes |
| `transformation-quality-docs` | GitHub Copilot subagent | Read-only core contracts | `crates/wrappers/compression`, `encryption`, `stateful-compression`, its report | Complete rustdoc, package READMEs, composition/limits/error documentation, focused fixes | Stop on encoded format, wrapper contract, public limit, or dependency changes |
| `transport-client-quality-docs` | GitHub Copilot subagent | Read-only protocol/service contracts | `crates/client`, network/native/browser transport wrappers, WASM/browser tests, its report | Rust/TypeScript inventory, rustdoc/JSDoc, package READMEs, lifecycle claim checks | Stop on protocol, generated binding source, browser API, public API, or dependency changes |
| `fluid-driver-quality-docs` | GitHub Copilot subagent | Read-only generated bindings and Fluid contracts | `tests/minimal-fluid-driver`, its report | Complete JSDoc including `wasmClient.ts`, README audit, lifecycle/benchmark claim checks, focused fixes | Stop on Fluid public API, generated bindings, benchmark semantics, or dependencies |
| `examples-benchmarks-quality-docs` | GitHub Copilot subagent | Read-only production crates | benchmark and spike crates, examples, benchmark records, scripts, its report | Example/spike rustdoc and READMEs, evidence documentation, documentation-check recommendation | Stop on production semantics, workload redesign, retained evidence rewriting, or dependencies |

## Deferred Scope

Public API redesign, wire and persistence-format changes, new features, performance optimization, generated artifact edits, dependency changes, production qualification, retention, membership, authentication, and deployment remain deferred. Root manifests, lockfiles, project-level documentation, accepted decisions, and shared iteration tooling are coordinator-owned. Workstreams propose shared changes in reports. Repository-wide lint or script enforcement is deferred to integration until inventories show that the rule is accurate and maintainable.

## Shared Validation

- Each stream records absolute checkout, branch, kickoff commit, tool versions, exact commands and statuses, final status, declaration counts, exemptions, and README coverage.
- Package-scoped format, strict lint, doc build, tests, and documented README commands for every touched package.
- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps`, `cargo build --workspace --all-targets`, `cargo test --workspace --all-targets --all-features`, and `cargo run -p snapshotted-stream-counter` after integration.
- Fresh Node and browser WASM generation plus exact consumer tests where transport or driver documentation is touched; generated output remains ignored and uncommitted.
- Minimal-driver format, lint, build, main and SharedTree typechecks, unit tests, and benchmark bundle builds.
- Integration verifies every Cargo package, executable example, test package, and important grouping folder (`crates`, `crates/wrappers`, `crates/spikes`, `examples`, `tests`, and `benchmarks`) has a useful README, excluding generated outputs, `target`, dependencies, retained result leaf directories, and iteration records.
- Local Markdown links must resolve. Any retained machine-readable inventory must parse, identify the kickoff commit and owned paths, contain nonnegative counts whose classifications sum to the total, and list every exemption.
- Root and Rust lockfiles remain unchanged; run `git diff --check` and iteration-record validation at kickoff, Phase 2, and completion.

## Risks and Escalation

- Boilerplate comments can satisfy counting while reducing clarity. Reviews reject comments that merely repeat names and sample representative declarations from every owned package.
- Documentation can accidentally promise semantics not implemented. Every nontrivial guarantee must cite an existing test or gain a focused regression test before the claim is retained.
- Rust and TypeScript descriptions of positions, acknowledgement, reconnect, and errors can drift. Contradictions are reported for coordinator reconciliation; agents do not change shared semantics independently.
- Repository-wide `missing_docs` can include generated or intentionally private surfaces. Workstreams inventory first; the coordinator adopts enforcement only with explicit, narrow exclusions.
- README commands can be stale or expensive. Agents execute owned commands and report environmental blockers rather than weakening claims.
- Any public API, wire/persistence format, dependency, root manifest, generated artifact, benchmark workload, or shared semantic change stops the stream for coordinator review. Quality work remains bounded after complete inventories, documentation, focused validation, and residual-risk reporting.
