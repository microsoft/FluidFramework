# Iteration 0014: sea-webtransport-server Report

Status: complete
Branch: `rust-service-iteration-0014-sea-webtransport-server`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0014-sea-webtransport-server`
Base commit: `122e48a57007da96d4941f1630e7a709224e5296`
Final commit: implementation commit `ea0d12dc916`; this report is committed separately as its immediate successor
Agent or owner: GitHub Copilot
Model and tool version: model and tool version unknown
Instruction source: [`instructions/sea-webtransport-server.md`](instructions/sea-webtransport-server.md) at `122e48a57007da96d4941f1630e7a709224e5296`
Session or transcript reference: none
Started and finished: 2026-09-17 UTC; exact times unknown

## Outcome

Audited the highest-risk connection and logical-stream lifecycle boundaries against their consumers, focused native tests, broader transport evidence, and the iteration `0013` report.
Confirmed and repaired one crate-owned snapshot-stream cleanup gap: after a snapshot stream registered publisher participation, protocol-decode and response-write failures could bypass revocation while the parent connection remained alive.
The repair funnels every post-registration exit through revocation, documents logical-stream cleanup, and adds a deterministic raw-transport regression probe.

Immediate shutdown cleanup and malformed pre-open stream isolation were already adequate and received no additional code or test volume.
Connection-establishment timeout enforcement remains deferred because the public configuration promises a connection-establishment timeout while the HTTP/3 session await is unbounded; repairing and deterministically testing that handshake/resource boundary requires fixture work beyond this bounded cluster.

Confidence is high because the skipped exits and unified cleanup path are direct, the focused reproducer passes, and every owned validation and cleanup guard passes.

## Hypothesis Results

- **Relied-upon contracts: supported.** [`sea-webtransport-server/snapshot-stream-cleanup`](#proposed-quality-inventory-rows) exposed a mismatch between publisher lifecycle needs and error exits after successful stream registration. The README now promises immediate cleanup on logical snapshot-stream loss.
- **Localized regression evidence: supported.** Existing broad malformed-stream coverage proved server survival but did not observe publisher state after malformed traffic on an acknowledged snapshot stream. The extended native test observes the owning server behavior while retaining the live connection.
- **Proportionate repair: supported.** One cleanup funnel, one contract sentence, and one focused regression probe cover the confirmed gap without changing wire or shared service semantics. The focused and full package tests pass.
- **Convergence after prior audit: supported.** The iteration `0013` report prevented repetition of repeated connection-close coverage. Two ranked boundaries were retained as adequate, and one larger timeout boundary was deferred rather than expanded into architecture work.

## Deliverables and Commits

- `rust-service/crates/sea-webtransport-server/src/server.rs`: unified snapshot publisher revocation after every successfully registered stream exit.
- `rust-service/crates/sea-webtransport-server/src/host.rs`: deterministic malformed post-open snapshot-stream regression probe.
- `rust-service/crates/sea-webtransport-server/README.md`: logical snapshot-stream cleanup contract.
- This report, including four proposed quality-inventory rows.
- `ea0d12dc916` (`fix(sea-webtransport-server): clean up failed snapshot streams`): contract, lifecycle repair, and focused regression evidence.
- This report: audit inventory, validation evidence, and deferred risk; committed as the immediate successor to the implementation commit.

## Validation Evidence

- Checkout guard: exact worktree, branch `rust-service-iteration-0014-sea-webtransport-server`, kickoff HEAD `122e48a57007da96d4941f1630e7a709224e5296`, and clean initial status were verified. The kickoff parent is charter source commit `e06794556ebb92d2d33b83577f903e201fd78b2a`.
- `cargo fmt --manifest-path /workspaces/FluidFramework-rust-service-iteration-0014-sea-webtransport-server/rust-service/Cargo.toml --all`: passed.
- `cargo fmt --manifest-path /workspaces/FluidFramework-rust-service-iteration-0014-sea-webtransport-server/rust-service/Cargo.toml --all -- --check`: passed.
- VS Code Rust diagnostics for changed `host.rs` and `server.rs`: no errors.
- Focused test `host::tests::server_survives_malformed_and_abandoned_response_streams`: passed, 1 passed and 0 failed in 0.31 seconds after the fixture corrections described under notable events.
- Exact required `cargo clippy -p sea-webtransport-server --all-targets --all-features -- -D warnings`: deterministically blocked in unchanged dependency `sea-sequencer` by `clippy::too_many_lines`, `clippy::needless_continue`, and `clippy::len_zero`. It produced no diagnostic in the owned crate. Those source paths are outside this workstream's ownership.
- `cargo clippy -p sea-webtransport-server --all-targets --all-features --no-deps -- -D warnings`: passed for all owned targets and features.
- `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-webtransport-server --all-features --no-deps`: passed; generated `sea_webtransport_server/index.html` in the external target directory.
- `cargo test -p sea-webtransport-server --all-targets --all-features`: passed, 8 passed and 0 failed in the library target; binary target contained 0 tests.
- `node scripts/check-documentation.mjs`: passed, 24 roots, 31 READMEs, and 48 local links.
- `cargo fmt --all -- --check`: passed.
- `git diff --check`: passed before implementation commit and after report finalization.
- `Cargo.lock` is unchanged from kickoff.
- Writable-path guard found only `rust-service/crates/sea-webtransport-server/` and this report.
- Process guard found no live `sea-webtransport-server` endpoint. Tests used disposable in-process endpoints and removed their temporary roots; no endpoint was started manually.
- No machine-readable output is required or retained. Build output is isolated at `/workspaces/FluidFramework-rust-service/target-webtransport-server-0014` outside the worktree.

## Behavioral Contracts and Test Layers

The changed production crate is `sea-webtransport-server`.
The relied-upon behavior is that ending an acknowledged snapshot logical stream immediately revokes its publisher participation, even when malformed traffic or failed response I/O ends only that stream and the WebTransport connection remains alive.
The owning contract is the logical-stream lifecycle in `serve_snapshot_stream`, now stated in the crate README.

The focused owning-crate evidence is `host::tests::server_survives_malformed_and_abandoned_response_streams`, extended with `malformed_snapshot_stream_releases_publisher`.
It opens a raw Sea-selected snapshot stream, confirms nomination, sends a complete request for the wrong logical stream, synchronizes on transport stop, and verifies that another participant receives a fence before the malformed connection closes.
No shared conformance test is appropriate because cleanup after transport task failure is server-specific rather than an implementation-independent Sea service law.
Existing native round trips prove client/server composition and storage-mode operation; browser tests prove generated binding and browser WebTransport composition. Neither substitutes for the server-owned publisher-state observation, and neither needed duplication.

### Proposed Quality Inventory Rows

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-webtransport-server/snapshot-stream-cleanup` | `serve_snapshot_stream`; snapshot coordinators and other publishers on the archive | Stream-task errors are isolated from the parent connection, and several `?` exits followed successful publisher registration without revocation. | Every acknowledged snapshot-stream end promptly removes that stream's publisher participation. | Focused native/raw transport plus broader native and browser composition. | Send a wrong-role complete frame after nomination, keep the connection alive, and observe whether another Sea-selected participant receives a fence. | Repaired. | README lifecycle sentence; unified post-registration cleanup; `malformed_snapshot_stream_releases_publisher`. | Focused and full package tests, owned Clippy, rustdoc, formatting, and guards passed. | Revisit if snapshot participation becomes connection-scoped or multiple snapshot streams per connection gain distinct identities. |
| `sea-webtransport-server/immediate-shutdown-cleanup` | `serve_until_shutdown`, `cleanup_services`; process harnesses and hosted sessions | Immediate shutdown cancels in-flight connection futures and must bypass reconnect grace without leaking membership. | Shutdown stops acceptance, cancels owned connections at the deadline, and explicitly cleans each hosted service. | Focused native test `immediate_shutdown_releases_session_without_reconnect_grace`. | Existing test uses 30-second reconnect grace, requests immediate shutdown, and asserts one cancellation and one cleanup. | Already adequate. | None. | Current full package suite passed. | Revisit if connection ownership, drain accounting, or cleanup concurrency changes. |
| `sea-webtransport-server/malformed-stream-isolation` | `serve_connection_streams`; all clients sharing an endpoint | Per-stream protocol failures must not terminate the listener or unrelated connections. | A malformed or partial logical stream fails locally while a fresh valid client remains usable. | Focused native/raw test plus broader browser composition. | Existing test injects malformed prefix and partial frame timeout, then completes valid client operations. | Already adequate. | None. | Current full package suite passed. | Revisit if stream failures begin propagating to connection tasks or endpoint acceptance. |
| `sea-webtransport-server/connection-establishment-timeout` | `serve_until_shutdown`; unauthenticated peers and operators configuring resource limits | `TransportConfig::operation_timeout` documents connection establishment, but `incoming.await` is not timeout-bounded and pending handshakes count against `max_connections`. | Configured establishment and connection-cap limits should bound unauthenticated pending work as documented. | No deterministic focused handshake-stall fixture; shutdown cancellation covers only explicit stop. | Inspect the accept future and attempt a stalled HTTP/3 session that occupies one slot beyond `operation_timeout`. | Deferred by deterministic-test and bounded-cluster stops. | None. | Source comparison confirms the mismatch; no runtime probe retained. | Add a deterministic stalled-handshake fixture or observe pending handshakes exhausting the configured cap, then decide whether to enforce the timeout or narrow the public promise. |

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation tooling | Repeated focused Cargo runs used branch guards, absolute manifests, isolated or canonical target directories, and increased parallelism. | Correctly anchored delegated runs ended with external `SIGINT`/exit `130` during dependency compilation; two other invocations printed sibling-worktree branches and did not execute the requested test. Dedicated terminals then completed all checks. | Delayed validation but did not alter source conclusions or final evidence. | Used dedicated persistent terminals with absolute manifests and an isolated target directory; focused and full validation passed. | Concurrent workstream runners need command isolation that cannot be redirected to another persistent terminal and a lifetime sufficient for cold Rust compilation. |
| Focused test fixture | The initial observer used `NativeSeaClient::coordinate_snapshots`, then the raw fixture moved its certificate digest before opening the observer connection. | Compilation reported no such method on `NativeSeaClient`, followed by Rust move error `E0382` after converting the fixture to raw connections. | Two local test-only corrections were needed; production code was unaffected. | Used two raw authorized connections on an isolated archive and cloned the digest for the first connection. The focused test then passed. | Inspect implicit client roles before using a high-level client as a neutral protocol observer; raw fixtures better isolate server-owned election state. |

