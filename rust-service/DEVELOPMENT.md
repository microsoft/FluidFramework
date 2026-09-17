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
node scripts/check-documentation.mjs
```

Run the complete Rust and non-Rust test suite with one command:

```bash
./test.sh
```

The script delegates the complete non-Rust build to the minimal Fluid driver package, runs the Cargo workspace tests, and then delegates all TypeScript, generated WASM, and Chromium tests to that package's `test` script.
The package build uses Fluid build's dependency graph to build its dependencies, generate WASM, check formatting and lint, typecheck, and build the browser bundles.

Run repository policy validation from the repository root after every Rust-service change:

```bash
pnpm policy-check --path rust-service
```

Also run `pnpm build:fast` from the repository root when a change affects a registered pnpm package or a declared input to its build tasks.
For the minimal Fluid driver, those inputs include Rust-service Cargo manifests, `Cargo.lock`, and Rust sources used to generate the WASM clients.
Documentation-only Rust-service changes do not require the repository build.

The installed `wasm-bindgen` CLI must match the crate version pinned by `sea-webtransport`.
See the [browser harness](tests/webtransport-browser/README.md) for the real Chromium WebTransport command and the [minimal Fluid driver](tests/minimal-fluid-driver/README.md) for the SharedTree trace.
Browser validation exercises both client-selected and Sea-selected snapshot participation without changing the server protocol or binary.

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
