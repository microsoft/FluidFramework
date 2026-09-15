# Known Issues

This file tracks known architecture and organization issues in the Rust service.
Add new issues with a stable identifier, status, severity, evidence, impact, and resolution direction.
Remove resolved entries after their validating change has passed focused tests.

Statuses are `Open`, `In progress`, `Resolved`, and `Deferred`. Severity records
the issue's architectural or maintenance impact, not production readiness; this
project remains an experimental research project.

## RS-002: Storage wrappers are not composable through the native service

- **Status:** Open
- **Severity:** Medium
- **Area:** Service composition
- **Evidence:** Compression, encryption, and stateful compression implement the
  core contracts and are documented as layers between sequencing and storage,
  but `sea-service` neither depends on them nor provides configuration
  for composing them with a selected backend.
- **Impact:** Wrapper compositions are available to direct users and benchmarks
  but cannot be selected in the standard native service. The documented
  architecture therefore describes a broader composition model than the service
  currently exposes. Applying transformations to content-addressed blobs also
  affects digest identity, deduplication, reference validation, and eager-load
  behavior, so record wrappers cannot automatically serve as content wrappers.
- **Resolution direction:** Define transformation domains for canonical records,
  snapshots, and content-addressed objects, then expose valid compositions at
  the service composition root. Keep ordering explicit because compression and
  encryption order affects semantics and efficiency.

## RS-003: The default durable storage name overstates demonstrated guarantees

- **Status:** Open
- **Severity:** High
- **Area:** Durability contract
- **Evidence:** `StorageMode::DurableFile` is the default service mode and is
  described as durable file storage. Its implementation is
  `sea-file-durable`, whose README explicitly limits its
  evidence to recovery after process termination while the operating system
  remains running. It does not demonstrate power-loss, filesystem or hardware
  failure, multi-process writer safety, retention, or replication.
- **Impact:** Callers can reasonably interpret `DurableFile` and
  `Durability::Durable` as stronger guarantees than the backend has established.
- **Resolution direction:** Rename the service mode or make its qualification
  prominent at the API and service README boundaries. Define the durability
  vocabulary precisely before presenting this backend as production-capable.

## RS-006: Large crates concentrate unrelated responsibilities in `lib.rs`

- **Status:** Open
- **Severity:** Medium
- **Area:** Source organization
- **Evidence:** `sea-sequencer`, `sea-service`, and
  `sea-protocol` each combine their public model, implementation,
  codecs or storage adaptation, and extensive tests in one `lib.rs`. Several
  transport and client crates follow the same pattern.
- **Impact:** Navigation, code ownership, and focused review become harder as
  these crates grow. Architectural boundaries visible in documentation are less
  visible in the source layout.
- **Resolution direction:** Split modules along established responsibilities,
  such as protocol messages and codecs; sequencer sessions, projection, and
  fencing; and service documents, content, storage, and subscriptions. Avoid
  changing public APIs solely for file organization.

## RS-007: Operational limits are hardcoded in service implementation

- **Status:** Open
- **Severity:** Medium
- **Area:** Service configuration
- **Evidence:** Canonical and projected read limits, content limits, and buffer
  sizes are constants in `crates/sea-service/src/lib.rs`. `ServiceConfig` exposes
  only the root path and storage mode, while the protocol independently defines
  decoding limits.
- **Impact:** Deployments with different workload or resource constraints need
  source changes, and protocol and service bounds can evolve independently.
- **Resolution direction:** Group operational bounds into validated service
  configuration and make their relationship to protocol limits explicit.

## RS-008: The `wrappers` directory combines distinct architectural roles

- **Status:** Open
- **Severity:** Low
- **Area:** Crate organization
- **Evidence:** `crates/wrappers/` contains transparent storage decorators,
  process transport, native and browser WebTransport endpoints, and an
  in-process browser service adapter.
- **Impact:** The directory name suggests one composition role even though its
  members have different dependency directions, lifecycle concerns, and public
  boundaries.
- **Resolution direction:** Consider grouping crates by role, such as storage
  decorators, transports, and browser adapters, when the benefit outweighs the
  workspace and path churn.

## RS-009: Document load and catch-up are not one coherent operation

- **Status:** Open
- **Severity:** High
- **Area:** Recovery protocol
- **Evidence:** FSP4 exposes `LatestSnapshot` and `SubscribeProjected` as
  independent requests. `SnapshotStore` retains only the latest published
  snapshot, so the service cannot select the newest snapshot at or before a
  client-required canonical position.
- **Impact:** A reconnecting client cannot request a snapshot that preserves the
  history needed to rebase pending local operations. The protocol also lacks one
  operation that establishes the selected snapshot and gap-free catch-up/tail
  boundary together.
- **Resolution direction:** Define an atomic load-and-tail service contract that
  accepts an optional required position, selects a compatible retained snapshot,
  and then delivers every later projected operation through a clearly signaled
  caught-up boundary. Add snapshot history or indexing only to the abstraction
  that owns retention; do not expose position ordering to clients.

