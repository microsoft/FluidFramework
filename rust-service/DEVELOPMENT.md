# Development

The Rust service is an application workspace and commits its root `Cargo.lock`. Individual library crates do not carry separate lockfiles.

The toolchain is pinned by `rust-toolchain.toml` and includes `rustfmt` and Clippy. Run commands from `rust-service/`.

## Canonical Workspace Commands

Run these commands before completing the foundation and at every Phase 2
integration boundary. Package-scoped checks remain useful during a workstream,
but do not replace this workspace-wide gate.

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
cargo run -p snapshotted-stream-counter
node scripts/check-documentation.mjs
```

The initial example package name is provisional until the Phase 1 workspace manifest is created. If Phase 1 selects another name, update this document and the foundation report in the same commit.

## Documentation Policy

Every hand-authored named Rust or TypeScript type, field, variant, trait or
interface member, function, method, constructor, and public module should have a
concise useful doc comment. A short sentence is sufficient when it explains
purpose, semantics, an invariant, or a constraint rather than restating the
identifier. Generated files, anonymous structural types, obvious local
variables, callbacks, and trivial test bodies do not require comments.

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

## Research Records

Phase 1 work is recorded in `foundation-report.md`. Do not wait until the foundation is complete to update it: record falsified hypotheses, repeated failed attempts, substantial effort sinks, human interventions, shared decisions, and reusable process findings as they occur.

Before declaring Phase 1 complete, run:

```bash
node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-foundation
```

After that validation and all commands above pass, commit the foundation. Its commit hash becomes iteration `0001`'s `sourceCommit`.
