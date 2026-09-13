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
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
cargo run -p snapshotted-stream-counter
```

The initial example package name is provisional until the Phase 1 workspace manifest is created. If Phase 1 selects another name, update this document and the foundation report in the same commit.

## Research Records

Phase 1 work is recorded in `foundation-report.md`. Do not wait until the foundation is complete to update it: record falsified hypotheses, repeated failed attempts, substantial effort sinks, human interventions, shared decisions, and reusable process findings as they occur.

Before declaring Phase 1 complete, run:

```bash
node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-foundation
```

After that validation and all commands above pass, commit the foundation. Its commit hash becomes iteration `0001`'s `sourceCommit`.
