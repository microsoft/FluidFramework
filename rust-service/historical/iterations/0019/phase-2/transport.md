# Iteration 0019: transport Report

Status: Wave 1 discovery and assessment complete; no repair selected or started
Branch: `rust-service-iteration-0019-transport`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0019-transport`
Base commit: `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475` (user-supplied kickoff)
Final commit: none; Wave 1 is read-only and commits were forbidden
Agent or owner: transport workstream agent
Model and tool version: unknown; repository file-search and file-edit tools only
Instruction source: [transport instructions](instructions/transport.md), read from the assigned checkout
Session or transcript reference: none
Started and finished: 2026-09-24; exact times unavailable
Task labels reserved for later validation: `rs0019 transport test`; `rs0019 transport format`

## Outcome

Completed full-scope Conservative discovery and assessment for
`sea-webtransport` and `sea-webtransport-server` across documentation, tests,
implementation, abstractions, code organization, and naming.
The review covered the shared protocol and client state machines, typed session
adapter, signals, native QUIC, browser WebTransport, browser
`WebSocketStream`, ordinary browser `WebSocket`, server dispatch and host
ownership, QUIC and WebSocket listeners, byte adapters, CLI, guides, manifests,
and owner-local tests.

One small documentation repair (`TR-001`) is the strongest candidate.
One private-file organization repair (`TR-002`) is plausible but lower value.
One exact conversion duplication (`TR-003`) needs cross-workstream ownership
because a reusable owner would cross the crate boundary.
The remaining material hypotheses were rejected, excluded, or found already
proportionate because they would collapse distinct protocol, platform,
diagnostic, cancellation, backpressure, or resource-lifetime guarantees.
No production, test, guide, instruction, shared inventory, manifest, or
generated file was changed.

The user supplied kickoff `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475`,
while the checked-in charter and workstream instruction still name
`575b77e825e598b15b7740f56956fe433a6153d8`.
No command was permitted to resolve checkout identity.
This provenance discrepancy does not alter the source evidence recorded below,
but the coordinator must reconcile it before selecting or reviewing a repair.

## Deliverables and Commits

- Discovery report source commit: `07266b9ad2d`.
- Integrated discovery report commit: `71f0f557489`.
- Production deliverable: none; all assessed transport candidates were
  rejected, deferred, excluded, or already proportionate.

## Responsibility and Coverage Map

| Area | Responsibilities, consumers, and platforms | Contract and nearest discriminating evidence | Six-category result |
| --- | --- | --- | --- |
| `sea-webtransport/src/protocol.rs` and `protocol/signals.rs` | Versioned five-byte envelope, message-kind/role validation, exact postcard payloads, fragmentation/coalescing, bounded allocation, no-blob wire shapes, signal wire values; consumed by both crates and all native/browser transports | [Client architecture](../../../crates/sea-webtransport/README.md#architecture); `every_message_kind_has_one_explicit_byte`, `network_frames_handle_fragmentation_and_coalescing`, `network_decoder_rejects_declared_limit_before_payload_arrives`, `typed_payloads_reject_trailing_bytes_in_both_directions` from inherited 0018 evidence | Documentation/tests/implementation are proportionate. `TR-003` records exact core/wire conversion duplication. Protocol changes are not authorized. Names are stable wire vocabulary; organization keeps the authoritative codec in one module. |
| `client/mod.rs` and `client/framed.rs` | Connection authority, five logical roles, request/receipt correlation, cancellation poisoning, content completion, partial-frame/request deadlines, reusable and subscription stream state; shared by native and browser | README framing/lifecycle contracts; `mismatched_author_receipts_make_the_stream_terminal`, `content_eof_requires_explicit_completion_but_event_eof_does_not`, `cancelled_exchanges_cannot_consume_stale_replies`, signal/snapshot notification tests, and deadline tests | All six categories reviewed. Similar terminal flags and loops encode different completion/notification laws (`TR-004` rejected). Existing separation keeps diagnostics local and preserves cancellation ambiguity. |
| `native.rs` and `signals.rs` | Platform-independent typed `SeaSession`, remote-handle provenance, opening-load reuse, content/author/snapshot pumps, signal queues and terminal priority; native alias and browser-compatible generic implementation | README lifecycle/signal contracts; `matching_load_consumes_opening_prefix_and_continues_live_without_another_stream`, `snapshot_handles_from_another_client_are_rejected_before_transport_access`, `snapshot_pump_explicitly_cancels_transport_on_drop_or_receive_failure`, and signal queue/cancellation tests | Behavior and tests are proportionate. The file name is misleading for shared code (`TR-002`). Public compatibility alias naming is retained (`TR-008`). |
| `transport/native.rs` | Native QUIC endpoint ownership, negotiated datagram admission, bidirectional streams, reset/stop cancellation, operation timeout | `ClientTransport` contract; `datagrams_fall_back_before_admission_and_preserve_admitted_payloads` and configured timeout/reset test | Already proportionate across all categories. Native `Send` bounds, QUIC datagrams, and reset semantics must not be inferred from browser adapters. |
| `transport/browser.rs` | Browser WebTransport establishment, certificate pin, datagram streams, retained JS read promise, shared direction locks, final-owner cancellation | README lifecycle contract and 0018 browser establishment/final-owner fixtures | Already proportionate. `BrowserConnection` and `BrowserStreamState` RAII are required resource owners, not removable wrappers. Browser promise cancellation and lock release are not established by native tests. |
| `transport/browser_socket.rs`, `transport/websocket.rs`, `transport/ordinary_websocket.rs`, and `websocket.rs` | Explicit initial transport selection; WebTransport/WebSocket endpoint trust; native `WebSocketStream`; ordinary `WebSocket`; DATA/FIN records; group/child ownership; read cancellation; concurrent-direction guards; ordinary-socket queue bounds and upload throttling | [Optional fallback](../../../crates/sea-webtransport/README.md#optional-websocketstream-fallback); shared record test and inherited generated/browser tests for fallback, pending reads, overflow, FIN, and cleanup | No consolidation justified. `TR-005` rejects false sharing. WebTransport has datagrams and browser stream locks; `WebSocketStream` has network backpressure; ordinary `WebSocket` only has bounded adapter queues and `bufferedAmount` throttling. |
| `examples/support/lifecycle_controls.rs` | Test-only WASM handles exposing establishment cancellation, explicit disconnect, cloned stream ownership, finish/receive/cancel to browser fixtures | Browser lifecycle README link and inherited 0018 physical-release evidence | Already proportionate. It is intentionally separate from production bindings and should not move into generated or production API code. |
| `server/dispatch.rs` | Fixed-session typed dispatch, content conversion, directory validation, dependency resolution, classified errors, snapshot policies | `SessionDispatcher` contract; directory validation, snapshot dependency, membership-position, author and snapshot tests from 0018 | Implementation/tests are proportionate. Exact conversion copies participate in `TR-003`; moving them without one safe owner would displace complexity or expose API. |
| `server/host.rs` | Lazy backend initialization, document/runtime cache, blocking worker ownership, create/open intent, immutable session binding, signal rooms, reconnect grace, host flush/shutdown | [Server lifecycle](../../../crates/sea-webtransport-server/README.md#connection-lifecycle) and document ownership; registry/worker, intent, signal admission, replacement authority, and shutdown tests inherited from 0018 | Ownership layers are justified. `TR-001` identifies one obsolete contradictory guide paragraph. Registry serialization and retained workers are documented policy, not simplification targets. |
| `server/server.rs` and `stream.rs` | QUIC admission/capacity/liveness, connection cleanup, role routing, framed I/O deadlines, response backpressure, peer cancellation, metrics, drain/flush, transport-neutral send/receive traits | Connection lifecycle and logical authority contracts; admission, idle/partial-frame, content cancellation, malformed connection isolation, and flush tests | Shared `serve_sea_stream` is already the narrow common owner. Stream traits preserve QUIC and socket direction semantics. `TR-006` rejects broader listener unification. |
| `server/websocket.rs` and `websocket_io.rs` | HTTP upgrade policy, exact Origin/subprotocol/path, group token/capacity, control heartbeat, child ownership, bounded one-record reader queue, directional FIN, writer backpressure | [Optional server listener](../../../crates/sea-webtransport-server/README.md#optional-websocket-listener); upgrade/group and byte-adapter tests inherited from 0018 | Already proportionate. WebSocket grouping is not QUIC connection admission, and server socket backpressure is not ordinary browser WebSocket backpressure. |
| `server/main.rs`, both manifests, and both READMEs | Strict CLI/environment parsing, dual-listener startup/shutdown, package feature/target graph, platform and deployment guidance | Server validation section; CLI tests for connection range/cache activation; manifests show target- and feature-specific dependencies | No manifest/dependency candidate. CLI sequence is intentionally local despite length. Guides retain necessary local warnings; only stale authority text is a candidate. |

No assigned area remains unreviewed.
The category profile was Conservative for all six categories; no category was
treated as Off.

## Assessed Candidates

Candidate rankings compare concrete mechanism reduction, confidence, safety
evidence, maintenance value, and cross-workstream cost.
“Deferred” means assessed but not repaired in Wave 1.

### `TR-001` — remove obsolete mutable-session limitation

- **Primary category/profile:** Documentation / Conservative.
- **Responsibility:** Server logical-stream authority documentation.
- **Direct evidence:** The server README first promises that author, content,
  and snapshot streams bind once to an immutable dispatcher and cites Decision
  0026, but its Document Ownership section later says those streams still route
  through the connection's mutable current session and advises avoiding
  replacement. `serve_network_stream` calls `bind_session` before dispatch;
  `HostedSession` delegates to its captured service and removes the connection
  slot only when pointer identity still matches.
- **Consumers/platforms:** Native QUIC and both WebSocket browser paths through
  the shared server dispatcher; operators and custom `SeaConnectionService`
  implementers.
- **Contract/tests:** README Logical Stream Authority; `bind_session` contract;
  0018 replacement-authority regression evidence and Decision 0026.
- **Hypothesis:** Deleting the obsolete limitation paragraph leaves one
  accurate authority explanation and removes contradictory operational advice
  without changing any contract.
- **Cheapest disproof:** Confirm the ignored stale-author reproducer remains
  failing or that any current path passes `HostedConnection`, rather than its
  returned `HostedSession`, to an admitted author/content/snapshot loop.
- **Benefit:** High confidence, small edit; removes a direct contradiction at a
  security-sensitive lifetime boundary.
- **Displaced complexity/supporting edits:** None expected. Preserve the
  adjacent committed-membership and snapshot statements and the Decision 0026
  link.
- **Disposition/rank:** **Deferred to Wave 2 selection; rank 1.**
- **Revisit trigger:** Any evidence that session binding was reverted, or that
  a transport loop does not retain the bound service.

### `TR-002` — rename the shared typed-session source module

- **Primary category/profile:** Code organization / Conservative.
- **Responsibility:** Ownership and discoverability of `SessionClient`,
  `SessionOpen`, `SeaClientError`, remote handles, snapshot pump, and wire/core
  conversions.
- **Direct evidence:** `src/native.rs` contains the platform-independent generic
  session implementation used on both native and `wasm32`; only native
  connection construction is cfg-gated. Internal references are the private
  `mod native`/re-exports in `lib.rs` and `signals.rs` imports. The separate
  `transport/native.rs` actually owns native QUIC primitives.
- **Consumers/platforms:** All native and browser typed sessions; public items
  remain re-exported from crate root.
- **Contract/tests:** Entire typed-client test set, target builds, and public
  root exports; no wire or lifecycle behavior changes.
- **Hypothesis:** A lossless private rename to `session.rs` removes an incorrect
  platform ownership cue and distinguishes typed-session code from
  `transport/native.rs`.
- **Cheapest disproof:** Search for external source-path assumptions or
  rustdoc/generated links to the private module; verify the move can preserve
  all comments, cfg attributes, and root exports unchanged.
- **Benefit:** Moderate discoverability improvement in a large, frequently
  edited file; no runtime mechanism removed.
- **Displaced complexity/supporting edits:** Mechanical `lib.rs` and
  `signals.rs` imports only; a rename must be isolated and lossless.
- **Disposition/rank:** **Deferred to Wave 2 selection; rank 2**, below the
  documentation contradiction because it removes no runtime complexity.
- **Revisit trigger:** Selection capacity after higher-value candidates, or
  further platform-neutral responsibilities added to this file.

### `TR-003` — establish one owner for duplicated core/wire conversions

- **Primary category/profile:** Abstractions / Conservative.
- **Responsibility:** `Event` and `BlobTreeId` conversion between `sea-core` and
  protocol values.
- **Direct evidence:** `event_from_wire`, `event_to_wire`, `tree_from_wire`, and
  `tree_to_wire` are textually and semantically identical in client
  `native.rs` and server `dispatch.rs`. Correctness requires agreement for
  payloads and the fixed blob/directory identity mapping.
- **Consumers/platforms:** Typed native/browser client and native server
  dispatch; generated clients consume the resulting public wire behavior.
- **Contract/tests:** Protocol exhaustive roundtrips, client handle-provenance
  tests, server directory/dependency tests, and native composition tests.
- **Hypothesis:** One authoritative conversion owner can delete four duplicate
  functions without obscuring availability-handle provenance.
- **Cheapest disproof:** Determine whether sharing requires exporting a new
  public protocol helper or importing server-only/core semantics into a layer
  that should remain wire-only. Also verify that independent tests keep
  expected wire values rather than deriving them from the shared helper.
- **Benefit:** Small but real drift prevention for values that must agree.
- **Displaced complexity/supporting edits:** A cross-crate callable surface,
  visibility/API review, both callers, and focused client/server tests.
  Public API changes and cross-owner edits are not authorized here.
- **Disposition/rank:** **Deferred to the registered cross-crate owner; rank
  3.** Do not implement locally unless the coordinator assigns exact paths and
  confirms a non-public owner.
- **Revisit trigger:** Cross-crate selection, a new conversion site, or any
  divergence in identity/event mapping.

### `TR-004` — factor reusable request-state machinery

- **Primary category/profile:** Implementation / Conservative.
- **Responsibility:** Terminal-by-default request loops in author, snapshot,
  signal, and content streams.
- **Direct evidence:** The streams repeat admission checks, request framing,
  deadline starts, receive loops, and terminal restoration.
- **Consumers/platforms:** Every native/browser session operation.
- **Contract/tests:** Ordered-exchange, mismatch, cancellation, content EOF,
  snapshot notification, signal interleaving, and ambiguous-timeout evidence.
- **Hypothesis:** A common helper could remove repeated control flow.
- **Cheapest disproof/result:** Compare completion predicates and side effects.
  Author correlates request-specific receipts and maps append timeouts to
  ambiguity; snapshot consumes/coalesces notifications; signal forwards
  messages with bounded delivery; content waits for an explicit completion
  marker or yields an owned monitored stream. Cancellation and terminal reset
  points differ.
- **Benefit:** Superficial line reduction only.
- **Displaced complexity/supporting edits:** Callbacks or a policy enum would
  hide role-specific diagnostics and lifecycle transitions and require broad
  regression work.
- **Disposition/rank:** **Rejected; rank 6.** Similar syntax does not establish
  one responsibility.
- **Revisit trigger:** A future role adopts exactly the same completion,
  notification, timeout, and cancellation law as an existing role.

### `TR-005` — unify browser transport implementations

- **Primary category/profile:** Abstractions / Conservative.
- **Responsibility:** WebTransport, native `WebSocketStream`, and ordinary
  `WebSocket` byte transport and selection.
- **Direct evidence:** All implement the common client traits, and the selected
  transport enum delegates the same four primitive operations.
- **Consumers/platforms:** Chromium WebTransport, browsers/Node with
  `WebSocketStream`, and Node/Firefox ordinary WebSocket compatibility.
- **Contract/tests:** Fallback table and browser lifecycle tests; queue,
  pending-read, FIN, overflow, and physical-release evidence.
- **Hypothesis:** One browser socket abstraction could remove variant
  delegation and duplicated read/write state.
- **Cheapest disproof/result:** Compare guarantees. WebTransport owns
  certificate pinning, QUIC datagrams, JS stream locks, and independent
  directional cancellation. `WebSocketStream` provides network receive
  backpressure and abortable establishment. Ordinary `WebSocket` cannot
  propagate receive demand and instead owns explicit byte/message caps and
  upload throttling. Their close/EOF APIs and trust boundaries also differ.
- **Benefit:** No reliable concept reduction.
- **Displaced complexity/supporting edits:** Runtime flags, undefined JS
  placeholders, weaker type separation, and broader generated/browser tests.
- **Disposition/rank:** **Rejected; rank 7.** Keep explicit distinctions.
- **Revisit trigger:** Browser APIs converge on the same cancellation,
  backpressure, datagram, and establishment semantics.

### `TR-006` — consolidate QUIC and WebSocket listener lifecycle

- **Primary category/profile:** Abstractions / Conservative.
- **Responsibility:** Server admission, ownership, shutdown, and logical-stream
  serving.
- **Direct evidence:** Both listeners track connection/stream limits, metrics,
  shutdown requests, and service cleanup.
- **Consumers/platforms:** Native QUIC clients and both socket browser modes.
- **Contract/tests:** Admission/capacity, group/token/Origin, heartbeat,
  malformed-connection isolation, stream cancellation, drain and storage-flush
  tests.
- **Hypothesis:** A shared listener runtime could remove duplicated lifecycle
  loops.
- **Cheapest disproof/result:** QUIC admits one multiplexed connection with
  transport liveness and datagrams; WebSocket uses one control socket plus
  token-associated child sockets, application ping/pong, upgrade policy, and
  independent task capacity. The common byte-stream boundary is already
  `SendStream`/`ReceiveStream` plus `serve_sea_stream`.
- **Benefit:** None beyond relocating transport-specific state.
- **Displaced complexity/supporting edits:** Generic listener state,
  configuration branches, less local diagnostics, and risk to cleanup counts
  and reconnect-grace decisions.
- **Disposition/rank:** **Rejected; rank 8.**
- **Revisit trigger:** A third listener demonstrates a second genuinely shared
  admission/lifecycle mechanism beyond the existing stream dispatcher.

### `TR-007` — consolidate transport test fixtures

- **Primary category/profile:** Tests / Conservative.
- **Responsibility:** Scripted byte streams, real-QUIC peers, WebSocket in-memory
  pairs, host storage modes, and browser lifecycle controls.
- **Direct evidence:** Large test modules contain repeated frame send/read and
  setup helpers.
- **Consumers/platforms:** Owner-local Rust tests and distinct generated/browser
  harnesses.
- **Contract/tests:** The 0018 inventory maps each helper/test layer to a
  separate owning decision: codec, exchange state, native admission,
  WebSocket byte adaptation, host persistence, or browser API behavior.
- **Hypothesis:** A broad shared fixture could reduce setup repetition.
- **Cheapest disproof/result:** Check whether a shared helper would preserve
  independent expected wire values, failure stages, storage modes, transport
  cancellation observations, and test-local diagnostics. It would not:
  in-memory sockets cannot prove native QUIC admission, native tests cannot
  execute JS promises, and generated/browser tests intentionally observe
  platform effects.
- **Benefit:** Limited setup reduction.
- **Displaced complexity/supporting edits:** Cross-module fixture API and extra
  navigation; risk of deriving expectations from production codecs.
- **Disposition/rank:** **Excluded; rank 5.** Small local helpers remain
  appropriate; no test or case should be removed.
- **Revisit trigger:** Three or more new tests duplicate the same setup and
  assertions within one owning module and platform.

### `TR-008` — remove or rename compatibility-facing native names

- **Primary category/profile:** Naming / Conservative.
- **Responsibility:** `NativeSeaClient`, `NativeSessionOpen`, and native/browser
  error/config terminology.
- **Direct evidence:** `NativeSessionOpen` is explicitly documented as a
  compatibility alias for generic `SessionOpen`; `NativeSeaClient` accurately
  identifies the certificate-pinned native specialization.
- **Consumers/platforms:** Public Rust API and integration consumers.
- **Contract/tests:** Root re-exports and integration construction sites.
- **Hypothesis:** Removing the alias or normalizing names would reduce apparent
  duplication.
- **Cheapest disproof/result:** The alias is public compatibility surface and
  the specialization expresses a real platform distinction. Removal or rename
  is an unauthorized public API change.
- **Benefit:** Cosmetic only.
- **Displaced complexity/supporting edits:** Consumer migration and API
  reporting.
- **Disposition/rank:** **Excluded; rank 9.**
- **Revisit trigger:** Approved breaking API cycle with consumer migration.

### `TR-009` — merge duplicate client/server transport configuration

- **Primary category/profile:** Abstractions / Conservative.
- **Responsibility:** Client and server `TransportConfig` validation/defaults.
- **Direct evidence:** Both expose frame, connection, stream, and operation
  timeout fields with similar validation.
- **Consumers/platforms:** Native client, QUIC server, optional WebSocket
  server, and integration tests.
- **Contract/tests:** Client timeout/reset evidence versus server admission,
  framed-I/O, liveness, lag, and shutdown evidence.
- **Hypothesis:** One shared configuration type could eliminate duplication.
- **Cheapest disproof/result:** The server additionally owns heartbeat,
  inactivity, reconnect grace, event lag, listener capacity, and per-operation
  framed I/O. Client timeout and browser policy are independently owned.
  Same field names do not imply one lifecycle or default.
- **Benefit:** None; coupling would make client protocol users depend on server
  policy.
- **Displaced complexity/supporting edits:** Public API/dependency changes and
  platform-specific optional fields.
- **Disposition/rank:** **Rejected; rank 10.**
- **Revisit trigger:** A separately approved configuration API redesign with a
  proven shared policy owner.

### `TR-010` — reduce guide overlap

- **Primary category/profile:** Documentation / Conservative.
- **Responsibility:** Architecture, client, and server explanations of protocol,
  fallback, limits, and ownership.
- **Direct evidence:** Some concepts appear in multiple guides.
- **Consumers/platforms:** Application developers, deployers, custom host
  implementers, and browser integrators.
- **Contract/tests:** Links between the architecture and package READMEs; local
  package validation sections.
- **Hypothesis:** Replacing local explanations with links could shorten docs.
- **Cheapest disproof/result:** The client guide owns caller-visible framing,
  fallback, backpressure, and session behavior; the server guide owns
  admission, authorization warnings, storage/runtime lifetime, and shutdown;
  architecture supplies only system placement. Removing local qualifications
  would make safety information harder to discover.
- **Benefit:** Word-count reduction only, except `TR-001`.
- **Displaced complexity/supporting edits:** More navigation and risk of losing
  platform/deployment qualifications.
- **Disposition/rank:** **Already proportionate; rank 4 only as no-change
  evidence.**
- **Revisit trigger:** Verbatim sections begin evolving inconsistently or an
  authoritative contract moves.

## Category Reconciliation and No-Change Evidence

| Category | Completed assessment | Result |
| --- | --- | --- |
| Documentation | Compared both package guides with architecture, known issues, current contracts, source ownership, and inherited 0018 decisions. Preserved local protocol, fallback, authorization, resource, persistence, and shutdown qualifications. | `TR-001` is a confirmed small candidate. General guide deduplication is already proportionate (`TR-010`). |
| Tests | Mapped codec, client-state, typed-session, signal, native QUIC, browser/generated, server dispatch/host, WebSocket listener, byte-adapter, CLI, and integration layers. | No removal or broad fixture extraction is justified (`TR-007`). Layers diagnose distinct owners and platforms; inherited test names remain required. |
| Implementation | Examined codec tables, framed deadlines, role exchanges, pumps, conversions, queue limits, server stream loops, registry workers, shutdown, and CLI. | No Conservative control-flow simplification survives disproof. `TR-004` would hide role-specific correlation and cancellation laws. |
| Abstractions | Examined transport traits, selected browser enum, socket/backend representation, server stream traits, host/service binding, duplicate conversions, and configs. | Only `TR-003` is genuine required agreement, but it needs cross-crate ownership. Browser/listener/config unifications are rejected (`TR-005`, `TR-006`, `TR-009`). |
| Code organization | Checked module ownership, re-exports, feature gates, manifests, lifecycle fixture location, and client/server dependency direction. | `TR-002` is plausible. Protocol ownership, browser fixtures, server stream traits, and separate listener files are otherwise proportionate. |
| Naming | Checked public role/message names, transport modes, aliases, config/error vocabulary, host/session/dispatcher terminology, and private module names. | Only the private `native.rs` module cue merits consideration through `TR-002`. Public compatibility names are excluded (`TR-008`); protocol names remain stable wire vocabulary. |

## Behavioral Contracts and Test Layers

- **Protocol and diagnostics:** Preserve message numbers, role/direction
  validation, exact payload consumption, maximum-frame rejection before
  allocation, no-blob shapes, classified service errors, and local error text
  used to diagnose directory/dependency failures.
- **Correlation:** The protocol intentionally has no correlation ID. Each
  reusable stream admits one ordered request and must match its role-specific
  completion while allowing only its own notification kinds.
- **Cancellation:** A cancelled exchange poisons that stream; ambiguous append
  and snapshot timeouts are not retried. Browser pending reads survive Rust
  waiter cancellation. Final browser owners cancel JavaScript directions;
  server monitored reads observe peer cancellation.
- **Backpressure:** Native QUIC and `WebSocketStream` expose transport demand.
  Server WebSocket child streams use a one-record queue. Ordinary browser
  WebSocket cannot provide receive backpressure and instead fails on per-socket
  queue limits while throttling uploads. These are not interchangeable.
- **Resource lifetime:** Endpoint/connection owners, event/author/content/
  snapshot/signal streams, snapshot and signal pumps, browser JS locks,
  WebSocket groups/children, server connection/stream guards, registry workers,
  retained runtimes, reconnect grace, drain, flush, and host shutdown each have
  distinct owners. No candidate removes one.
- **Platform layers:** Rust unit tests protect codec/state decisions; real QUIC
  tests protect native admission and reset behavior; in-memory WebSocket tests
  protect server byte adaptation; generated/browser tests protect JS promises,
  API selection, actual backpressure boundaries, and physical release.
  Passing one layer cannot substitute for another.

The inherited 0018 quality inventory remains the safety baseline.
No inherited test is proposed for deletion or weakening.

## Validation Evidence

Wave 1 intentionally ran **no commands**, tests, formatters, builds, linters,
or terminal probes.
No result is reported as passing.
The required later-wave task labels are recorded exactly as:

- `rs0019 transport test`
- `rs0019 transport format`

If a repair is selected, the coordinator must first reconcile the kickoff
metadata and then invoke the registered guarded tasks.
At minimum, a crate-local repair requires exact owner tests and crate checks;
browser/generated validation is required only for a changed browser boundary.
Any formatting task must remain crate-scoped and verify `Cargo.lock` unchanged.

## Hypothesis Results

- Supported: one stale contradictory server-guide limitation can likely be
  deleted (`TR-001`).
- Supported but lower value: the platform-neutral typed-session implementation
  has a misleading private file owner (`TR-002`).
- Supported but ownership-blocked: four core/wire conversion helpers require
  semantic agreement and are duplicated across the two crates (`TR-003`).
- Falsified: role request loops, three browser transports, two server
  listeners, test layers, and client/server configs are one shared
  responsibility (`TR-004` through `TR-009`).
- Supported no-change: the remaining guides, protocol tables, transport
  boundaries, resource owners, queue/backpressure policies, fixture layers,
  module boundaries, and public names are proportionate under Conservative
  review.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Provenance discrepancy | User kickoff and checked-in instruction/charter source commits differ. | User supplied `7b56e89...`; both records name `575b77e...`. | Fixed-base review cannot proceed safely until reconciled. | Recorded without running a command or editing shared records. | Workstream reports should preserve both assigned and recorded provenance rather than silently choosing one. |
| Documentation contradiction | Server README contains both immutable per-stream binding and an obsolete mutable-session limitation. | README Logical Stream Authority versus Document Ownership; current `bind_session`/`HostedSession` flow. | Misleads operators at an authority-lifetime boundary. | `TR-001`, highest-ranked Wave 2 candidate. | Reconcile limitation sections after accepted contract repairs. |
| False sharing rejected | Similar browser and listener methods expose materially different guarantees. | Datagram, JS lock, backpressure, grouping, heartbeat, and close/FIN differences. | Avoided a broad abstraction that would hide policy. | `TR-005` and `TR-006` rejected. | Compare failure, cancellation, and resource semantics before sharing transport syntax. |

## Contract and Integration Friction

1. `TR-003` cannot be repaired by this workstream without a coordinator-owned
   cross-crate visibility decision.
2. Browser/generated fixtures remain consumer-owned. No browser candidate may
   be accepted on native evidence alone.
3. The current known intermittent native connection timeout and Chromium
   runner timeout remain unattributed. Passing retries cannot close either
   issue.
4. Protocol, generated-binding, public API, dependency, manifest, lockfile, and
   shared harness changes remain forbidden.
5. The kickoff hash mismatch must be resolved before a fixed-base checkpoint.

## Human Interventions

The user supplied the exact worktree, branch, kickoff commit, Wave 1
read-only constraint, complete scope, Conservative profile, permitted output
path, and task labels.
No additional human intervention occurred.

## Measurements

No performance, size, dependency, timing, command, or line-count measurements
were requested or collected.
Candidate value is qualitative and based on responsibility/mechanism evidence,
not source size.

## Proposed Decisions

1. Consider `TR-001` first in Wave 2.
2. Consider `TR-002` only if the global four-repair budget has room for a
   clarity-only, lossless move.
3. Route `TR-003` to the registered cross-crate owner or leave it deferred.
4. Do not select `TR-004` through `TR-010` without their stated revisit trigger.
5. Reconcile `7b56e89...` versus `575b77e...` before establishing any
   checkpoint base.

## Candidate Skills and Process Changes

No skill change is proposed.
The provenance discrepancy is adequately handled by the existing requirement
to record the approved source commit and use a fixed checkpoint base.

## Remaining Work and Risks

- Coordinator reconciliation and global ranking remain outside Wave 1.
- No candidate is authorized for implementation.
- `TR-001` still needs its cheapest disproof against the coordinator-selected
  fixed source before editing.
- `TR-002` requires a lossless move check covering comments, cfg attributes,
  root re-exports, rustdoc, and generated consumers.
- `TR-003` requires explicit cross-crate ownership and API/visibility review.
- Native/browser/WebTransport/`WebSocketStream`/ordinary WebSocket distinctions,
  protocol values, diagnostics, cancellation, backpressure, and all resource
  lifetimes remain preserved by making no implementation change.
- Wave 1 stops here with complete assigned-area and category reconciliation.