## RS-010: Writer lifecycle cannot advance minimum reference reliably

- **Status:** Open
- **Severity:** High
- **Area:** Sequencing and membership
- **Evidence:** The sequencer computes the minimum reference across its writer
  map and replaces writers when new sessions begin, but it has no authoritative
  leave, disconnect, expiry, or eviction transition that removes inactive
  writers. Transport stream closure is not represented in canonical sequencer
  state.
- **Impact:** An abandoned writer can hold the minimum reference indefinitely,
  preventing future retention policy from determining that older history is no
  longer needed. Connection-local cleanup alone would also be unsafe across
  reconnect and service restart.
- **Resolution direction:** Define the authoritative writer-membership lifecycle,
  including reconnect replacement, disconnect grace, inactivity policy, lag
  eviction, and replay. Decide which transitions must be canonical before using
  minimum reference as a retention boundary.

## RS-011: Blob reachability, authorization, and lifetime are not coordinated

- **Status:** Open
- **Severity:** High
- **Area:** Content semantics
- **Evidence:** Blob upload and fetch are service-wide operations identified only
  by digest. Submissions cannot declare referenced blobs, summaries validate only
  their immediate path-to-blob entries, and the content store has no garbage
  collection, access control, pending-upload ownership, or document reachability
  index.
- **Impact:** The service cannot reject an operation whose referenced content is
  missing, prove that a caller may discover or fetch a digest through a document,
  or safely reclaim content after snapshots supersede old operations. Asynchronous
  upload also has no defined lifetime before a blob becomes reachable.
- **Resolution direction:** Specify immutable content graph semantics, document
  reachability and authorization, event and snapshot reference declarations,
  upload staging, publication checks, and retention roots before adding garbage
  collection. Keep security policy above the raw content-addressed store. The
  proposed contract and link-count collection model are documented in
  [BLOB_STORAGE.md](BLOB_STORAGE.md).

## RS-012: Content transfer lacks a streaming protocol

- **Status:** Open
- **Severity:** Medium
- **Area:** Network protocol
- **Evidence:** FSP4 models blob upload and fetch as one request and one bounded
  response per blob. It has no long-lived content stream, request identifiers
  within that stream, partial-result completion, loading hints, eager snapshot
  content, deduplication hints, or flow-control policy.
- **Impact:** Large or related content requires repeated streams and cannot be
  efficiently multiplexed, prioritized, or selected using client cache state.
  Loading behavior is coupled to whole-frame limits rather than content transfer
  policy.
- **Resolution direction:** Define a bounded, multiplexed content-stream protocol
  with request-scoped completion and cancellation. Version loading hints and
  treat unknown hints as optional optimization requests, not correctness inputs.

## RS-013: Read and author stream sessions are not bound together

- **Status:** Open
- **Severity:** Medium
- **Area:** Session protocol
- **Evidence:** The client supplies writer and session identities through
  `OpenSession`. Projected subscriptions and document-bound submission streams
  are opened independently, and the service does not bind an author stream to a
  server-established read session or require that the reader first catch up.
- **Impact:** The intended read-before-write lifecycle and one active author per
  read session are conventions rather than enforced protocol invariants. Session
  ownership across reconnects and competing author streams is therefore less
  explicit than the target flow requires.
- **Resolution direction:** Decide whether sessions are server-issued capabilities
  associated with subscription streams or caller-issued identities validated by
  the sequencer. Then define author-stream binding, takeover, reconnect, and
  closure behavior consistently across protocol, transport, and sequencer.

## RS-014: Snapshot observation and content representation are incomplete

- **Status:** Open
- **Severity:** Medium
- **Area:** Snapshot protocol
- **Evidence:** FSP4 supports fetching the latest opaque snapshot and publishing
  an opaque snapshot payload, but it has no snapshot subscription. Summary
  manifests and snapshots are separate resources, and a snapshot response cannot
  identify a root content object plus optional eagerly included blobs.
- **Impact:** Clients cannot observe snapshot publication as a stream or use one
  snapshot response to seed a content cache while retaining digest-based loading.
- **Resolution direction:** Define whether snapshot payloads remain application
  opaque or reference a canonical root content object. Add a snapshot
  subscription that initially sends the latest snapshot and then sends newer
  snapshots until closure. Its default latest-value semantics may coalesce a
  backlog to the newest snapshot; position-based recovery remains the event
  subscription's responsibility. A future non-coalescing mode requires explicit
  buffering, backpressure, and retention guarantees.

## Explicitly Deferred Capabilities

Cross-host fencing, power-loss qualification, authentication, deployment,
decoded-size policy, and awaitable Fluid teardown are documented future triggers
in `README.md`. They are not tracked above as architecture defects. Retention and
production membership remain deferred as complete capabilities, but RS-010 and
RS-011 track concrete contract gaps that must be resolved before those
capabilities can be designed safely. Add other individual entries only when
evidence identifies a specific design or implementation problem rather than an
intentionally absent capability.
