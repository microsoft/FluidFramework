# Development

The Rust service is an application workspace and commits its root `Cargo.lock`. Individual library crates do not carry separate lockfiles.

The toolchain is pinned by `rust-toolchain.toml` and includes `rustfmt` and Clippy. Run commands from `rust-service/`.

## Canonical Workspace Commands

Run these commands before completing Rust-service implementation or integration, including lightweight work and every Phase 2 integration boundary.
Package-scoped checks remain useful during a workstream, but do not replace this workspace-wide gate.

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
node scripts/check-documentation.mjs
```

Run the complete Rust and non-Rust test suite with one command:

```bash
./test.sh
```

The script delegates the complete non-Rust build to the Fluid integration harness, runs the Cargo workspace tests, and then runs that package's aggregate `test:all` task.
The aggregate includes package-owned driver, direct SharedTree, and neutral session tests and type assertions, as well as the remaining integration and Chromium scenarios.
The harness depends on the reusable `@fluidframework/sea-driver` and `@fluidframework/sea-tree` packages under `packages/`.
The package build uses Fluid build's dependency graph to build its dependencies, generate WASM, check formatting and lint, typecheck, and build the browser bundles.

Run repository policy validation from the repository root after every Rust-service change:

```bash
pnpm policy-check --path rust-service
```

Also run `pnpm build:fast` from the repository root when a change affects a registered pnpm package or a declared input to its build tasks.
For `sea-typescript`, those inputs include Rust-service Cargo manifests, `Cargo.lock`, and Rust sources used to generate the WASM clients.
Documentation-only Rust-service changes do not require the repository build.

The installed `wasm-bindgen` CLI must match the dependency version pinned by `sea-wasm`, which owns the generated bindings.
See the [browser harness](tests/webtransport-browser/README.md) for the real Chromium WebTransport command and the [Fluid integration harness](tests/sea-integration-tests/README.md) for the SharedTree trace.
Browser validation exercises both client-selected and Sea-selected snapshot participation without changing the server protocol or binary.

## Documentation Policy

Every hand-authored named Rust or TypeScript type, field, variant, trait or
interface member, function, method, constructor, and public module should have a
concise useful doc comment. A short sentence is sufficient when it explains
purpose, semantics, an invariant, or a constraint rather than restating the
identifier. Generated files, anonymous structural types, obvious local
variables, callbacks, and trivial test bodies do not require comments.

Document consequential behavior at the narrowest contract that consumers rely
on. This includes internal traits, functions, and component boundaries when
callers in the same crate or sibling crates depend on their behavior; public API
visibility is not the test for whether a contract matters. Callers should rely
only on behavior promised by that contract, not on incidental details inferred
from its current implementation. Avoid turning implementation choices into
promises unless consumers genuinely require them.

Use layered evidence for a documentation audit:

- compiler `missing_docs` diagnostics establish the public Rust baseline;
- a language-aware declaration/member inventory covers private Rust and
	TypeScript surfaces that normal linting does not enforce; and
- package and grouping READMEs explain purpose, entry points, guarantees,
	limitations, relationships, and executable validation commands.

Record the inventory rule and every exemption when claiming complete coverage.
The documentation checker verifies README presence and local filesystem targets;
it does not validate Markdown anchors, external URLs, declaration coverage, or
semantic accuracy.

## Behavioral Test Policy

Test consequential behavior as close as practical to the code responsible for
providing it. Prefer evidence in this order:

1. a focused unit test in the owning module;
2. a focused test elsewhere in the owning crate when fixtures, private access,
   or established test organization make that clearer;
3. a conformance test when multiple implementations must satisfy one contract;
4. an integration test for behavior that crosses a crate, process, transport,
   generated-binding, or platform boundary; and
5. a real browser test only for evidence that requires browser APIs or behavior.

These layers may coexist when they prove distinct responsibilities. A
conformance test protects shared substitutability but need not localize a defect
in one implementation. An integration or browser test protects composition but
should not be the only regression test for behavior owned by one Rust module or
crate when focused coverage is practical. Do not repeat the same assertion at
every layer merely to increase coverage.

For a bug fix, identify the violated contract before changing code. Inspect each
production crate changed by the fix and normally update the focused tests and
contract documentation needed to prevent recurrence or make relied-upon
behavior explicit. If a changed crate needs no test or documentation change,
record why existing evidence is sufficient or why another boundary owns the
guarantee. Use the smallest test that would fail for the defect for the intended
reason, then retain broader tests only when they establish additional boundary
confidence.

Apply this policy in proportion to risk. Trivial private mechanics do not need
their own prose and tests when observable behavior is already covered clearly.
Do not pursue a coverage percentage, exhaustive comments, or low-value test
volume. Prefer deterministic tests, useful failure messages, and consolidation
or deletion when overlapping evidence no longer proves distinct behavior.

## Research Records

Past plans, foundation work, iteration records, decisions, and benchmark evidence live in [Historical records](historical/README.md).
Use the [coordination skill](../.github/skills/rust-service-coordination/SKILL.md) to choose lightweight work or a full iteration and to run the current process.
Use the [quality-iteration skill](../.github/skills/rust-service-quality-iteration/SKILL.md) for risk-driven contract and regression-test audits, inventory evidence, and stopping conditions.
New iteration records also live under `historical/iterations/`; completed records remain append-only history.
Record falsified hypotheses, repeated failed attempts, substantial effort sinks, human interventions, shared decisions, and reusable process findings as they occur.
The [historical learning index](historical/LEARNINGS.md) records observations, not additional prerequisites for contributors.
Promote an applicable rule into its owning contract, this guide, or a reusable skill rather than requiring readers to reconstruct the development history.
Treat recorded claims as evidence to inspect: verify the named checkout, failing behavior, test assertions, and completed command results before accepting a repair.
New benchmark output belongs outside the repository unless it supports a retained, dated result; include unsuccessful outcomes and guarantee differences when retaining a dataset.
