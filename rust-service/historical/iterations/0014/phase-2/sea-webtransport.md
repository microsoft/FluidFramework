# Iteration 0014: sea-webtransport Report

Status: complete
Branch: `rust-service-iteration-0014-sea-webtransport`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0014-sea-webtransport`
Base commit: `122e48a57007da96d4941f1630e7a709224e5296`
Final commit: implementation commit `02fb8759100e8ba3068481beabaf7e486970ea1b`; this report-only commit cannot embed its own SHA without changing it
Agent or owner: GitHub Copilot
Model and tool version: unknown
Instruction source: [`instructions/sea-webtransport.md`](instructions/sea-webtransport.md) at `122e48a57007da96d4941f1630e7a709224e5296`
Session or transcript reference: none
Started and finished: 2026-09-17; exact times unknown

## Outcome

Audited the highest-risk injected-WASM disconnect contract, then reranked shared correlation cleanup, protocol validation, native cancellation, and browser connection lifecycle against iteration `0013` evidence. Repaired one material WASM adapter mismatch: `AsyncRequestTransport.disconnect` is declared optional, but the adapter rejected transports that omitted it. The adapter now accepts an absent hook while continuing to invoke present hooks and propagate their synchronous failures. Confidence is high because isolated WASM compilation and generated Node runtime probes exercised both cases. The next material candidate, browser connection close, remains deferred to a browser-owned lifecycle test.

## Hypothesis Results

- **Relied-upon contracts: supported.** The generated TypeScript contract permits an `AsyncRequestTransport` without `disconnect`, while `InjectedTransport::disconnect` previously required the member through `call_method`. An exact generated Node probe rejected the old implementation by construction and passes with the repair.
- **Localized regression evidence: supported with a platform-boundary qualification.** Protocol and correlation behavior retain focused Rust tests, while JavaScript member optionality can only be executed after WASM generation. The focused generated Node probes cover absent-hook success and present-hook failure propagation; no native Rust test can observe `JsValue` member lookup.
- **Proportionate repair: supported.** One private helper and one adapter call site align implementation with the existing binding contract without changing binding shape, public Rust APIs, wire format, dependencies, manifests, or lockfiles.
- **Convergence after prior audit: supported.** Iteration `0013` already repaired native stream cancellation and documented protocol declarations. Rechecking those boundaries found adequate focused evidence, allowing this run to stop after one new material mismatch instead of repeating prior work.

## Deliverables and Commits

- `call_optional_method` for optional JavaScript transport hooks.
- Injected transport disconnection that accepts an omitted hook and preserves present-hook errors.
- Implementation commit `02fb8759100e8ba3068481beabaf7e486970ea1b` (`fix(sea-webtransport): honor optional disconnect hook`).
- Report commit: this report-only commit; use branch `HEAD` after checkout because a commit cannot contain its own SHA.

## Validation Evidence

- Isolated focused WASM build with `CARGO_TARGET_DIR=/tmp/sea-webtransport-0014-target RUSTFLAGS='--cfg=web_sys_unstable_apis -C target-feature=+simd128' cargo build --locked -p sea-webtransport --lib --target wasm32-unknown-unknown --release`: passed.
- `wasm-bindgen .../sea_webtransport.wasm --target nodejs --out-dir /tmp/sea-webtransport-0014-node`: passed. A Node probe confirmed `SeaInjectedClient.disconnect()` succeeds when the transport omits `disconnect`; a second probe confirmed `Error("disconnect failed")` from a present hook is propagated. Temporary target and generated output directories were removed.
- Two aggregate `node crates/sea-webtransport/scripts/build-wasm.mjs` attempts were externally interrupted with exit 130 during the initial Cargo build. Neither produced a compiler diagnostic or ran the probe, so neither is claimed as evidence; the isolated equivalent above completed successfully.
- `cargo fmt --all -- --check`: passed.
- `cargo clippy -p sea-webtransport --all-targets --all-features -- -D warnings`: passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-webtransport --all-features --no-deps`: passed.
- `cargo test -p sea-webtransport --all-targets --all-features`: passed, including focused protocol, correlation, stream lifecycle, and native conversion tests.
- `env RUSTFLAGS=--cfg=web_sys_unstable_apis cargo check -p sea-webtransport --target wasm32-unknown-unknown --all-features`: passed.
- `pnpm policy-check --path rust-service` from the repository root: passed.
- `pnpm build:fast` from the repository root: passed.
- `git diff --check`: passed. `rust-service/Cargo.lock` and root `pnpm-lock.yaml` match kickoff. No generated tracked path changed, and all changed paths are within the writable crate and this report.
- Retained machine-readable output: none.