## Contract and Integration Friction

`TransportConfig::operation_timeout` promises connection-establishment coverage, but the server does not bound `incoming.await`; addressing the handshake resource boundary requires broader deterministic fixture work and may affect public semantics.
No implementation dependency on another workstream was introduced.
Validation infrastructure was shared with concurrent workstreams and repeatedly redirected or interrupted delegated commands despite absolute-path guards; dedicated terminals resolved the issue.
The exact dependency-inclusive strict Clippy command is blocked by three unchanged `sea-sequencer` lints outside ownership; owned-crate strict Clippy and every other workstream check pass.

## Human Interventions

The coordinator supplied the expected branch, clean kickoff commit `122e48a57007da96d4941f1630e7a709224e5296`, and prohibition on external evaluator material.
No semantic or implementation intervention was needed.

## Measurements

Performance and size measurements are not applicable to this lifecycle repair.
Dependency and manifest counts are unchanged.
The focused test adds one raw connection, one malformed logical request, and one publisher-election observation to an existing native test.
Exact elapsed workstream time, token use, model version, and tool version are unknown.

## Proposed Decisions

No shared decision is proposed for the accepted repair.
The connection-establishment timeout mismatch is deferred for evidence rather than proposed as a semantic decision.

## Candidate Skills and Process Changes

Candidate coordination improvement: give each concurrent workstream an execution channel that preserves its requested absolute worktree and permits cold Cargo builds to complete.
The branch guards prevented cross-worktree validation claims, but repeated redirection and external interruption still blocked required evidence.

## Remaining Work and Risks

- The connection-establishment timeout mismatch remains an intentional deferred finding with the inventory-row revisit trigger above.
- Dependency-inclusive strict Clippy remains blocked by unchanged out-of-scope `sea-sequencer` lints; integration should rerun the canonical command after that workstream is reconciled.
- No temporary endpoint, symlink, environment override, generated artifact, or machine-readable output is retained in the worktree.
- Confidence is high for the accepted repair and adequate-boundary dispositions because focused and full package evidence pass.
