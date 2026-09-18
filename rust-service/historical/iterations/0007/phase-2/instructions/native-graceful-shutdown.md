# Iteration 0007: native-graceful-shutdown Instructions

Status: planned
Branch: `rust-service-iteration-0007-native-graceful-shutdown`
Iteration source commit: `9c65ff3e7b6439a844461d215826491b36bb15e1`
Owner: GitHub Copilot implementation agent
Report: `rust-service/iterations/0007/phase-2/native-graceful-shutdown.md`

## Assignment

Add an explicit bounded shutdown/drain contract to the native WebTransport server without weakening connection limits or the fenced mutation critical section.

Hypothesis: the server can stop accepting new sessions and either drain owned connection futures to a bounded deadline or cancel them explicitly, while preserving `max_connections`, propagating terminal errors, and never moving the non-`Send` fence guard across tasks.

Disprove first with a native test that holds two sessions active, requests shutdown, attempts a third connection, and observes bounded completion plus deterministic disposition of both owned sessions.

## Ownership

Writable: `rust-service/crates/wrappers/webtransport-native/**`, focused files under `rust-service/tests/webtransport-browser/**` needed for shutdown evidence, and `rust-service/iterations/0007/phase-2/native-graceful-shutdown.md`.

Read-only: kernel, sequencer, protocol, content store, browser WASM client, minimal Fluid driver, root workspace manifests/lockfiles, decisions, prior iteration records, and the Fluid reconnect workstream.

Do not detach connection tasks, weaken limits, change kernel semantics, claim graceful QUIC close without observable evidence, or add live projected streaming.

## Expected Evidence

- A small public or internal shutdown control with documented immediate-cancel versus bounded-drain semantics and no detached connection futures.
- Native tests for stop-accepting, active-session disposition, timeout/cancellation, terminal error propagation, and zero active connections at completion.
- A real Chromium check showing existing sessions and a post-shutdown connection attempt behave according to the declared policy without insecure flags.
- Timing, active/peak connection counts, and transport limitations in a complete workstream report.

## Validation

- Print the absolute worktree path, branch, and HEAD with every delegated validation result.
- From `rust-service/`: `cargo fmt --all -- --check`; `cargo clippy --locked -p fluid-webtransport-native --all-targets --all-features -- -D warnings`; `cargo build --locked -p fluid-webtransport-native --all-targets`; `cargo test --locked -p fluid-webtransport-native --all-targets -- --nocapture`.
- Generate fresh browser WASM only if the browser harness contract changes; run the existing two-session Chromium regression and the shutdown-specific Chromium check without insecure flags.
- Run `git diff --check` and immediately prove `Cargo.lock` and the root `pnpm-lock.yaml` are unchanged.

## Escalation and Stopping Conditions

Stop if the design requires detached tasks, leaks guards, changes kernel or sequencer semantics, or cannot distinguish graceful drain from abrupt cancellation. Preserve a minimized native test and report the transport limitation. Any shared protocol, browser-WASM API, root manifest, or lockfile change requires coordinator review before proceeding.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