## Behavioral Contracts and Test Layers

The changed production crate is `sea-webtransport`. Its generated `AsyncRequestTransport` interface owns the promise that `disconnect` is optional. `InjectedTransport` owns adapting that JavaScript object to the shared `ClientTransport` contract. The implementation now treats an absent hook as successful resource cleanup and preserves the existing behavior for present hooks.

The exact optional-member behavior is not executable in a native Rust unit test because `wasm` is target-gated and member lookup uses `JsValue`. Focused generated Node runtime probes therefore test the narrowest practical owning boundary. Existing focused Rust tests in `client::tests` separately establish correlation abandonment, disconnect admission state, explicit reconnect, and cancellation delegation. Existing protocol unit tests establish framing, limits, correlation validity, role validation, and typed payload rejection. Generated minimal-driver and browser suites remain composition and real-platform evidence; they do not replace the focused optional-hook probe.

Proposed quality-inventory rows:

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-webtransport/injected-optional-disconnect` | `AsyncRequestTransport` and `InjectedTransport`; generated JavaScript clients | Binding declared an optional member while adapter used mandatory lookup | Omitted `disconnect` is accepted; present hook failures propagate | generated | Construct without the member and call generated `disconnect`; repeat with a throwing hook | repaired | Private optional-call helper and adapter use; contract unchanged | isolated WASM build and two Node probes passed | Revisit if optional transport hooks are generalized or generated runtime tests move into crate ownership |
| `sea-webtransport/shared-correlation-lifecycle` | `ClientState`, `PendingCorrelation`, and shared native/WASM clients | Cancellation, disconnect, and reconnect can leak or admit stale correlations | Pending IDs are completed or abandoned; disconnect clears authority/correlations and blocks requests until explicit reconnect | focused, generated, integration | Compare state transitions and guard drop behavior with focused tests | already adequate | none | package tests passed, including correlation and disconnect tests | Revisit after correlation concurrency or reconnect semantics change |
| `sea-webtransport/protocol-validation` | `protocol` encoder/decoder; client and server protocol consumers | Untrusted framing, limits, role, and correlation inputs | Reject malformed, oversized, wrong-role, and invalid-correlation frames before typed use | focused, integration, platform | Map each validation branch to protocol unit tests and broader consumers | already adequate | none | package protocol tests, Clippy, rustdoc, and WASM check passed | Revisit after protocol version, message kind, framing, or limit changes |

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Contract mismatch | Compared the generated optional transport member with the private adapter. | `disconnect?(): void` contrasted with mandatory `call_method(..., "disconnect", ...)`; isolated Node probe exercises the generated client. | Injected clients using a valid minimal transport could not enter disconnected state. | Repaired with optional lookup; absent and throwing-hook probes passed. | Audit generated interface optionality against adapter lookup semantics, not only generated declaration shape. |
| Validation interruption | The aggregate WASM script was attempted twice. | Both attempts exited 130 during the first Cargo build without diagnostics. | Delayed the focused runtime probe; no failed product check was inferred. | Repeated the same production compile and Node generation with an isolated target directory, then removed temporary output. | Isolate Cargo targets when concurrent workstreams interrupt shared-target WASM generation. |

## Contract and Integration Friction

The JavaScript optional-member boundary requires generated WASM runtime evidence rather than a native Rust unit test. Adding a permanently integrated Node assertion belongs to the read-only generated-consumer test packages and is left for integration. No shared API or cross-workstream implementation change was required.

## Human Interventions

The user supplied the authoritative worktree, expected branch, and kickoff commit. No semantic or implementation intervention was required.

## Measurements

Performance and size measurements: not applicable; no algorithm, wire representation, or retained generated artifact changed. Dependency and manifest changes: zero. Environment: Linux dev container with the repository-pinned Rust toolchain and installed `wasm32-unknown-unknown` target; exact elapsed time and token use unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

No new skill change is proposed. The existing quality workflow's contract-to-adapter comparison exposed the mismatch, and isolated target guidance already exists in the coordination skill.

## Remaining Work and Risks

- `BrowserTransport::disconnect` remains a no-op despite the connection-close contract. As recorded in iteration `0013`, revisit it only with a focused real-browser assertion that distinguishes client close from stream close and verifies connection resource release.
- The focused optional-hook probes are recorded but not retained because generated-consumer test paths are outside this workstream's ownership. Integration should add the absent-hook case to the existing generated Node lifecycle suite if permanent platform-boundary regression coverage is desired.
- No temporary target, generated output, lockfile change, or other intentional artifact remains. Confidence is high for the repaired boundary and adequate reviewed boundaries.
